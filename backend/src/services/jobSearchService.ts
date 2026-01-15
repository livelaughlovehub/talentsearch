import axios from 'axios';
import { database } from '../database';

interface JobSearchParams {
  skills: string;
  location: string;
  jobType?: string;
  salaryRange?: string;
}

export const jobSearchService = {
  async searchJobs(searchId: number, params: JobSearchParams): Promise<void> {
    try {
      database.prepare('UPDATE job_searches SET status = ? WHERE id = ?')
        .run('in_progress', searchId);

      const platforms = ['Indeed', 'LinkedIn', 'Dice', 'Monster', 'ZipRecruiter'];
      const allJobs: any[] = [];

      for (const platform of platforms) {
        const jobs = await this.searchPlatform(platform, params);
        allJobs.push(...jobs);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Save jobs to database
      const insertStmt = database.prepare(`
        INSERT INTO job_listings (
          title, company, location, description, requirements,
          salary, jobUrl, source, postedDate, searchId, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
      `);

      for (const job of allJobs) {
        insertStmt.run(
          job.title,
          job.company,
          job.location,
          job.description,
          job.requirements,
          job.salary,
          job.jobUrl,
          job.source,
          job.postedDate,
          searchId
        );
      }

      database.prepare(`
        UPDATE job_searches 
        SET status = ?, resultsCount = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run('completed', allJobs.length, searchId);

      console.log(`✅ Job search ${searchId} completed with ${allJobs.length} jobs`);
    } catch (error) {
      console.error(`❌ Job search ${searchId} failed:`, error);
      database.prepare('UPDATE job_searches SET status = ? WHERE id = ?')
        .run('failed', searchId);
      throw error;
    }
  },

  async searchPlatform(platform: string, params: JobSearchParams): Promise<any[]> {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) {
      console.log(`⚠️ SERPAPI_KEY not configured, skipping ${platform}`);
      return [];
    }

    try {
      // Build better query for job postings
      let query = `${params.skills} jobs ${params.location}`;
      
      // Add platform-specific site filter for better results
      if (platform === 'Indeed') {
        query = `${query} site:indeed.com/viewjob OR site:indeed.com/pagead`;
      } else if (platform === 'LinkedIn') {
        query = `${query} site:linkedin.com/jobs/view`;
      } else if (platform === 'Dice') {
        query = `${query} site:dice.com/jobs`;
      } else if (platform === 'Monster') {
        query = `${query} site:monster.com/jobs`;
      } else if (platform === 'ZipRecruiter') {
        query = `${query} site:ziprecruiter.com/jobs`;
      }
      
      console.log(`🔍 Searching jobs on ${platform} with query: ${query}`);

      const searchParams: any = {
        q: query,
        api_key: apiKey,
        engine: 'google',
        num: 10,
        hl: 'en',
        gl: 'us',
      };

      const response = await axios.get('https://serpapi.com/search', {
        params: searchParams,
        timeout: 30000,
      });

      const results = response.data;
      if (results.error) {
        console.error(`SerpAPI error for ${platform}:`, results.error);
        return [];
      }

      if (!results.organic_results || results.organic_results.length === 0) {
        console.log(`⚠️ No results for ${platform}`);
        return [];
      }

      const jobs = this.parseJobResults(results.organic_results, platform);
      console.log(`✅ Found ${jobs.length} jobs from ${platform}`);
      return jobs;
    } catch (error) {
      console.error(`❌ Error searching ${platform}:`, error);
      return [];
    }
  },

  parseJobResults(results: any[], platform: string): any[] {
    return results
      .filter(result => result.link && result.title)
      .map(result => {
        // Extract actual job URL - SerpAPI sometimes returns search result pages
        let jobUrl = result.link;
        
        // For Indeed, try to extract the actual job posting URL
        if (platform === 'Indeed' && result.link) {
          // Check if it's a search results page
          if (result.link.includes('/q-') || result.link.includes('/jobs.html')) {
            // Try to find the actual job URL in the result
            // SerpAPI sometimes provides it in different fields
            if (result.organic_result_link) {
              jobUrl = result.organic_result_link;
            } else if (result.url) {
              jobUrl = result.url;
            } else if (result.link.includes('vjk=')) {
              // Extract job key from search URL and construct job URL
              const vjkMatch = result.link.match(/vjk=([a-f0-9]+)/);
              if (vjkMatch) {
                jobUrl = `https://www.indeed.com/viewjob?jk=${vjkMatch[1]}`;
              }
            }
          }
          
          // Ensure it's a proper job posting URL
          if (!jobUrl.includes('/viewjob') && !jobUrl.includes('/pagead/')) {
            // Try to extract job key from any Indeed URL
            const jkMatch = result.link.match(/[?&]jk=([a-f0-9]+)/);
            if (jkMatch) {
              jobUrl = `https://www.indeed.com/viewjob?jk=${jkMatch[1]}`;
            }
          }
        }
        
        // For LinkedIn
        if (platform === 'LinkedIn' && result.link && !result.link.includes('/jobs/view/')) {
          // Try to extract job ID from URL
          const jobIdMatch = result.link.match(/jobId=(\d+)/);
          if (jobIdMatch) {
            jobUrl = `https://www.linkedin.com/jobs/view/${jobIdMatch[1]}`;
          }
        }
        
        // For Monster, ensure we have an individual job URL
        if (platform === 'Monster' && result.link) {
          // Monster search results often have URLs like monster.com/jobs/search?q=...
          // Individual jobs have URLs like monster.com/jobs/q-[job-id] or monster.com/viewjob?jobid=...
          if (result.link.includes('/jobs/search') || result.link.includes('/jobs/?')) {
            // This is a search results URL, try to find the actual job URL
            if (result.organic_result_link) {
              jobUrl = result.organic_result_link;
            } else if (result.url) {
              jobUrl = result.url;
            }
            // If we can't find individual job URL, log a warning
            if (jobUrl === result.link && (jobUrl.includes('/jobs/search') || jobUrl.includes('/jobs/?'))) {
              console.log(`⚠️ Monster job URL appears to be search results: ${jobUrl}`);
            }
          }
        }
        
        return {
          title: result.title || 'Unknown Position',
          company: this.extractCompany(result.title, result.snippet || ''),
          location: this.extractLocation(result.snippet || ''),
          description: result.snippet || '',
          requirements: '',
          salary: this.extractSalary(result.snippet || ''),
          jobUrl: jobUrl,
          source: platform,
          postedDate: new Date().toISOString().split('T')[0],
        };
      });
  },

  extractCompany(title: string, snippet: string): string {
    // Try to extract company from title (format: "Job Title - Company Name")
    const titleMatch = title.match(/- (.+)$/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Try to extract from snippet (format: "at Company Name")
    const snippetMatch = snippet.match(/at ([A-Z][a-zA-Z0-9\s&]+?)(?: -|,|$|\.)/);
    if (snippetMatch) {
      return snippetMatch[1].trim();
    }

    return 'Unknown Company';
  },

  extractLocation(text: string): string {
    const locationPatterns = [
      /([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/,
      /(Washington,?\s*DC|Arlington,?\s*VA|Remote|Hybrid)/i,
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'Location not specified';
  },

  extractSalary(text: string): string {
    const salaryPatterns = [
      /\$[\d,]+(?:-\$[\d,]+)?/,
      /(\$[\d,]+k?-\$[\d,]+k?)/i,
    ];

    for (const pattern of salaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return '';
  },
};

