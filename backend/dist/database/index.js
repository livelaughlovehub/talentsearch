import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.resolve(dataDir, 'talentsearch.db');
export const database = new Database(dbPath);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skills TEXT,
    clearance TEXT,
    location TEXT,
    dateRange TEXT,
    status TEXT,
    resultsCount INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    searchId INTEGER,
    name TEXT,
    title TEXT,
    company TEXT,
    location TEXT,
    skills TEXT,
    summary TEXT,
    source TEXT,
    profileUrl TEXT,
    resumeUrl TEXT,
    contacted INTEGER DEFAULT 0,
    contactedAt TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (searchId) REFERENCES searches(id)
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidateId INTEGER,
    subject TEXT,
    body TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (candidateId) REFERENCES candidates(id)
  );

  CREATE TABLE IF NOT EXISTS job_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    company TEXT,
    location TEXT,
    jobUrl TEXT,
    description TEXT,
    source TEXT,
    status TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobListingId INTEGER,
    status TEXT,
    appliedAt TEXT,
    applicationMethod TEXT,
    coverLetter TEXT,
    resumeUsed TEXT,
    confirmationUrl TEXT,
    finalApplicationUrl TEXT,
    atsType TEXT,
    message TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (jobListingId) REFERENCES job_listings(id)
  );
`);
function ensureColumn(tableName, columnName, columnDef) {
    const columns = database.prepare(`PRAGMA table_info(${tableName});`).all();
    const hasColumn = columns.some((col) => col.name === columnName);
    if (!hasColumn) {
        database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`);
    }
}
ensureColumn('searches', 'clearance', 'clearance TEXT');
ensureColumn('searches', 'dateRange', 'dateRange TEXT');
ensureColumn('searches', 'status', 'status TEXT');
ensureColumn('searches', 'resultsCount', 'resultsCount INTEGER DEFAULT 0');
ensureColumn('searches', 'createdAt', "createdAt TEXT DEFAULT (datetime('now'))");
ensureColumn('candidates', 'summary', 'summary TEXT');
ensureColumn('candidates', 'skills', 'skills TEXT');
ensureColumn('candidates', 'source', 'source TEXT');
ensureColumn('candidates', 'profileUrl', 'profileUrl TEXT');
ensureColumn('candidates', 'resumeUrl', 'resumeUrl TEXT');
ensureColumn('candidates', 'contacted', 'contacted INTEGER DEFAULT 0');
ensureColumn('candidates', 'contactedAt', 'contactedAt TEXT');
ensureColumn('candidates', 'createdAt', "createdAt TEXT DEFAULT (datetime('now'))");
ensureColumn('candidates', 'searchId', 'searchId INTEGER');
ensureColumn('candidates', 'name', 'name TEXT');
ensureColumn('candidates', 'title', 'title TEXT');
ensureColumn('candidates', 'company', 'company TEXT');
ensureColumn('candidates', 'location', 'location TEXT');
ensureColumn('email_templates', 'subject', 'subject TEXT');
ensureColumn('email_templates', 'body', 'body TEXT');
ensureColumn('email_templates', 'createdAt', "createdAt TEXT DEFAULT (datetime('now'))");
ensureColumn('job_listings', 'title', 'title TEXT');
ensureColumn('job_listings', 'company', 'company TEXT');
ensureColumn('job_listings', 'location', 'location TEXT');
ensureColumn('job_listings', 'jobUrl', 'jobUrl TEXT');
ensureColumn('job_listings', 'description', 'description TEXT');
ensureColumn('job_listings', 'source', 'source TEXT');
ensureColumn('job_listings', 'status', 'status TEXT');
ensureColumn('job_listings', 'createdAt', "createdAt TEXT DEFAULT (datetime('now'))");
ensureColumn('job_applications', 'jobListingId', 'jobListingId INTEGER');
ensureColumn('job_applications', 'status', 'status TEXT');
ensureColumn('job_applications', 'appliedAt', 'appliedAt TEXT');
ensureColumn('job_applications', 'applicationMethod', 'applicationMethod TEXT');
ensureColumn('job_applications', 'coverLetter', 'coverLetter TEXT');
ensureColumn('job_applications', 'resumeUsed', 'resumeUsed TEXT');
ensureColumn('job_applications', 'confirmationUrl', 'confirmationUrl TEXT');
ensureColumn('job_applications', 'finalApplicationUrl', 'finalApplicationUrl TEXT');
ensureColumn('job_applications', 'atsType', 'atsType TEXT');
ensureColumn('job_applications', 'message', 'message TEXT');
ensureColumn('job_applications', 'createdAt', "createdAt TEXT DEFAULT (datetime('now'))");
