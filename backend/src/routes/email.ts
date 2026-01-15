import { Router } from 'express';
import { emailService } from '../services/emailService';
import { database } from '../database';
import { z } from 'zod';

const router = Router();

const generateEmailSchema = z.object({
  candidateId: z.number().int().positive(),
  roleRequirements: z.string().optional(),
  companyName: z.string().optional(),
});

// Generate AI email for a candidate
router.post('/generate', async (req, res) => {
  try {
    const validated = generateEmailSchema.parse(req.body);
    
    const candidate = database.prepare('SELECT * FROM candidates WHERE id = ?')
      .get(validated.candidateId) as any;

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    candidate.skills = JSON.parse(candidate.skills || '[]');

    const emailTemplate = await emailService.generateEmail(
      candidate,
      validated.roleRequirements,
      validated.companyName
    );

    // Save email template
    const stmt = database.prepare(`
      INSERT INTO email_templates (candidateId, subject, body)
      VALUES (?, ?, ?)
    `);
    stmt.run(validated.candidateId, emailTemplate.subject, emailTemplate.body);

    res.json(emailTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('Generate email error:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

// Get email templates for a candidate
router.get('/templates/:candidateId', (req, res) => {
  try {
    const candidateId = parseInt(req.params.candidateId);
    const templates = database.prepare(`
      SELECT * FROM email_templates 
      WHERE candidateId = ?
      ORDER BY createdAt DESC
    `).all(candidateId);

    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get email templates' });
  }
});

export { router as emailRoutes };




