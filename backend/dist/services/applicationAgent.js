import puppeteer from 'puppeteer';
import { database } from '../database/index.js';
import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import * as fs from 'fs';
// Helper function for delays (works across all Puppeteer versions)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Initialize Anthropic client only if API key is available
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    });
}
export const applicationAgent = {
    async applyToJob(jobListingId, config) {
        const job = database.prepare('SELECT * FROM job_listings WHERE id = ?')
            .get(jobListingId);
        if (!job) {
            return { success: false, status: 'error', message: 'Job not found' };
        }
        try {
            console.log(`🚀 Starting application process for: ${job.title} at ${job.company}`);
            // Generate personalized cover letter using AI
            const coverLetter = await this.generateCoverLetter(job, config);
            // Use Puppeteer to apply
            const result = await this.submitApplication(job, config, coverLetter);
            // Save application record
            const stmt = database.prepare(`
        INSERT INTO job_applications (
          jobListingId, status, appliedAt, applicationMethod,
          coverLetter, resumeUsed, confirmationUrl, finalApplicationUrl, atsType
        ) VALUES (?, ?, datetime('now'), 'automated', ?, ?, ?, ?, ?)
      `);
            stmt.run(jobListingId, result.status, coverLetter, config.resumePath, result.confirmationUrl || null, result.finalUrl || job.jobUrl, result.atsType || null);
            // Update job status
            database.prepare('UPDATE job_listings SET status = ? WHERE id = ?')
                .run('applied', jobListingId);
            console.log(`✅ Application ${result.success ? 'successful' : 'failed'}: ${result.message}`);
            return {
                success: result.success,
                status: result.status,
                message: result.message,
                appliedAt: new Date().toISOString(),
                confirmationUrl: result.confirmationUrl,
                finalUrl: result.finalUrl,
                atsType: result.atsType,
            };
        }
        catch (error) {
            console.error(`❌ Error applying to job ${jobListingId}:`, error);
            return {
                success: false,
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
    async generateCoverLetter(job, config) {
        try {
            if (!anthropic || !process.env.ANTHROPIC_API_KEY) {
                console.log('⚠️ Anthropic API key not configured, using default cover letter');
                return config.coverLetterTemplate || this.getDefaultCoverLetter(job, config);
            }
            const prompt = `Write a professional cover letter for this job application:

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Job Description: ${job.description || 'Not provided'}

Applicant Profile:
- Name: ${config.userProfile.fullName}
- Skills: ${config.userProfile.skills || 'Not specified'}
- Experience: ${config.userProfile.experience || 'Not specified'}

Write a concise, professional cover letter (3-4 paragraphs) that:
1. Expresses interest in the position
2. Highlights relevant skills and experience
3. Explains why you're a good fit
4. Includes a professional closing

Keep it under 400 words.`;
            const message = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 800,
                messages: [{ role: 'user', content: prompt }],
            });
            const content = message.content[0];
            if (content.type === 'text') {
                return content.text;
            }
            return config.coverLetterTemplate || this.getDefaultCoverLetter(job, config);
        }
        catch (error) {
            console.error('Error generating cover letter:', error);
            return config.coverLetterTemplate || this.getDefaultCoverLetter(job, config);
        }
    },
    getDefaultCoverLetter(job, config) {
        return `Dear Hiring Manager,

I am writing to express my interest in the ${job.title} position at ${job.company}. 

With my background in ${config.userProfile.skills || 'software development'} and experience in ${config.userProfile.experience ? config.userProfile.experience.substring(0, 100) + '...' : 'the field'}, I am confident that I would be a valuable addition to your team.

I am excited about the opportunity to contribute to ${job.company} and would welcome the chance to discuss how my skills and experience align with your needs.

Thank you for your consideration.

Best regards,
${config.userProfile.fullName}`;
    },
    async submitApplication(job, config, coverLetter) {
        let browser;
        let finalUrl = job.jobUrl;
        let confirmationUrl = null;
        let detectedATS = null;
        const flowSteps = [];
        try {
            console.log(`🌐 Opening browser for: ${job.jobUrl}`);
            flowSteps.push(`Step 1: Opening browser`);
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            console.log(`📄 Navigating to: ${job.jobUrl}`);
            flowSteps.push(`Step 2: Navigating to ${job.jobUrl}`);
            await page.goto(job.jobUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            // Wait for page to fully load (handle "Just a moment..." pages)
            let pageTitle = await page.title();
            let attempts = 0;
            while ((pageTitle.includes('Just a moment') || pageTitle === '' || pageTitle === 'Loading...') && attempts < 10) {
                console.log(`  ⏳ Waiting for page to load (attempt ${attempts + 1})...`);
                await delay(2000);
                pageTitle = await page.title();
                attempts++;
            }
            // Additional wait for dynamic content
            await delay(3000);
            // Log page title and URL for debugging
            finalUrl = page.url();
            console.log(`📋 Page loaded: ${pageTitle}`);
            console.log(`🔗 Current URL: ${finalUrl}`);
            flowSteps.push(`Step 3: Page loaded - ${pageTitle}`);
            flowSteps.push(`Step 4: Current URL - ${finalUrl}`);
            // Check if we're on a search results page instead of individual job
            // But be less aggressive for certain platforms that use different URL structures
            const isSearchResults = await page.evaluate(() => {
                const url = window.location.href.toLowerCase();
                const bodyText = document.body.textContent?.toLowerCase() || '';
                // Strong indicators of search results
                const hasMultipleJobCards = document.querySelectorAll('[class*="job-card"], [class*="job-listing"], [data-testid*="job-card"]').length > 3;
                const hasSearchResultsText = bodyText.includes('search results') ||
                    (bodyText.includes('found') && bodyText.includes('jobs') && bodyText.includes('matching'));
                const hasPagination = !!document.querySelector('[class*="pagination"], [class*="page-number"]');
                // For Monster, be more lenient - they use /jobs/ in their URLs
                const isMonster = url.includes('monster.com');
                if (isMonster) {
                    // Monster uses /jobs/ in individual job URLs too, so check for other indicators
                    return hasMultipleJobCards && hasPagination;
                }
                // For other platforms, use stricter detection
                return (url.includes('/jobs/') && !url.includes('/job/') && hasMultipleJobCards) ||
                    (hasSearchResultsText && hasMultipleJobCards) ||
                    (hasMultipleJobCards && hasPagination);
            });
            if (isSearchResults) {
                console.log('  ⚠️ Detected search results page, not individual job posting');
                flowSteps.push('Step 5: ERROR - Search results page detected');
                return {
                    success: false,
                    status: 'error',
                    message: 'This URL appears to be a search results page, not an individual job posting. Please click through to an individual job and use that URL.',
                    finalUrl,
                };
            }
            // Detect if redirected to third-party ATS
            detectedATS = this.detectATSType(finalUrl);
            if (detectedATS) {
                console.log(`🎯 Detected ATS: ${detectedATS}`);
                flowSteps.push(`Step 5: Detected ATS - ${detectedATS}`);
                const result = await this.applyToATS(page, browser, detectedATS, job, config, coverLetter);
                // Capture final URLs
                finalUrl = page.url();
                if (result.success) {
                    confirmationUrl = page.url();
                    console.log(`✅ Confirmation URL: ${confirmationUrl}`);
                }
                return {
                    ...result,
                    finalUrl,
                    confirmationUrl: confirmationUrl || undefined,
                    atsType: detectedATS,
                };
            }
            // Platform-specific application logic
            console.log(`🎯 Applying via ${job.source}...`);
            flowSteps.push(`Step 6: Applying via ${job.source}`);
            let result;
            if (job.source === 'Indeed') {
                result = await this.applyToIndeed(page, browser, job, config, coverLetter);
            }
            else if (job.source === 'LinkedIn') {
                result = await this.applyToLinkedIn(page, browser, job, config, coverLetter);
            }
            else if (job.source === 'Dice') {
                result = await this.applyToDice(page, browser, job, config, coverLetter);
            }
            else if (job.source === 'Monster') {
                result = await this.applyToMonster(page, browser, job, config, coverLetter);
            }
            else if (job.source === 'ZipRecruiter') {
                result = await this.applyToZipRecruiter(page, browser, job, config, coverLetter);
            }
            else {
                // Generic application attempt for unknown sources
                result = await this.applyGeneric(page, browser, job, config, coverLetter);
            }
            // Capture final URLs after application
            finalUrl = page.url();
            if (result.success) {
                confirmationUrl = page.url();
                console.log(`✅ Confirmation URL: ${confirmationUrl}`);
                flowSteps.push(`Step 7: Application successful - ${confirmationUrl}`);
            }
            else {
                flowSteps.push(`Step 7: Application failed - ${result.message}`);
            }
            console.log('📊 Flow steps:', flowSteps);
            return {
                ...result,
                finalUrl,
                confirmationUrl: confirmationUrl || undefined,
                atsType: detectedATS || undefined,
            };
        }
        catch (error) {
            console.error(`❌ Application submission error:`, error);
            console.error('📊 Flow steps before error:', flowSteps);
            return {
                success: false,
                status: 'error',
                message: `Application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                finalUrl,
                atsType: detectedATS || undefined,
            };
        }
        finally {
            if (browser) {
                await browser.close();
            }
        }
    },
    async applyToIndeed(page, browser, job, config, coverLetter) {
        try {
            console.log('🔍 Searching for apply button on Indeed...');
            // Wait for page to be fully interactive and for Indeed's apply widget to load
            await delay(5000);
            // Wait specifically for the Indeed apply widget to appear
            try {
                await page.waitForSelector('.ia-IndeedApplyButton, .indeed-apply-widget, button#indeedApplyButton', { timeout: 10000 });
                console.log('  ✅ Indeed apply widget detected');
            }
            catch (e) {
                console.log('  ⚠️ Indeed apply widget not found, continuing anyway...');
            }
            // First, detect what type of application this is
            const applicationType = await page.evaluate(() => {
                const bodyText = document.body.textContent?.toLowerCase() || '';
                const hasEasyApply = bodyText.includes('easy apply') ||
                    bodyText.includes('apply now') ||
                    !!document.querySelector('[data-testid*="easy-apply"], [class*="easy-apply"], [id*="easy-apply"]');
                const hasCompanySite = bodyText.includes('apply on company site') ||
                    bodyText.includes('apply on company website') ||
                    bodyText.includes('external application');
                // Look for buttons
                const buttons = Array.from(document.querySelectorAll('button, a'));
                let easyApplyButton = null;
                let companySiteButton = null;
                for (const btn of buttons) {
                    const text = btn.textContent?.toLowerCase() || '';
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    const href = btn.href?.toLowerCase() || '';
                    if ((text.includes('easy apply') || text.includes('apply now')) && !text.includes('company site')) {
                        easyApplyButton = true;
                    }
                    if (text.includes('apply on company site') || text.includes('apply on company website') ||
                        text.includes('external') || href.includes('external')) {
                        companySiteButton = true;
                    }
                }
                return {
                    hasEasyApply: hasEasyApply || easyApplyButton,
                    hasCompanySite: hasCompanySite || companySiteButton,
                    easyApplyButton,
                    companySiteButton,
                };
            });
            console.log(`  📋 Application type detected:`, applicationType);
            // Handle "Apply on company site" - redirect to external site
            if (applicationType.hasCompanySite && !applicationType.hasEasyApply) {
                console.log('  🔗 Detected "Apply on company site" - will redirect to external website');
                // Find and click the "Apply on company site" button
                const companySiteButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a'));
                    return buttons.find((btn) => {
                        const text = btn.textContent?.toLowerCase() || '';
                        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                        return (text.includes('apply on company site') ||
                            text.includes('apply on company website') ||
                            text.includes('external application') ||
                            ariaLabel.includes('company site')) &&
                            !text.includes('easy apply');
                    });
                });
                if (companySiteButton && companySiteButton.asElement()) {
                    console.log('  🖱️ Clicking "Apply on company site" button...');
                    await companySiteButton.asElement().click();
                    await delay(5000); // Wait for redirect
                    // Check if redirected to external site
                    const newUrl = page.url();
                    console.log(`  🔗 Redirected to: ${newUrl}`);
                    // Detect ATS if redirected
                    const atsType = this.detectATSType(newUrl);
                    if (atsType) {
                        console.log(`  🎯 Redirected to ${atsType} ATS`);
                        return await this.applyToATS(page, browser, atsType, job, config, coverLetter);
                    }
                    // Generic external site handling
                    return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
                }
                else {
                    return {
                        success: false,
                        status: 'manual_required',
                        message: 'Found "Apply on company site" but could not click the button. Please apply manually on the company website.',
                    };
                }
            }
            // Handle "Easy Apply" - apply directly on Indeed
            if (applicationType.hasEasyApply) {
                console.log('  ✅ Detected "Easy Apply" - applying directly on Indeed');
            }
            // Look for apply button with more comprehensive selectors (Indeed-specific first)
            const applySelectors = [
                'button#indeedApplyButton',
                'button[data-testid="indeedApplyButton-test"]',
                'button[data-testid*="indeedApply"]',
                '.ia-IndeedApplyButton button',
                '.indeed-apply-widget button',
                'button[data-testid="apply-button"]',
                'a[data-testid="apply-button"]',
                'button[id*="apply"]',
                'a[id*="apply"]',
                'button[aria-label*="Apply"]',
                'a[aria-label*="Apply"]',
                'button[class*="apply"]',
                'a[class*="apply"]',
                'button[data-jk*="apply"]',
                'a[href*="apply"]',
            ];
            let applyButton = null;
            let foundSelector = null;
            for (const selector of applySelectors) {
                try {
                    console.log(`  Trying selector: ${selector}`);
                    await page.waitForSelector(selector, { timeout: 3000 });
                    applyButton = await page.$(selector);
                    if (applyButton) {
                        // Check if button is disabled or already applied
                        const isDisabled = await applyButton.evaluate((btn) => {
                            return btn.disabled ||
                                btn.getAttribute('aria-label')?.toLowerCase().includes('applied') ||
                                btn.textContent?.toLowerCase().includes('applied') ||
                                btn.className?.toLowerCase().includes('applied');
                        });
                        if (isDisabled) {
                            console.log(`  ⚠️ Button found but is disabled/already applied: ${selector}`);
                            applyButton = null;
                            continue;
                        }
                        foundSelector = selector;
                        console.log(`  ✅ Found apply button with selector: ${selector}`);
                        break;
                    }
                }
                catch (e) {
                    // Continue to next selector
                    continue;
                }
            }
            // If no button found with selectors, try finding by text content
            if (!applyButton) {
                console.log('  Trying to find apply button by text content...');
                try {
                    const buttonInfo = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button, a'));
                        for (let i = 0; i < buttons.length; i++) {
                            const btn = buttons[i];
                            const text = btn.textContent?.toLowerCase() || '';
                            const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                            const id = btn.id?.toLowerCase() || '';
                            const className = btn.className?.toLowerCase() || '';
                            // Check if button is disabled or already applied
                            const isDisabled = btn.disabled ||
                                ariaLabel.includes('applied') ||
                                text.includes('applied') ||
                                className.includes('applied');
                            // Look for Easy Apply or general Apply, but not "Apply on company site" or already applied
                            if (!isDisabled && (text.includes('easy apply') ||
                                text.includes('apply now') ||
                                (text.includes('apply') && !text.includes('company site') && !text.includes('applied')) ||
                                id.includes('apply') ||
                                ariaLabel.includes('apply'))) {
                                return { index: i, text, ariaLabel, id, isDisabled };
                            }
                        }
                        return null;
                    });
                    if (buttonInfo && !buttonInfo.isDisabled) {
                        const allButtons = await page.$$('button, a');
                        if (allButtons[buttonInfo.index]) {
                            applyButton = allButtons[buttonInfo.index];
                            foundSelector = 'text-content';
                            console.log(`  ✅ Found apply button by text content: "${buttonInfo.text}" (id: ${buttonInfo.id})`);
                        }
                    }
                    else if (buttonInfo && buttonInfo.isDisabled) {
                        console.log(`  ⚠️ Found apply button but it's disabled/already applied: "${buttonInfo.text}"`);
                        return {
                            success: false,
                            status: 'error',
                            message: 'This job has already been applied to. The apply button shows "Applied" status and is disabled.',
                        };
                    }
                    // Also check for Indeed-specific button even if disabled
                    const indeedButtonInfo = await page.evaluate(() => {
                        const btn = document.querySelector('button#indeedApplyButton, button[data-testid="indeedApplyButton-test"]');
                        if (btn) {
                            return {
                                exists: true,
                                disabled: btn.disabled || false,
                                text: btn.textContent?.trim() || '',
                                ariaLabel: btn.getAttribute('aria-label') || '',
                                className: btn.className || '',
                            };
                        }
                        return { exists: false };
                    });
                    if (indeedButtonInfo.exists) {
                        if (indeedButtonInfo.disabled ||
                            indeedButtonInfo.text.toLowerCase().includes('applied') ||
                            indeedButtonInfo.ariaLabel.toLowerCase().includes('applied')) {
                            console.log(`  ⚠️ Indeed apply button found but already applied: "${indeedButtonInfo.text}"`);
                            return {
                                success: false,
                                status: 'error',
                                message: `This job has already been applied to. The button shows "${indeedButtonInfo.text}" and is disabled.`,
                            };
                        }
                        else {
                            // Button exists and is not disabled, try to click it
                            console.log(`  ✅ Found Indeed apply button: "${indeedButtonInfo.text}"`);
                            applyButton = await page.$('button#indeedApplyButton, button[data-testid="indeedApplyButton-test"]');
                            foundSelector = 'button#indeedApplyButton';
                        }
                    }
                }
                catch (e) {
                    console.log('  ❌ Could not find by text content:', e instanceof Error ? e.message : 'Unknown');
                }
            }
            // Check if the found button is disabled or already applied
            if (applyButton) {
                const buttonState = await applyButton.evaluate((btn) => {
                    return {
                        disabled: btn.disabled || false,
                        text: btn.textContent?.toLowerCase() || '',
                        ariaLabel: btn.getAttribute('aria-label')?.toLowerCase() || '',
                        className: btn.className?.toLowerCase() || '',
                    };
                });
                if (buttonState.disabled ||
                    buttonState.text.includes('applied') ||
                    buttonState.ariaLabel.includes('applied') ||
                    buttonState.className.includes('applied')) {
                    console.log(`  ⚠️ Apply button found but is disabled/already applied: "${buttonState.text}"`);
                    return {
                        success: false,
                        status: 'error',
                        message: 'This job has already been applied to. The apply button is disabled.',
                    };
                }
            }
            if (!applyButton) {
                // Check if there's a "Apply on company site" button as fallback
                const companySiteButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a'));
                    return buttons.find((btn) => {
                        const text = btn.textContent?.toLowerCase() || '';
                        return text.includes('apply on company site') || text.includes('apply on company website');
                    });
                });
                if (companySiteButton && companySiteButton.asElement()) {
                    console.log('  🔗 Found "Apply on company site" button as fallback');
                    await companySiteButton.asElement().click();
                    await delay(5000);
                    const newUrl = page.url();
                    const atsType = this.detectATSType(newUrl);
                    if (atsType) {
                        return await this.applyToATS(page, browser, atsType, job, config, coverLetter);
                    }
                    return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
                }
                // Try to get page content for debugging
                const pageContent = await page.content();
                const hasApplyText = pageContent.toLowerCase().includes('apply');
                console.log(`  ❌ Apply button not found. Page contains "apply" text: ${hasApplyText}`);
                console.log(`  📄 Page URL: ${page.url()}`);
                // Try to find any buttons/links for debugging
                const allButtons = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a'));
                    return buttons.slice(0, 15).map((btn) => ({
                        text: btn.textContent?.trim().substring(0, 50),
                        id: btn.id,
                        className: btn.className,
                        href: btn.href,
                    }));
                });
                console.log('  🔍 First 15 buttons/links found:', JSON.stringify(allButtons, null, 2));
                return {
                    success: false,
                    status: 'manual_required',
                    message: `Apply button not found on Indeed. The job may only have "Apply on company site" option. Please check the page manually.`,
                };
            }
            console.log(`  🖱️ Clicking apply button (found with: ${foundSelector})...`);
            await applyButton.click();
            // Wait for form/modal to appear - could be in iframe or popup
            await delay(3000);
            // Check if form opened in new window/frame
            const pages = await browser.pages();
            let activePage = page;
            if (pages.length > 1) {
                console.log('  📑 Form opened in new window, switching...');
                activePage = pages[pages.length - 1];
                await activePage.bringToFront();
                await delay(2000);
            }
            // Check for iframes (common in job applications, especially Indeed Easy Apply)
            const frames = activePage.frames();
            let formFrame = activePage.mainFrame();
            if (frames.length > 1) {
                console.log(`  🖼️ Found ${frames.length} frames, checking for form in iframe...`);
                for (const frame of frames) {
                    if (frame !== activePage.mainFrame()) {
                        try {
                            const iframeForm = await frame.$('form, input[type="email"], input[type="text"]');
                            if (iframeForm) {
                                console.log('  ✅ Form found in iframe, using iframe context');
                                formFrame = frame;
                                break;
                            }
                        }
                        catch (e) {
                            // Continue checking other frames
                        }
                    }
                }
            }
            // Use AI to intelligently fill the form (works for both Easy Apply and external redirects)
            return await this.fillFormWithAI(formFrame, activePage, config, coverLetter, job);
            // This section moved to fillFormWithAI method
            // Submit logic moved to fillFormWithAI method
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Indeed application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async fillFormWithAI(frame, page, config, coverLetter, job) {
        try {
            console.log('🤖 Using AI to intelligently fill form...');
            // Get all form fields and their context
            const formStructure = await frame.evaluate(() => {
                const fields = [];
                // Get all input fields
                const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
                inputs.forEach((el, index) => {
                    const field = {
                        index,
                        type: el.type || el.tagName.toLowerCase(),
                        name: el.name || '',
                        id: el.id || '',
                        placeholder: el.placeholder || '',
                        label: '',
                        required: el.required || el.getAttribute('aria-required') === 'true',
                        value: el.value || '',
                        visible: el.offsetParent !== null,
                    };
                    // Try to find associated label
                    if (el.id) {
                        const label = document.querySelector(`label[for="${el.id}"]`);
                        if (label) {
                            field.label = label.textContent?.trim() || '';
                        }
                    }
                    // Try to find label by parent
                    const parentLabel = el.closest('label');
                    if (parentLabel) {
                        field.label = parentLabel.textContent?.trim() || '';
                    }
                    fields.push(field);
                });
                return fields;
            });
            console.log(`  📋 Found ${formStructure.length} form fields`);
            // Use AI to determine what each field should contain
            if (anthropic && process.env.ANTHROPIC_API_KEY) {
                const fieldMapping = await this.mapFieldsWithAI(formStructure, config, coverLetter, job);
                // Fill fields based on AI mapping
                for (const mapping of fieldMapping) {
                    try {
                        const fieldIndex = mapping.index;
                        const value = mapping.value;
                        if (!value)
                            continue;
                        // Get the field element
                        const fields = await frame.$$('input, textarea, select');
                        if (fields[fieldIndex]) {
                            const field = fields[fieldIndex];
                            const fieldType = await field.evaluate((el) => el.type || el.tagName.toLowerCase());
                            if (fieldType === 'file') {
                                // Handle file upload
                                if (config.resumePath && fs.existsSync(config.resumePath)) {
                                    const absolutePath = path.isAbsolute(config.resumePath)
                                        ? config.resumePath
                                        : path.resolve(config.resumePath);
                                    await field.uploadFile(absolutePath);
                                    console.log(`  ✅ Uploaded resume to field: ${mapping.fieldName}`);
                                }
                            }
                            else if (fieldType === 'checkbox' || fieldType === 'radio') {
                                // Handle checkboxes/radios
                                if (value === 'true' || value === 'yes' || value === '1') {
                                    const isChecked = await field.evaluate((el) => el.checked);
                                    if (!isChecked) {
                                        await field.click();
                                        console.log(`  ✅ Checked ${fieldType}: ${mapping.fieldName}`);
                                    }
                                }
                            }
                            else if (fieldType === 'select') {
                                // Handle dropdowns
                                await field.select(value);
                                console.log(`  ✅ Selected option in ${mapping.fieldName}: ${value}`);
                            }
                            else {
                                // Handle text inputs
                                await field.click({ clickCount: 3 });
                                await field.type(value);
                                console.log(`  ✅ Filled ${mapping.fieldName}: ${value.substring(0, 30)}...`);
                            }
                            await delay(500); // Small delay between fields
                        }
                    }
                    catch (e) {
                        console.log(`  ⚠️ Could not fill field ${mapping.fieldName}:`, e instanceof Error ? e.message : 'Unknown');
                    }
                }
            }
            else {
                // Fallback to rule-based filling if AI not available
                return await this.fillFormRulesBased(frame, page, config, coverLetter);
            }
            // Handle multi-step forms - look for "Next" or "Continue" buttons
            let currentStep = 1;
            const maxSteps = 5; // Safety limit
            while (currentStep <= maxSteps) {
                await delay(2000);
                // Check if we're on a multi-step form
                const hasNextButton = await frame.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a'));
                    return buttons.some((btn) => {
                        const text = btn.textContent?.toLowerCase() || '';
                        return (text.includes('next') || text.includes('continue') || text.includes('proceed'))
                            && !text.includes('submit');
                    });
                });
                if (hasNextButton) {
                    console.log(`  ➡️ Step ${currentStep}: Found next/continue button, proceeding...`);
                    // Find and click next button
                    const nextButton = await frame.evaluateHandle(() => {
                        const buttons = Array.from(document.querySelectorAll('button, a'));
                        return buttons.find((btn) => {
                            const text = btn.textContent?.toLowerCase() || '';
                            return (text.includes('next') || text.includes('continue') || text.includes('proceed'))
                                && !text.includes('submit');
                        });
                    });
                    if (nextButton && nextButton.asElement()) {
                        await nextButton.asElement().click();
                        await delay(3000);
                        currentStep++;
                        // Fill fields on new step
                        const newFields = await frame.$$('input[required], select[required], textarea[required]');
                        for (const field of newFields) {
                            try {
                                const fieldInfo = await field.evaluate((el) => ({
                                    type: el.type || el.tagName.toLowerCase(),
                                    name: el.name || el.id || '',
                                    placeholder: el.placeholder || '',
                                }));
                                // Simple rule-based filling for additional steps
                                if (fieldInfo.type === 'email' && config.userProfile.email) {
                                    await field.type(config.userProfile.email);
                                }
                                else if (fieldInfo.type === 'tel' && config.userProfile.phone) {
                                    await field.type(config.userProfile.phone);
                                }
                            }
                            catch (e) {
                                // Continue
                            }
                        }
                    }
                    else {
                        break;
                    }
                }
                else {
                    break;
                }
            }
            // Submit the form
            const submitResult = await this.submitForm(frame, page);
            // Capture confirmation URL if successful
            if (submitResult.success) {
                const confirmationUrl = page.url();
                return {
                    ...submitResult,
                    confirmationUrl,
                };
            }
            return submitResult;
        }
        catch (error) {
            console.error('  ❌ Error in AI form filling:', error);
            // Fallback to rules-based
            return await this.fillFormRulesBased(frame, page, config, coverLetter);
        }
    },
    async mapFieldsWithAI(formStructure, config, coverLetter, job) {
        if (!anthropic) {
            return [];
        }
        try {
            const nameParts = config.userProfile.fullName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            const prompt = `You are helping fill out a job application form. Analyze the form fields and determine what value should go in each field.

Form Fields:
${JSON.stringify(formStructure, null, 2)}

User Profile:
- Full Name: ${config.userProfile.fullName}
- First Name: ${firstName}
- Last Name: ${lastName}
- Email: ${config.userProfile.email}
- Phone: ${config.userProfile.phone || 'Not provided'}
- Skills: ${config.userProfile.skills || 'Not provided'}
- Experience: ${config.userProfile.experience || 'Not provided'}

Job Information:
- Title: ${job.title}
- Company: ${job.company}

Cover Letter: ${coverLetter.substring(0, 500)}...

For each field, determine the appropriate value based on:
1. Field name, id, placeholder, or label
2. Field type (text, email, tel, select, checkbox, file, etc.)
3. Whether it's required

Return a JSON array with objects like:
[
  {
    "index": 0,
    "fieldName": "email",
    "value": "user@example.com",
    "reason": "Email field detected"
  }
]

For checkboxes, use "true" or "false" as value.
For selects, use the option value.
For file uploads, use "resume" as value.
For fields you can't determine, use null as value.

Return ONLY valid JSON, no other text.`;
            const message = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            });
            const content = message.content[0];
            if (content.type === 'text') {
                // Extract JSON from response
                const jsonMatch = content.text.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
            }
        }
        catch (error) {
            console.error('  ⚠️ AI field mapping failed:', error);
        }
        return [];
    },
    async fillFormRulesBased(frame, page, config, coverLetter) {
        console.log('  📝 Using rule-based form filling...');
        const nameParts = config.userProfile.fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        // Fill name fields
        const nameFields = await frame.$$('input[name*="name" i], input[id*="name" i]');
        for (const field of nameFields) {
            try {
                const fieldName = await field.evaluate((el) => el.name || el.id || '').toLowerCase();
                let value = '';
                if (fieldName.includes('first'))
                    value = firstName;
                else if (fieldName.includes('last'))
                    value = lastName;
                else if (fieldName.includes('full') || fieldName === 'name')
                    value = config.userProfile.fullName;
                if (value) {
                    await field.click({ clickCount: 3 });
                    await field.type(value);
                }
            }
            catch (e) {
                continue;
            }
        }
        // Fill email
        const emailFields = await frame.$$('input[type="email"], input[name*="email" i]');
        for (const field of emailFields) {
            try {
                await field.click({ clickCount: 3 });
                await field.type(config.userProfile.email);
                break;
            }
            catch (e) {
                continue;
            }
        }
        // Fill phone
        if (config.userProfile.phone) {
            const phoneFields = await frame.$$('input[type="tel"], input[name*="phone" i]');
            for (const field of phoneFields) {
                try {
                    await field.click({ clickCount: 3 });
                    await field.type(config.userProfile.phone);
                    break;
                }
                catch (e) {
                    continue;
                }
            }
        }
        // Upload resume
        if (config.resumePath && fs.existsSync(config.resumePath)) {
            const fileInputs = await frame.$$('input[type="file"]');
            if (fileInputs.length > 0) {
                const absolutePath = path.isAbsolute(config.resumePath)
                    ? config.resumePath
                    : path.resolve(config.resumePath);
                await fileInputs[0].uploadFile(absolutePath);
            }
        }
        // Fill cover letter
        const textareas = await frame.$$('textarea');
        for (const textarea of textareas) {
            try {
                const placeholder = await textarea.evaluate((el) => el.placeholder || '').toLowerCase();
                if (placeholder.includes('cover') || placeholder.includes('letter') || placeholder.includes('message')) {
                    await textarea.click({ clickCount: 3 });
                    await textarea.type(coverLetter);
                    break;
                }
            }
            catch (e) {
                continue;
            }
        }
        // Check required checkboxes
        const checkboxes = await frame.$$('input[type="checkbox"][required]');
        for (const checkbox of checkboxes) {
            try {
                const isChecked = await checkbox.evaluate((el) => el.checked);
                if (!isChecked) {
                    await checkbox.click();
                }
            }
            catch (e) {
                continue;
            }
        }
        const submitResult = await this.submitForm(frame, page);
        // Capture confirmation URL if successful
        if (submitResult.success) {
            const confirmationUrl = page.url();
            return {
                ...submitResult,
                confirmationUrl,
            };
        }
        return submitResult;
    },
    async submitForm(frame, page) {
        console.log('  📤 Looking for submit button...');
        // First, check if form is actually visible and has content
        const formInfo = await frame.evaluate(() => {
            const forms = Array.from(document.querySelectorAll('form'));
            const visibleForms = forms.filter((form) => form.offsetParent !== null);
            return {
                totalForms: forms.length,
                visibleForms: visibleForms.length,
                hasEmailField: !!document.querySelector('input[type="email"], input[name*="email" i]'),
                hasSubmitButton: !!document.querySelector('button[type="submit"], input[type="submit"]'),
            };
        });
        console.log(`  📋 Form info:`, formInfo);
        if (formInfo.visibleForms === 0 && !formInfo.hasEmailField) {
            console.log('  ⚠️ No visible form found');
            return {
                success: false,
                status: 'manual_required',
                message: 'No application form found on the page. Please apply manually.',
            };
        }
        const submitSelectors = [
            'button[type="submit"]',
            'button[id*="submit" i]',
            'button[data-testid*="submit" i]',
            'button[aria-label*="submit" i]',
            'button[aria-label*="apply" i]',
            'input[type="submit"]',
        ];
        // Try selectors first
        for (const selector of submitSelectors) {
            try {
                await frame.waitForSelector(selector, { timeout: 2000 });
                const submitButton = await frame.$(selector);
                if (submitButton) {
                    const isVisible = await submitButton.evaluate((el) => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
                    });
                    if (!isVisible) {
                        console.log(`  ⚠️ Submit button found but not visible: ${selector}`);
                        continue;
                    }
                    console.log(`  ✅ Found submit button: ${selector}`);
                    await submitButton.click();
                    await delay(5000);
                    // Check for success indicators
                    const success = await this.checkApplicationSuccess(frame);
                    if (success) {
                        const confirmationUrl = page.url();
                        console.log(`  ✅ Application successful! Confirmation URL: ${confirmationUrl}`);
                        return {
                            success: true,
                            status: 'applied',
                            message: 'Successfully applied! Check your email for confirmation.',
                            confirmationUrl,
                        };
                    }
                    else {
                        console.log('  ⚠️ Submit clicked but success not confirmed');
                    }
                }
            }
            catch (e) {
                continue;
            }
        }
        // Try finding by text
        const submitIndex = await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                const text = btn.textContent?.toLowerCase() || btn.getAttribute('value')?.toLowerCase() || '';
                if ((text.includes('submit') || text.includes('apply') || text.includes('send'))
                    && !text.includes('cancel') && !text.includes('back')) {
                    return i;
                }
            }
            return -1;
        });
        if (submitIndex >= 0) {
            const allButtons = await frame.$$('button, input[type="submit"]');
            if (allButtons[submitIndex]) {
                await allButtons[submitIndex].click();
                await delay(5000);
                const success = await this.checkApplicationSuccess(frame);
                if (success) {
                    const confirmationUrl = page.url();
                    return {
                        success: true,
                        status: 'applied',
                        message: 'Successfully applied! Check your email for confirmation.',
                        confirmationUrl,
                    };
                }
            }
        }
        // Log detailed error info
        const errorInfo = await frame.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
            return {
                totalButtons: buttons.length,
                buttonTexts: buttons.slice(0, 10).map((btn) => ({
                    text: btn.textContent?.trim().substring(0, 50) || btn.value || '',
                    type: btn.type || btn.tagName,
                    visible: btn.offsetParent !== null,
                })),
                pageText: document.body.textContent?.substring(0, 200) || '',
            };
        });
        console.log('  ❌ Submit button not found. Page info:', JSON.stringify(errorInfo, null, 2));
        return {
            success: false,
            status: 'manual_required',
            message: 'Form filled but could not find or click submit button. Please verify manually. Check the page for any remaining required fields or submit button.',
        };
    },
    async checkApplicationSuccess(frame) {
        try {
            const successIndicators = await frame.evaluate(() => {
                const text = document.body.textContent?.toLowerCase() || '';
                const hasSuccess = text.includes('thank you')
                    || text.includes('application submitted')
                    || text.includes('successfully applied')
                    || text.includes('confirmation')
                    || text.includes('we received your application');
                const hasError = text.includes('error')
                    || text.includes('required field')
                    || text.includes('please fill');
                return { hasSuccess, hasError };
            });
            return successIndicators.hasSuccess && !successIndicators.hasError;
        }
        catch (e) {
            return false;
        }
    },
    async applyToLinkedIn(page, browser, job, config, coverLetter) {
        try {
            console.log('🔍 Searching for apply button on LinkedIn...');
            await delay(3000);
            // LinkedIn often requires login, but we can try
            return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
        }
        catch (error) {
            return {
                success: false,
                status: 'manual_required',
                message: 'LinkedIn applications require login - manual application recommended',
            };
        }
    },
    async applyToDice(page, browser, job, config, coverLetter) {
        try {
            console.log('🔍 Searching for apply button on Dice...');
            await delay(3000);
            return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
        }
        catch (error) {
            return {
                success: false,
                status: 'manual_required',
                message: 'Dice application failed - please apply manually',
            };
        }
    },
    async applyToMonster(page, browser, job, config, coverLetter) {
        try {
            console.log('🔍 Searching for apply button on Monster...');
            // Wait for Monster page to fully load (they use dynamic content)
            await delay(5000);
            // Check if we're on a search results page
            const isSearchResults = await page.evaluate(() => {
                const hasMultipleJobs = document.querySelectorAll('[class*="job-card"], [class*="job-tile"], [data-testid*="job"]').length > 3;
                const hasPagination = !!document.querySelector('[class*="pagination"]');
                return hasMultipleJobs && hasPagination;
            });
            if (isSearchResults) {
                console.log('  ⚠️ This is a search results page, not an individual job');
                return {
                    success: false,
                    status: 'error',
                    message: 'This URL is a Monster search results page. Please click on an individual job posting and use that URL. Monster job URLs typically look like: monster.com/jobs/q-[job-id]',
                };
            }
            // Look for apply button or link
            console.log('  🔍 Looking for apply button or form...');
            const applyButton = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                return buttons.find((btn) => {
                    const text = btn.textContent?.toLowerCase() || '';
                    const href = btn.href?.toLowerCase() || '';
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    return (text.includes('apply') || href.includes('apply') || ariaLabel.includes('apply')) &&
                        !text.includes('applied') &&
                        !text.includes('save');
                });
            });
            if (applyButton && applyButton.asElement()) {
                console.log('  ✅ Found apply button, clicking...');
                await applyButton.asElement().click();
                await delay(5000); // Wait for redirect or form to appear
                // Check if redirected to ATS
                const newUrl = page.url();
                const atsType = this.detectATSType(newUrl);
                if (atsType) {
                    console.log(`  🔄 Redirected to ${atsType} ATS`);
                    return await this.applyToATS(page, browser, atsType, job, config, coverLetter);
                }
            }
            // Check if form is already visible
            const hasForm = await page.evaluate(() => {
                return !!document.querySelector('form, input[type="email"], input[name*="email" i]');
            });
            if (hasForm) {
                console.log('  ✅ Form found on page, filling...');
                return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
            }
            // If no form and no apply button found
            console.log('  ⚠️ No form or apply button found');
            return {
                success: false,
                status: 'manual_required',
                message: 'Could not find application form or apply button on Monster. The job may require manual application.',
            };
        }
        catch (error) {
            console.error('  ❌ Monster application error:', error);
            return {
                success: false,
                status: 'error',
                message: `Monster application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    detectATSType(url) {
        const urlLower = url.toLowerCase();
        // SmartRecruiters
        if (urlLower.includes('smartrecruiters.com')) {
            return 'smartrecruiters';
        }
        // Greenhouse
        if (urlLower.includes('greenhouse.io') || urlLower.includes('boards.greenhouse.io')) {
            return 'greenhouse';
        }
        // Lever
        if (urlLower.includes('lever.co') || urlLower.includes('jobs.lever.co')) {
            return 'lever';
        }
        // Workday
        if (urlLower.includes('myworkdayjobs.com') || urlLower.includes('workday.com')) {
            return 'workday';
        }
        // Taleo
        if (urlLower.includes('taleo.net') || urlLower.includes('taleo.com')) {
            return 'taleo';
        }
        // Jobvite
        if (urlLower.includes('jobvite.com')) {
            return 'jobvite';
        }
        // iCIMS
        if (urlLower.includes('icims.com')) {
            return 'icims';
        }
        // BambooHR
        if (urlLower.includes('bamboohr.com')) {
            return 'bamboohr';
        }
        return null;
    },
    async applyToATS(page, browser, atsType, job, config, coverLetter) {
        try {
            console.log(`🎯 Applying via ${atsType} ATS...`);
            // Check if login is required
            const requiresLogin = await this.checkLoginRequired(page);
            if (requiresLogin) {
                console.log('  ⚠️ Login required - waiting for user to sign in...');
                // Wait up to 30 seconds for user to sign in
                const loginCompleted = await this.waitForLogin(page, 30000);
                if (!loginCompleted) {
                    const loginInfo = await this.detectLoginForm(page);
                    return {
                        success: false,
                        status: 'login_required',
                        message: `This job requires login to ${atsType}. ${loginInfo.message} After you sign in, click "Apply" again and the form will be filled automatically.`,
                    };
                }
                else {
                    console.log('  ✅ User signed in, proceeding with application...');
                    await delay(2000);
                }
            }
            // Wait for form to load
            await delay(3000);
            // ATS-specific handlers
            let result;
            switch (atsType) {
                case 'smartrecruiters':
                    result = await this.applyToSmartRecruiters(page, browser, job, config, coverLetter);
                    break;
                case 'greenhouse':
                    result = await this.applyToGreenhouse(page, browser, job, config, coverLetter);
                    break;
                case 'lever':
                    result = await this.applyToLever(page, browser, job, config, coverLetter);
                    break;
                case 'workday':
                    result = await this.applyToWorkday(page, browser, job, config, coverLetter);
                    break;
                default:
                    // Generic ATS handler
                    result = await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
            }
            // Capture confirmation URL if successful
            if (result.success) {
                const confirmationUrl = page.url();
                return {
                    ...result,
                    confirmationUrl,
                };
            }
            return result;
        }
        catch (error) {
            console.error(`❌ Error applying to ${atsType}:`, error);
            return {
                success: false,
                status: 'error',
                message: `Application to ${atsType} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async waitForLogin(page, timeout) {
        const startTime = Date.now();
        const initialUrl = page.url();
        while (Date.now() - startTime < timeout) {
            const stillNeedsLogin = await this.checkLoginRequired(page);
            const currentUrl = page.url();
            // If URL changed or login no longer required, user likely signed in
            if (!stillNeedsLogin || currentUrl !== initialUrl) {
                await delay(2000); // Wait a bit more for page to settle
                const finalCheck = await this.checkLoginRequired(page);
                if (!finalCheck) {
                    return true;
                }
            }
            await delay(2000);
        }
        return false;
    },
    async checkLoginRequired(page) {
        try {
            const hasLoginForm = await page.evaluate(() => {
                const loginIndicators = [
                    'input[type="email"]',
                    'input[name*="email" i]',
                    'input[name*="username" i]',
                    'input[type="password"]',
                    'button:contains("Sign in")',
                    'button:contains("Log in")',
                    'a:contains("Sign in")',
                    'a:contains("Log in")',
                ];
                for (const selector of loginIndicators) {
                    if (document.querySelector(selector)) {
                        return true;
                    }
                }
                // Check page text for login indicators
                const bodyText = document.body.textContent?.toLowerCase() || '';
                return bodyText.includes('sign in') ||
                    bodyText.includes('log in') ||
                    bodyText.includes('create account') ||
                    bodyText.includes('already have an account');
            });
            return hasLoginForm;
        }
        catch (e) {
            return false;
        }
    },
    async detectLoginForm(page) {
        try {
            const loginInfo = await page.evaluate(() => {
                const emailField = document.querySelector('input[type="email"], input[name*="email" i]');
                const passwordField = document.querySelector('input[type="password"]');
                if (emailField && passwordField) {
                    return {
                        hasLoginForm: true,
                        message: 'Login form detected. Please sign in with your email and password.',
                    };
                }
                return {
                    hasLoginForm: false,
                    message: 'Please sign in to continue with your application.',
                };
            });
            return loginInfo;
        }
        catch (e) {
            return { message: 'Please sign in to continue with your application.' };
        }
    },
    async applyToSmartRecruiters(page, browser, job, config, coverLetter) {
        try {
            console.log('  📝 Applying via SmartRecruiters...');
            // SmartRecruiters typically has a multi-step form
            // Wait for form to be visible
            await delay(3000);
            // Check if we're on the success page
            let currentUrl = page.url();
            if (currentUrl.includes('/success')) {
                return {
                    success: true,
                    status: 'applied',
                    message: 'Application submitted successfully via SmartRecruiters!',
                    confirmationUrl: currentUrl,
                };
            }
            // Look for SmartRecruiters-specific form fields
            const hasForm = await page.evaluate(() => {
                return !!document.querySelector('form, input[type="text"], input[type="email"]');
            });
            if (!hasForm) {
                return {
                    success: false,
                    status: 'login_required',
                    message: 'Please sign in to SmartRecruiters, then the form will be filled automatically.',
                };
            }
            // Use AI to fill the form
            const result = await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
            // Check for success page after submission
            await delay(3000);
            currentUrl = page.url();
            if (currentUrl.includes('/success') && !result.success) {
                return {
                    success: true,
                    status: 'applied',
                    message: 'Application submitted successfully via SmartRecruiters!',
                    confirmationUrl: currentUrl,
                };
            }
            return {
                ...result,
                confirmationUrl: result.success ? currentUrl : undefined,
            };
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `SmartRecruiters application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyToGreenhouse(page, browser, job, config, coverLetter) {
        try {
            console.log('  📝 Applying via Greenhouse...');
            await delay(3000);
            return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Greenhouse application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyToLever(page, browser, job, config, coverLetter) {
        try {
            console.log('  📝 Applying via Lever...');
            await delay(3000);
            return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Lever application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyToWorkday(page, browser, job, config, coverLetter) {
        try {
            console.log('  📝 Applying via Workday...');
            await delay(3000);
            return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Workday application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyToZipRecruiter(page, browser, job, config, coverLetter) {
        try {
            console.log('🔍 Searching for apply button on ZipRecruiter...');
            // Wait for page to fully load
            await delay(5000);
            // Check if we're still on a loading page
            const pageTitle = await page.title();
            if (pageTitle.includes('Just a moment') || pageTitle === '' || pageTitle === 'Loading...') {
                console.log('  ⏳ Page still loading, waiting longer...');
                await delay(5000);
            }
            // Check current URL after potential redirects
            const currentUrl = page.url();
            console.log(`  🔗 Current URL after load: ${currentUrl}`);
            // Check if we're on a search results page
            const isSearchResults = await page.evaluate(() => {
                const url = window.location.href.toLowerCase();
                const hasMultipleJobs = document.querySelectorAll('[class*="job-card"], [class*="job-listing"], [data-testid*="job"]').length > 1;
                return (url.includes('/jobs/') && !url.includes('/job/')) || hasMultipleJobs;
            });
            if (isSearchResults) {
                console.log('  ⚠️ This appears to be a search results page, not an individual job');
                return {
                    success: false,
                    status: 'error',
                    message: 'This URL is a search results page. Please use the direct link to an individual job posting. Click "View Job Posting" to get the correct URL.',
                };
            }
            // Look for "Apply" button or link
            console.log('  🔍 Looking for apply button...');
            const applyButton = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                return buttons.find((btn) => {
                    const text = btn.textContent?.toLowerCase() || '';
                    const href = btn.href?.toLowerCase() || '';
                    return (text.includes('apply') || href.includes('apply')) &&
                        !text.includes('applied') &&
                        !text.includes('save');
                });
            });
            if (applyButton && applyButton.asElement()) {
                console.log('  ✅ Found apply button, clicking...');
                await applyButton.asElement().click();
                await delay(5000); // Wait for redirect or form to appear
                // Check if redirected to ATS
                const newUrl = page.url();
                const atsType = this.detectATSType(newUrl);
                if (atsType) {
                    console.log(`  🔄 Redirected to ${atsType} ATS`);
                    return await this.applyToATS(page, browser, atsType, job, config, coverLetter);
                }
            }
            else {
                console.log('  ⚠️ No apply button found, checking for direct form...');
            }
            // Check if form is already visible (some jobs have inline forms)
            const hasForm = await page.evaluate(() => {
                return !!document.querySelector('form, input[type="email"], input[name*="email" i]');
            });
            if (hasForm) {
                console.log('  ✅ Form found on page, filling...');
                return await this.fillFormWithAI(page.mainFrame(), page, config, coverLetter, job);
            }
            // If no form and no apply button, might need to wait or it's a different structure
            console.log('  ⚠️ No form or apply button found');
            return {
                success: false,
                status: 'manual_required',
                message: 'Could not find application form or apply button. The job may require manual application or have a different structure.',
            };
        }
        catch (error) {
            console.error('  ❌ ZipRecruiter application error:', error);
            return {
                success: false,
                status: 'error',
                message: `ZipRecruiter application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyGeneric(page, browser, job, config, coverLetter) {
        // Generic application attempt - look for common form fields
        try {
            // Try to find and fill common fields
            const emailField = await page.$('input[type="email"], input[name*="email"]');
            if (emailField) {
                await emailField.type(config.userProfile.email);
            }
            // Try to find submit button
            const submitButton = await page.$('button[type="submit"], input[type="submit"]');
            if (submitButton) {
                await submitButton.click();
                await delay(2000);
                return {
                    success: true,
                    status: 'applied',
                    message: 'Application submitted (generic form)',
                };
            }
            return {
                success: false,
                status: 'manual_required',
                message: 'Could not identify application form - manual application required',
            };
        }
        catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Generic application failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    },
    async applyToMultipleJobs(jobIds, config) {
        const results = [];
        for (const jobId of jobIds) {
            const result = await this.applyToJob(jobId, config);
            results.push({ jobId, ...result });
            // Rate limiting - wait 5 seconds between applications
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return results;
    },
};
