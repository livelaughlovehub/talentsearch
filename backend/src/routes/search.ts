import { Router } from 'express';
import { searchService } from '../services/searchService';
import { database } from '../database';
import { z } from 'zod';

const router = Router();

const searchSchema = z.object({
  skills: z.string().min(1),
  securityClearance: z.enum(['None', 'Secret', 'Top Secret', 'TS/SCI']),
  location: z.string().min(1),
  dateRange: z.number().int().positive().default(14),
});

// Create a new search
router.post('/', async (req, res) => {
  try {
    const validated = searchSchema.parse(req.body);
    
    // Create search record
    const stmt = database.prepare(`
      INSERT INTO searches (skills, securityClearance, location, dateRange, status)
      VALUES (?, ?, ?, ?, 'in_progress')
    `);
    
    const result = stmt.run(
      validated.skills,
      validated.securityClearance,
      validated.location,
      validated.dateRange
    );
    
    const searchId = result.lastInsertRowid as number;

    // Start search in background
    searchService.performSearch(searchId, validated).catch((error) => {
      console.error('Search error:', error);
      database.prepare('UPDATE searches SET status = ? WHERE id = ?')
        .run('failed', searchId);
    });

    res.json({ 
      id: searchId,
      searchId,
      status: 'in_progress',
      message: 'Search started successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search parameters', details: error.errors });
    }
    console.error('Search creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to create search',
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined })
    });
  }
});

// Get search status
router.get('/:id', (req, res) => {
  try {
    const searchId = parseInt(req.params.id);
    const search = database.prepare('SELECT * FROM searches WHERE id = ?').get(searchId) as any;
    
    if (!search) {
      return res.status(404).json({ error: 'Search not found' });
    }

    res.json(search);
  } catch (error) {
    console.error('Get search error:', error);
    res.status(500).json({ error: 'Failed to get search' });
  }
});

// Get all searches
router.get('/', (req, res) => {
  try {
    const searches = database.prepare(`
      SELECT * FROM searches 
      ORDER BY createdAt DESC 
      LIMIT 50
    `).all();
    
    res.json(searches);
  } catch (error) {
    console.error('Get searches error:', error);
    res.status(500).json({ error: 'Failed to get searches' });
  }
});

export { router as searchRoutes };

