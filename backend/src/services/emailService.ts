import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface Candidate {
  fullName: string;
  jobTitle: string;
  skills: string[];
  yearsOfExperience: number | null;
  securityClearance: string;
  location: string;
  profileSummary: string | null;
}

export const emailService = {
  async generateEmail(
    candidate: Candidate,
    roleRequirements?: string,
    companyName?: string
  ): Promise<{ subject: string; body: string }> {
    try {
      const skillsList = candidate.skills.slice(0, 10).join(', ');
      const experience = candidate.yearsOfExperience 
        ? `${candidate.yearsOfExperience} years` 
        : 'extensive';

      const prompt = `You are a professional recruiter writing a personalized outreach email to a potential candidate. 

Candidate Information:
- Name: ${candidate.fullName}
- Current Title: ${candidate.jobTitle}
- Key Skills: ${skillsList}
- Experience: ${experience}
- Security Clearance: ${candidate.securityClearance}
- Location: ${candidate.location}
${candidate.profileSummary ? `- Summary: ${candidate.profileSummary}` : ''}

${roleRequirements ? `Role Requirements: ${roleRequirements}` : ''}
${companyName ? `Company: ${companyName}` : ''}

Write a professional, engaging, and personalized recruitment email that:
1. Opens with a specific reference to their background or skills
2. Clearly explains why they're a good fit
3. Mentions specific skills or experiences that align
4. Includes a clear call-to-action
5. Maintains a professional but warm tone
6. Is concise (3-4 paragraphs max)

Format the response as JSON with "subject" and "body" fields. The subject should be compelling and personalized.`;

      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type === 'text') {
        // Try to parse JSON from the response
        const text = content.text.trim();
        let parsed;
        
        // Extract JSON if wrapped in markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          // Try parsing the whole text as JSON
          parsed = JSON.parse(text);
        }

        return {
          subject: parsed.subject || 'Exciting Opportunity for Your Skills',
          body: parsed.body || text,
        };
      }

      throw new Error('Unexpected response format from Claude API');
    } catch (error) {
      console.error('Email generation error:', error);
      
      // Fallback email template
      return {
        subject: `Exciting Opportunity for ${candidate.jobTitle}`,
        body: `Dear ${candidate.fullName},

I came across your profile and was impressed by your background in ${candidate.skills.slice(0, 3).join(', ')}. With your ${candidate.yearsOfExperience || 'extensive'} years of experience as a ${candidate.jobTitle}, I believe you would be an excellent fit for an opportunity we have available.

Your expertise in ${candidate.skills[0]} and ${candidate.skills[1] || 'related technologies'} aligns perfectly with what we're looking for. Additionally, your ${candidate.securityClearance} security clearance is a valuable asset.

I would love to discuss this opportunity with you further. Would you be available for a brief conversation this week?

Best regards,
Recruitment Team`,
      };
    }
  },
};




