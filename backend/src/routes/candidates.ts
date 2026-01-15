import { Router } from 'express';
import { database } from '../database';

const router = Router();

// Get all candidates for a search
router.get('/search/:searchId', (req, res) => {
  try {
    const searchId = parseInt(req.params.searchId);
    const candidates = database.prepare(`
      SELECT * FROM candidates 
      WHERE searchId = ?
      ORDER BY createdAt DESC
    `).all(searchId) as any[];

    // Parse skills JSON
    const parsedCandidates = candidates.map(c => ({
      ...c,
      skills: JSON.parse(c.skills || '[]'),
      contacted: Boolean(c.contacted),
    }));

    res.json(parsedCandidates);
  } catch (error) {
    console.error('Get candidates error:', error);
    res.status(500).json({ error: 'Failed to get candidates' });
  }
});

// Get a single candidate
router.get('/:id', (req, res) => {
  try {
    const candidateId = parseInt(req.params.id);
    const candidate = database.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as any;

    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    candidate.skills = JSON.parse(candidate.skills || '[]');
    candidate.contacted = Boolean(candidate.contacted);

    res.json(candidate);
  } catch (error) {
    console.error('Get candidate error:', error);
    res.status(500).json({ error: 'Failed to get candidate' });
  }
});

// Update candidate (e.g., mark as contacted)
router.patch('/:id', (req, res) => {
  try {
    const candidateId = parseInt(req.params.id);
    const { contacted, notes } = req.body;

    if (contacted !== undefined) {
      const stmt = database.prepare(`
        UPDATE candidates 
        SET contacted = ?, contactedAt = ?, updatedAt = datetime('now')
        WHERE id = ?
      `);
      stmt.run(contacted ? 1 : 0, contacted ? new Date().toISOString() : null, candidateId);
    }

    const updated = database.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as any;
    updated.skills = JSON.parse(updated.skills || '[]');
    updated.contacted = Boolean(updated.contacted);

    res.json(updated);
  } catch (error) {
    console.error('Update candidate error:', error);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// Get all candidates (across all searches)
router.get('/', (req, res) => {
  try {
    const { limit = 100, offset = 0, contacted } = req.query;
    
    let query = 'SELECT * FROM candidates';
    const params: any[] = [];
    
    if (contacted !== undefined) {
      query += ' WHERE contacted = ?';
      params.push(contacted === 'true' ? 1 : 0);
    }
    
    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string), parseInt(offset as string));

    const candidates = database.prepare(query).all(...params) as any[];
    
    const parsedCandidates = candidates.map(c => ({
      ...c,
      skills: JSON.parse(c.skills || '[]'),
      contacted: Boolean(c.contacted),
    }));

    res.json(parsedCandidates);
  } catch (error) {
    console.error('Get all candidates error:', error);
    res.status(500).json({ error: 'Failed to get candidates' });
  }
});

export { router as candidateRoutes };




