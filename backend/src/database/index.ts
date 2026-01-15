import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'talentsearch.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export interface Candidate {
  id: number;
  fullName: string;
  jobTitle: string;
  skills: string;
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
  searchId: number;
  contacted: boolean;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Search {
  id: number;
  skills: string;
  securityClearance: string;
  location: string;
  dateRange: number;
  status: string;
  resultsCount: number;
  createdAt: string;
  updatedAt: string;
}

export function initDatabase() {
  // Create searches table
  db.exec(`
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skills TEXT NOT NULL,
      securityClearance TEXT NOT NULL,
      location TEXT NOT NULL,
      dateRange INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resultsCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create candidates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT NOT NULL,
      jobTitle TEXT NOT NULL,
      skills TEXT NOT NULL,
      yearsOfExperience INTEGER,
      securityClearance TEXT NOT NULL,
      location TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      resumeUrl TEXT,
      resumeDownloadUrl TEXT,
      profileSummary TEXT,
      source TEXT NOT NULL,
      sourceUrl TEXT,
      datePosted TEXT,
      searchId INTEGER NOT NULL,
      contacted BOOLEAN DEFAULT 0,
      contactedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (searchId) REFERENCES searches(id) ON DELETE CASCADE
    )
  `);

  // Create email_templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidateId INTEGER NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (candidateId) REFERENCES candidates(id) ON DELETE CASCADE
    )
  `);

  // Create job_searches table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skills TEXT NOT NULL,
      location TEXT NOT NULL,
      jobType TEXT,
      salaryRange TEXT,
      status TEXT DEFAULT 'pending',
      resultsCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create job_listings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT,
      requirements TEXT,
      salary TEXT,
      jobUrl TEXT NOT NULL,
      source TEXT NOT NULL,
      postedDate TEXT,
      searchId INTEGER,
      status TEXT DEFAULT 'new',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (searchId) REFERENCES job_searches(id) ON DELETE CASCADE
    )
  `);

  // Create job_applications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jobListingId INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      appliedAt TEXT,
      applicationMethod TEXT,
      coverLetter TEXT,
      resumeUsed TEXT,
      confirmationUrl TEXT,
      finalApplicationUrl TEXT,
      atsType TEXT,
      responseReceived BOOLEAN DEFAULT 0,
      responseDate TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (jobListingId) REFERENCES job_listings(id) ON DELETE CASCADE
    )
  `);

  // Create user_profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullName TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      resumePath TEXT,
      coverLetterTemplate TEXT,
      skills TEXT,
      experience TEXT,
      education TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_candidates_searchId ON candidates(searchId);
    CREATE INDEX IF NOT EXISTS idx_candidates_contacted ON candidates(contacted);
    CREATE INDEX IF NOT EXISTS idx_searches_status ON searches(status);
    CREATE INDEX IF NOT EXISTS idx_job_listings_searchId ON job_listings(searchId);
    CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
    CREATE INDEX IF NOT EXISTS idx_job_applications_jobListingId ON job_applications(jobListingId);
  `);

  // Migrate job_applications table if needed (add new columns)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(job_applications)").all() as any[];
    const columnNames = tableInfo.map((col: any) => col.name);
    
    if (!columnNames.includes('confirmationUrl')) {
      db.exec('ALTER TABLE job_applications ADD COLUMN confirmationUrl TEXT');
      console.log('✅ Added confirmationUrl column to job_applications');
    }
    
    if (!columnNames.includes('finalApplicationUrl')) {
      db.exec('ALTER TABLE job_applications ADD COLUMN finalApplicationUrl TEXT');
      console.log('✅ Added finalApplicationUrl column to job_applications');
    }
    
    if (!columnNames.includes('atsType')) {
      db.exec('ALTER TABLE job_applications ADD COLUMN atsType TEXT');
      console.log('✅ Added atsType column to job_applications');
    }
  } catch (error) {
    console.log('⚠️ Migration check completed (columns may already exist)');
  }

  console.log('✅ Database initialized successfully');
}

export const database = db;

