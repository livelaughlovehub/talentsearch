import { Router } from 'express';
import { database } from '../database';
import { jobSearchService } from '../services/jobSearchService';
import { applicationAgent } from '../services/applicationAgent';
import { z } from 'zod';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../../uploads/resumes');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// Search for jobs
router.post('/search', async (req, res) => {
  try {
    const schema = z.object({
      skills: z.string().min(1),
      location: z.string().min(1),
      jobType: z.string().optional(),
      salaryRange: z.string().optional(),
    });

    const validated = schema.parse(req.body);
    
    const stmt = database.prepare(`
      INSERT INTO job_searches (skills, location, jobType, salaryRange, status)
      VALUES (?, ?, ?, ?, 'in_progress')
    `);
    
    const result = stmt.run(
      validated.skills,
      validated.location,
      validated.jobType || null,
      validated.salaryRange || null
    );
    
    const searchId = result.lastInsertRowid as number;

    // Start search in background
    jobSearchService.searchJobs(searchId, validated).catch((error) => {
      console.error('Job search error:', error);
      database.prepare('UPDATE job_searches SET status = ? WHERE id = ?')
        .run('failed', searchId);
    });

    res.json({ 
      id: searchId,
      searchId,
      status: 'in_progress',
      message: 'Job search started successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid search parameters', details: error.errors });
    }
    console.error('Job search creation error:', error);
    res.status(500).json({ error: 'Failed to start job search' });
  }
});

// Get job searches
router.get('/searches', (req, res) => {
  try {
    const searches = database.prepare(`
      SELECT * FROM job_searches 
      ORDER BY createdAt DESC 
      LIMIT 50
    `).all();
    res.json(searches);
  } catch (error) {
    console.error('Get job searches error:', error);
    res.status(500).json({ error: 'Failed to get job searches' });
  }
});

