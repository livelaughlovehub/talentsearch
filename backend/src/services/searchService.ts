import { database } from '../database';
import { serpapiService } from './serpapiService';

interface SearchParams {
  skills: string;
  securityClearance: string;
  location: string;
  dateRange: number;
}

export const searchService = {
  async performSearch(searchId: number, params: SearchParams): Promise<void> {
    try {
      // Update search status
      database.prepare('UPDATE searches SET status = ? WHERE id = ?')
        .run('in_progress', searchId);

      // Search across multiple platforms using SerpAPI
      const platforms = ['Indeed', 'LinkedIn', 'Dice', 'Monster', 'ZipRecruiter', 'GitHub'];
      const allCandidates: any[] = [];

      for (const platform of platforms) {
        const candidates = await this.searchPlatform(platform, params);
        allCandidates.push(...candidates);
        
        // Rate limiting delay between platform searches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Filter candidates based on criteria
      const filteredCandidates = this.filterCandidates(allCandidates, params);

      // Save candidates to database
      const insertStmt = database.prepare(`
        INSERT INTO candidates (
          fullName, jobTitle, skills, yearsOfExperience, securityClearance,
          location, email, phone, resumeUrl, resumeDownloadUrl, profileSummary,
          source, sourceUrl, datePosted, searchId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const candidate of filteredCandidates) {
        console.log(`💾 Saving candidate: ${candidate.fullName} - Email: ${candidate.email || 'NONE'}`);
        insertStmt.run(
          candidate.fullName,
          candidate.jobTitle,
          JSON.stringify(candidate.skills),
          candidate.yearsOfExperience,
          candidate.securityClearance,
          candidate.location,
          candidate.email,
          candidate.phone,
          candidate.resumeUrl,
          candidate.resumeDownloadUrl,
          candidate.profileSummary,
          candidate.source,
          candidate.sourceUrl,
          candidate.datePosted,
          searchId
        );
      }

      // Update search status and results count
      database.prepare(`
        UPDATE searches 
        SET status = ?, resultsCount = ?, updatedAt = datetime('now')
        WHERE id = ?
      `).run('completed', filteredCandidates.length, searchId);

      console.log(`✅ Search ${searchId} completed with ${filteredCandidates.length} candidates`);
    } catch (error) {
      console.error(`❌ Search ${searchId} failed:`, error);
      database.prepare('UPDATE searches SET status = ? WHERE id = ?')
        .run('failed', searchId);
      throw error;
    }
  },

  async searchPlatform(platform: string, params: SearchParams): Promise<any[]> {
    // Use SerpAPI for real search results
    if (!process.env.SERPAPI_KEY) {
      console.error(`❌ SERPAPI_KEY not configured. Cannot search ${platform} without API key.`);
      return [];
    }

    try {
      const serpapiCandidates = await serpapiService.searchResumes(platform, params, 10);
      return serpapiCandidates;
    } catch (error) {
      console.error(`❌ SerpAPI error for ${platform}:`, error);
      return []; // Return empty array on error - no mock data fallback
    }
  },

  filterCandidates(candidates: any[], params: SearchParams): any[] {
    const skillsLower = params.skills.toLowerCase().split(',').map(s => s.trim());
    
    return candidates.filter(candidate => {
      // Filter by security clearance
      if (params.securityClearance !== 'None') {
        const clearanceLevels = ['None', 'Secret', 'Top Secret', 'TS/SCI'];
        const candidateLevel = clearanceLevels.indexOf(candidate.securityClearance);
        const requiredLevel = clearanceLevels.indexOf(params.securityClearance);
        if (candidateLevel < requiredLevel) {
          return false;
        }
      }

      // Filter by skills (at least one skill should match)
      const candidateSkills = candidate.skills.map((s: string) => s.toLowerCase());
      const hasMatchingSkill = skillsLower.some(skill => 
        candidateSkills.some((cs: string) => cs.includes(skill))
      );

      return hasMatchingSkill;
    });
  },
};

