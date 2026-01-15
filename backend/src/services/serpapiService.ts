import axios from 'axios';
import * as cheerio from 'cheerio';

interface SerpAPICandidate {
  fullName: string;
  jobTitle: string;
  skills: string[];
  yearsOfExperience: number | null;
  securityClearance: string;
  location: string;
  email: string | null;
  phone: string | null;
  resumeUrl: string | null;
  resumeDownloadUrl: string | null;
  profileSummary: string | null;
  source: string;
  sourceUrl: string | null;
  datePosted: string | null;
}

interface SearchParams {
  skills: string;
  securityClearance: string;
  location: string;
  dateRange: number;
}

export const serpapiService = {
  async searchResumes(
    platform: string,
    params: SearchParams,
    maxResults: number = 10
  ): Promise<SerpAPICandidate[]> {
    const apiKey = process.env.SERPAPI_KEY;
    
    if (!apiKey) {
      console.warn('SERPAPI_KEY not found, falling back to mock data');
      return [];
    }

    try {
      // Build search query based on platform and skills
      const skillsList = params.skills.split(',').map(s => s.trim()).join(' ');
      let query = `${skillsList} developer engineer`;
      
      // Add platform-specific site filter (simpler format)
      const siteFilters: Record<string, string> = {
        'LinkedIn': 'site:linkedin.com/in',
        'Indeed': 'site:indeed.com',
        'Dice': 'site:dice.com',
        'Monster': 'site:monster.com',
        'ZipRecruiter': 'site:ziprecruiter.com',
        'GitHub': 'site:github.com',
      };
      
      if (siteFilters[platform]) {
        query = `${query} ${siteFilters[platform]}`;
      }
      
      // Add location if specified
      if (params.location && params.location.toLowerCase() !== 'remote') {
        query = `${query} ${params.location}`;
      }

      // Add security clearance to query if specified
      if (params.securityClearance !== 'None') {
        query = `${query} "${params.securityClearance}" clearance`;
      }

      console.log(`🔍 Searching ${platform} with query: ${query}`);

      const searchParams: any = {
        q: query,
        api_key: apiKey,
        engine: 'google',
        num: Math.min(maxResults, 20), // SerpAPI allows up to 100, but we'll limit to 20 per platform
        hl: 'en',
        gl: 'us',
      };

      // Use SerpAPI REST API with axios
      const serpapiUrl = 'https://serpapi.com/search';
      const response = await axios.get(serpapiUrl, {
        params: searchParams,
        timeout: 30000, // 30 second timeout
      });
      
      const results = response.data;
      
      if (results.error) {
        // Handle specific error cases
        if (results.error.includes("hasn't returned any results")) {
          console.log(`⚠️ No Google results for query. Trying alternative query format...`);
          // Try a simpler query without site filter
          const simpleQuery = `${params.skills.split(',')[0].trim()} ${platform} developer ${params.location}`;
          searchParams.q = simpleQuery;
          
          try {
            const retryResponse = await axios.get(serpapiUrl, {
              params: searchParams,
              timeout: 30000,
            });
            const retryResults = retryResponse.data;
            if (retryResults.error) {
              throw new Error(retryResults.error);
            }
            const candidates = await this.parseSerpAPIResults(retryResults, platform, params);
            console.log(`✅ Found ${candidates.length} candidates from ${platform} (retry)`);
            return candidates.slice(0, maxResults);
          } catch (retryError) {
            throw new Error(results.error);
          }
        }
        throw new Error(results.error);
      }
      
      // Check if we have results
      if (!results.organic_results || results.organic_results.length === 0) {
        console.log(`⚠️ No organic results returned for ${platform}`);
        return [];
      }

      // Parse results into candidate format
      const candidates = await this.parseSerpAPIResults(results, platform, params);
      
      console.log(`✅ Found ${candidates.length} candidates from ${platform}`);
      return candidates.slice(0, maxResults);
    } catch (error) {
      console.error(`❌ SerpAPI error for ${platform}:`, error);
      // Return empty array on error - will fall back to mock data if needed
      return [];
    }
  },

  async parseSerpAPIResults(
    data: any,
    platform: string,
    params: SearchParams
  ): Promise<SerpAPICandidate[]> {
    const candidates: SerpAPICandidate[] = [];
    
    if (!data.organic_results || !Array.isArray(data.organic_results)) {
      return candidates;
    }

    for (const result of data.organic_results) {
      try {
        const candidate = await this.parseResultToCandidate(result, platform, params);
        if (candidate) {
          candidates.push(candidate);
        }
      } catch (error) {
        console.error('Error parsing result:', error);
      }
    }

    return candidates;
  },

  async parseResultToCandidate(
    result: any,
    platform: string,
    params: SearchParams
  ): Promise<SerpAPICandidate | null> {
    if (!result.title || !result.link) {
      return null;
    }

    // Extract name and title from title/snippet
    const titleText = result.title || '';
    const snippetText = result.snippet || '';
    const fullText = `${titleText} ${snippetText}`;

    // Try to extract name (usually first part of title)
    const nameMatch = titleText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    const fullName = nameMatch ? nameMatch[1] : this.extractNameFromText(fullText);

    // Extract job title
    const jobTitle = this.extractJobTitle(titleText, snippetText);

    // Extract skills from snippet and title
    const skills = this.extractSkills(fullText, params.skills);

    // Extract location
    const location = this.extractLocation(fullText, params.location);

    // Extract years of experience
    const yearsOfExperience = this.extractExperience(fullText);

    // Extract security clearance
    const securityClearance = this.extractSecurityClearance(fullText, params.securityClearance);

    // Try to extract email from snippet first
    let email = this.extractEmail(fullText);
    let phone = this.extractPhone(fullText);
    
    // Generate profile summary from snippet (will be updated if we scrape the page)
    let profileSummary = snippetText || titleText || null;

    console.log(`📧 Extracting contact info for ${fullName} from ${platform}...`);
    console.log(`   Email from snippet: ${email || 'none'}`);

    // Always try to scrape the profile page for email (even if found in snippet, page might have better info)
    if (result.link) {
      try {
        console.log(`   Scraping profile: ${result.link}`);
        const profileData = await this.scrapeProfilePage(result.link, platform);
        
        if (profileData.email) {
          email = profileData.email;
          console.log(`   ✅ Found email from profile page: ${email}`);
        } else {
          console.log(`   ⚠️ No email found on profile page`);
        }
        
        if (profileData.phone && !phone) {
          phone = profileData.phone;
          console.log(`   ✅ Found phone: ${phone}`);
        }
        
        // Update profile summary with more detailed info if available
        if (profileData.summary && profileData.summary.length > (profileSummary?.length || 0)) {
          profileSummary = profileData.summary;
        }
      } catch (error) {
        console.log(`   ⚠️ Could not scrape profile page:`, error instanceof Error ? error.message : error);
        // Continue without email - not all profiles will be accessible
      }
    } else {
      console.log(`   ⚠️ No profile URL available`);
    }
    
    console.log(`   Final email: ${email || 'NOT FOUND'}`);

    return {
      fullName: fullName || 'Unknown',
      jobTitle: jobTitle || 'Professional',
      skills,
      yearsOfExperience,
      securityClearance,
      location: location || params.location || 'Unknown',
      email,
      phone,
      resumeUrl: result.link,
      resumeDownloadUrl: result.link, // Same as resumeUrl for now
      profileSummary,
      source: platform,
      sourceUrl: result.link,
      datePosted: this.extractDate(result.date || null),
    };
  },

  extractNameFromText(text: string): string {
    // Try to find name patterns like "John Smith" or "Jane Doe"
    const namePatterns = [
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
      /(?:^|\s)([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s|$)/,
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'Unknown Candidate';
  },

  extractJobTitle(title: string, snippet: string): string {
    const jobTitles = [
      'Software Engineer', 'Developer', 'Programmer', 'Architect',
      'Senior Software Engineer', 'Full Stack Developer', 'Backend Developer',
      'Frontend Developer', 'DevOps Engineer', 'Data Engineer', 'Security Engineer',
      'Cloud Architect', 'Tech Lead', 'Engineering Manager',
    ];

    const fullText = `${title} ${snippet}`.toLowerCase();

    for (const jobTitle of jobTitles) {
      if (fullText.includes(jobTitle.toLowerCase())) {
        return jobTitle;
      }
    }

    // Try to extract from title
    const titleMatch = title.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Engineer|Developer|Architect|Manager|Lead))/);
    if (titleMatch) {
      return titleMatch[1];
    }

    return 'Software Professional';
  },

  extractSkills(text: string, requestedSkills: string): string[] {
    const skills: string[] = [];
    const textLower = text.toLowerCase();
    
    const commonSkills = [
      'Java', 'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Spring Boot',
      'Microservices', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'SQL', 'MongoDB',
      'PostgreSQL', 'Redis', 'Kafka', 'Elasticsearch', 'GraphQL', 'REST API', 'CI/CD',
      'Git', 'Linux', 'Agile', 'Scrum', 'Terraform', 'Ansible', 'Jenkins', 'GitLab',
      'C++', 'C#', '.NET', 'Angular', 'Vue', 'Express', 'Django', 'Flask',
    ];

    // Add requested skills first
    const requested = requestedSkills.split(',').map(s => s.trim());
    for (const skill of requested) {
      if (skill && textLower.includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    }

    // Add other matching skills
    for (const skill of commonSkills) {
      if (textLower.includes(skill.toLowerCase()) && !skills.includes(skill)) {
        skills.push(skill);
      }
    }

    return skills.length > 0 ? skills : ['Software Development'];
  },

  extractLocation(text: string, defaultLocation: string): string | null {
    const locationPatterns = [
      /(?:in|at|from|located in|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:DC|VA|MD|CA|NY|TX|FL))/,
      /(Washington,?\s*DC|Arlington,?\s*VA|Reston,?\s*VA|McLean,?\s*VA|Bethesda,?\s*MD)/i,
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return defaultLocation || null;
  },

  extractExperience(text: string): number | null {
    const experiencePatterns = [
      /(\d+)\+?\s*years?\s*(?:of\s*)?(?:experience|exp)/i,
      /(\d+)\+?\s*yrs?\s*(?:of\s*)?(?:experience|exp)/i,
      /experience[:\s]+(\d+)\+?\s*years?/i,
    ];

    for (const pattern of experiencePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const years = parseInt(match[1], 10);
        if (years > 0 && years < 50) {
          return years;
        }
      }
    }

    return null;
  },

  extractSecurityClearance(text: string, defaultClearance: string): string {
    const textUpper = text.toUpperCase();
    
    if (textUpper.includes('TS/SCI') || textUpper.includes('TS SCI')) {
      return 'TS/SCI';
    }
    if (textUpper.includes('TOP SECRET')) {
      return 'Top Secret';
    }
    if (textUpper.includes('SECRET') && !textUpper.includes('TOP')) {
      return 'Secret';
    }

    return defaultClearance || 'None';
  },

  extractEmail(text: string): string | null {
    const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const match = text.match(emailPattern);
    return match ? match[1] : null;
  },

  extractPhone(text: string): string | null {
    const phonePatterns = [
      /(\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/,
      /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
    ];

    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  },

  extractDate(dateString: string | null): string | null {
    if (!dateString) {
      return new Date().toISOString().split('T')[0];
    }
    
    try {
      const date = new Date(dateString);
      return date.toISOString().split('T')[0];
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  },

  async scrapeProfilePage(url: string, platform: string): Promise<{ email: string | null; phone: string | null; summary: string | null }> {
    try {
      // Add delay to be respectful of rate limits
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
      });

      const $ = cheerio.load(response.data);
      const pageText = $('body').text();

      // Extract email from page - try multiple methods
      let email: string | null = null;
      
      // Method 1: Look for mailto links
      const mailtoLinks = $('a[href^="mailto:"]').map((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          return href.replace('mailto:', '').split('?')[0].trim();
        }
        return null;
      }).get().filter(Boolean) as string[];
      
      if (mailtoLinks.length > 0) {
        email = mailtoLinks[0];
      }
      
      // Method 2: Extract from page text with improved pattern
      if (!email) {
        const emailPattern = /([a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/g;
        const emailMatches = pageText.match(emailPattern);
        
        if (emailMatches) {
          // Filter out common non-personal emails and invalid patterns
          const filtered = emailMatches.filter(e => {
            const lower = e.toLowerCase();
            return !lower.includes('example.com') && 
                   !lower.includes('test.com') &&
                   !lower.includes('placeholder') &&
                   !lower.includes('noreply') &&
                   !lower.includes('no-reply') &&
                   !lower.includes('donotreply') &&
                   !lower.includes('privacy') &&
                   !lower.includes('support@') &&
                   !lower.includes('info@') &&
                   !lower.includes('contact@') &&
                   !lower.includes('admin@') &&
                   e.length > 5 && // Valid emails are longer
                   e.includes('@') &&
                   e.split('@')[1]?.includes('.'); // Has domain with TLD
          });
          
          if (filtered.length > 0) {
            // Prefer emails that look more personal (not generic domains)
            const personalEmails = filtered.filter(e => {
              const domain = e.split('@')[1]?.toLowerCase();
              return !domain?.includes('company') && 
                     !domain?.includes('corp') &&
                     domain !== 'gmail.com' || filtered.length === 1; // Accept gmail if only option
            });
            email = personalEmails.length > 0 ? personalEmails[0] : filtered[0];
          }
        }
      }
      
      // Method 3: Look in specific common sections
      if (!email) {
        const contactSelectors = [
          '[class*="contact"]',
          '[class*="email"]',
          '[id*="contact"]',
          '[id*="email"]',
          '.contact-info',
          '.email-address'
        ];
        
        for (const selector of contactSelectors) {
          const text = $(selector).text();
          const emailMatch = text.match(/([a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/);
          if (emailMatch && emailMatch[1]) {
            email = emailMatch[1];
            break;
          }
        }
      }

      // Extract phone from page
      const phonePatterns = [
        /(\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
        /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/g,
      ];
      let phone: string | null = null;
      
      for (const pattern of phonePatterns) {
        const matches = pageText.match(pattern);
        if (matches && matches.length > 0) {
          phone = matches[0].trim();
          break;
        }
      }

      // Extract summary/bio from common profile sections
      let summary: string | null = null;
      
      // Try LinkedIn-specific selectors
      if (url.includes('linkedin.com')) {
        const linkedinSummary = $('.pv-text-details__left-panel .text-body-medium, .pv-about__summary-text, .core-section-container__content .break-words').first().text().trim();
        if (linkedinSummary) {
          summary = linkedinSummary.substring(0, 500); // Limit length
        }
      }
      
      // Try generic profile sections
      if (!summary) {
        const bioSelectors = [
          '.bio', '.about', '.summary', '.profile-summary', 
          '[class*="bio"]', '[class*="about"]', '[class*="summary"]',
          'section.about', 'div.about', 'p.about'
        ];
        
        for (const selector of bioSelectors) {
          const text = $(selector).first().text().trim();
          if (text && text.length > 50) {
            summary = text.substring(0, 500);
            break;
          }
        }
      }

      // If no structured summary found, use first few paragraphs
      if (!summary) {
        const paragraphs = $('p').map((_, el) => $(el).text().trim()).get();
        const meaningfulParagraphs = paragraphs.filter(p => p.length > 50);
        if (meaningfulParagraphs.length > 0) {
          summary = meaningfulParagraphs.slice(0, 2).join(' ').substring(0, 500);
        }
      }

      return { email, phone, summary };
    } catch (error) {
      // Silently fail - not all pages will be accessible
      return { email: null, phone: null, summary: null };
    }
  },
};