// Get job listings
router.get('/listings', (req, res) => {
  try {
    const { searchId, status } = req.query;
    let query = 'SELECT * FROM job_listings';
    const params: any[] = [];
    const conditions: string[] = [];

    if (searchId) {
      conditions.push('searchId = ?');
      params.push(parseInt(searchId as string));
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY createdAt DESC';

    const jobs = database.prepare(query).all(...params);
    res.json(jobs);
  } catch (error) {
    console.error('Get job listings error:', error);
    res.status(500).json({ error: 'Failed to get job listings' });
  }
});

// Get a single job listing
router.get('/listings/:id', (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const job = database.prepare('SELECT * FROM job_listings WHERE id = ?').get(jobId) as any;
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Apply to a job
router.post('/apply/:jobId', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userProfile = database.prepare('SELECT * FROM user_profiles LIMIT 1').get() as any;
    
    if (!userProfile) {
      return res.status(400).json({ 
        error: 'User profile not configured',
        message: 'Please set up your profile first with resume and contact information'
      });
    }

    // Check if there's an existing application for this job
    const existingApp = database.prepare(`
      SELECT * FROM job_applications 
      WHERE jobListingId = ? 
      ORDER BY createdAt DESC 
      LIMIT 1
    `).get(jobId) as any;

    const config = {
      resumePath: userProfile.resumePath || '',
      coverLetterTemplate: userProfile.coverLetterTemplate || '',
      userProfile,
    };

    const result = await applicationAgent.applyToJob(jobId, config);
    
    // If reapplication and successful, update the existing record
    if (existingApp && result.success) {
      database.prepare(`
        UPDATE job_applications 
        SET status = ?,
            appliedAt = ?,
            applicationMethod = ?,
            coverLetter = ?,
            confirmationUrl = ?,
            finalApplicationUrl = ?,
            atsType = ?,
            notes = ?
        WHERE id = ?
      `).run(
        result.status,
        result.appliedAt || new Date().toISOString(),
        result.status === 'applied' ? 'automated' : 'manual',
        config.coverLetterTemplate,
        result.confirmationUrl || null,
        result.finalUrl || null,
        result.atsType || null,
        result.message || null,
        existingApp.id
      );
      console.log(`✅ Updated existing application record ${existingApp.id} for job ${jobId}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Apply to job error:', error);
    res.status(500).json({ 
      error: 'Failed to apply',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Apply to multiple jobs
router.post('/apply/bulk', async (req, res) => {
  try {
    const schema = z.object({
      jobIds: z.array(z.number().int().positive()),
    });

    const validated = schema.parse(req.body);
    const userProfile = database.prepare('SELECT * FROM user_profiles LIMIT 1').get() as any;
    
    if (!userProfile) {
      return res.status(400).json({ error: 'User profile not configured' });
    }

    const config = {
      resumePath: userProfile.resumePath || '',
      coverLetterTemplate: userProfile.coverLetterTemplate || '',
      userProfile,
    };

    const results = await applicationAgent.applyToMultipleJobs(validated.jobIds, config);
    res.json({ results, total: results.length });
  } catch (error) {
    console.error('Bulk apply error:', error);
    res.status(500).json({ error: 'Failed to apply to jobs' });
  }
});

// Get application status
router.get('/applications', (req, res) => {
  try {
    const applications = database.prepare(`
      SELECT 
        ja.*,
        ja.jobListingId,
        jl.title,
        jl.company,
        jl.location,
        jl.description,
        jl.requirements,
        jl.salary,
        jl.jobUrl,
        jl.source,
        jl.postedDate
      FROM job_applications ja
      JOIN job_listings jl ON ja.jobListingId = jl.id
      ORDER BY ja.appliedAt DESC
    `).all();
    res.json(applications);
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to get applications' });
  }
});

// Test application flow (trace without submitting)
router.post('/apply/:jobId/test', async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = database.prepare('SELECT * FROM job_listings WHERE id = ?').get(jobId) as any;
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // This would trace the flow - for now, return job info
    res.json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        source: job.source,
        jobUrl: job.jobUrl,
      },
      message: 'Use this endpoint to trace application flow. Full implementation coming soon.',
    });
  } catch (error) {
    console.error('Test flow error:', error);
    res.status(500).json({ error: 'Failed to test flow' });
  }
});

// Create/Update user profile with file upload
router.post('/profile', upload.single('resume'), async (req, res) => {
  try {
    const schema = z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      coverLetterTemplate: z.string().optional(),
      skills: z.string().optional(),
      experience: z.string().optional(),
      education: z.string().optional(),
    });

    // Get form data (excluding resume which is in req.file)
    const validated = schema.parse({
      fullName: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      coverLetterTemplate: req.body.coverLetterTemplate,
      skills: req.body.skills,
      experience: req.body.experience,
      education: req.body.education,
    });
    
    // Get resume path if file was uploaded
    let resumePath = null;
    if (req.file) {
      resumePath = req.file.path; // Full path to saved file
      console.log(`📄 Resume uploaded: ${req.file.filename}`);
    }
    
    // Check if profile exists
    const existing = database.prepare('SELECT * FROM user_profiles LIMIT 1').get() as any;
    
    if (existing) {
      // If new resume uploaded, delete old one if it exists
      if (resumePath && existing.resumePath && fs.existsSync(existing.resumePath)) {
        try {
          fs.unlinkSync(existing.resumePath);
          console.log(`🗑️ Deleted old resume: ${existing.resumePath}`);
        } catch (error) {
          console.error('Error deleting old resume:', error);
        }
      }
      
      // Use new resume path or keep existing
      const finalResumePath = resumePath || existing.resumePath;
      
      // Update existing profile
      const stmt = database.prepare(`
        UPDATE user_profiles 
        SET fullName = ?, email = ?, phone = ?, resumePath = ?,
            coverLetterTemplate = ?, skills = ?, experience = ?,
            education = ?, updatedAt = datetime('now')
        WHERE id = ?
      `);
      stmt.run(
        validated.fullName,
        validated.email,
        validated.phone || null,
        finalResumePath,
        validated.coverLetterTemplate || null,
        validated.skills || null,
        validated.experience || null,
        validated.education || null,
        existing.id
      );
    } else {
      // Create new profile
      const stmt = database.prepare(`
        INSERT INTO user_profiles (
          fullName, email, phone, resumePath, coverLetterTemplate,
          skills, experience, education
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        validated.fullName,
        validated.email,
        validated.phone || null,
        resumePath,
        validated.coverLetterTemplate || null,
        validated.skills || null,
        validated.experience || null,
        validated.education || null
      );
    }

    res.json({ 
      success: true, 
      message: 'Profile saved successfully',
      resumePath: resumePath || existing?.resumePath || null,
      resumeUploaded: !!resumePath
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid profile data', details: error.errors });
    }
    console.error('Save profile error:', error);
    res.status(500).json({ 
      error: 'Failed to save profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get user profile
router.get('/profile', (req, res) => {
  try {
    const profile = database.prepare('SELECT * FROM user_profiles LIMIT 1').get();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Get resume file
router.get('/profile/resume', (req, res) => {
  try {
    const profile = database.prepare('SELECT * FROM user_profiles LIMIT 1').get() as any;
    if (!profile || !profile.resumePath) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    if (!fs.existsSync(profile.resumePath)) {
      return res.status(404).json({ error: 'Resume file not found on disk' });
    }
    
    res.sendFile(path.resolve(profile.resumePath));
  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({ error: 'Failed to get resume' });
  }
});

export { router as jobRoutes };

