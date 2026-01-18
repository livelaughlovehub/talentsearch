import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { database } from './database/index.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const port = Number(process.env.PORT || 3001);

let anthropic: Anthropic | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const searchColumns = database.prepare('PRAGMA table_info(searches);').all().map((col: any) => col.name);
const hasClearance = searchColumns.includes('clearance');
const hasSecurityClearance = searchColumns.includes('securityClearance');
const hasDateRange = searchColumns.includes('dateRange');
const hasDateRangeSnake = searchColumns.includes('date_range');
const resultsCountColumn = searchColumns.includes('resultsCount') ? 'resultsCount' : null;
const statusColumn = searchColumns.includes('status') ? 'status' : null;

const candidateColumns = database.prepare('PRAGMA table_info(candidates);').all().map((col: any) => col.name);
const candidateNameColumns = candidateColumns.filter((col) => ['name', 'fullName'].includes(col));
const candidateTitleColumns = candidateColumns.filter((col) => ['title', 'jobTitle'].includes(col));
const candidateCompanyColumns = candidateColumns.filter((col) => ['company', 'companyName', 'employer'].includes(col));
const candidateLocationColumns = candidateColumns.filter((col) => ['location', 'city'].includes(col));
const candidateClearanceColumns = candidateColumns.filter((col) => ['securityClearance', 'clearance'].includes(col));
const hasCandidateSearchId = candidateColumns.includes('searchId');
const hasCandidateSkills = candidateColumns.includes('skills');
const hasCandidateSummary = candidateColumns.includes('summary');
const hasCandidateSource = candidateColumns.includes('source');
const hasCandidateProfileUrl = candidateColumns.includes('profileUrl');
const hasCandidateResumeUrl = candidateColumns.includes('resumeUrl');
const hasCandidateContacted = candidateColumns.includes('contacted');
const hasCandidateContactedAt = candidateColumns.includes('contactedAt');
const hasCandidateCreatedAt = candidateColumns.includes('createdAt');

type CandidateRecord = {
  name: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  summary: string;
  source: string;
  profileUrl?: string;
  resumeUrl?: string;
};

type JobListing = {
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  description: string;
  source: string;
};

const sampleNames = [
  'Jordan Miles',
  'Avery Chen',
  'Riley Patel',
  'Morgan Lee',
  'Casey Brooks',
  'Taylor Nguyen',
];

const sampleTitles = [
  'Senior Software Engineer',
  'Full Stack Developer',
  'DevOps Engineer',
  'Data Engineer',
  'Frontend Engineer',
  'Backend Engineer',
];

const sampleSources = ['LinkedIn', 'Indeed', 'Dice', 'Monster', 'ZipRecruiter', 'GitHub'];

function createMockCandidates(count: number, skills: string[], location: string): CandidateRecord[] {
  const normalizedSkills = skills.filter(Boolean);
  const candidates: CandidateRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const name = sampleNames[i % sampleNames.length];
    const title = sampleTitles[i % sampleTitles.length];
    const company = `Company ${String.fromCharCode(65 + (i % 6))}`;
    const source = sampleSources[i % sampleSources.length];
    const summary = `${name} is a ${title} with experience in ${normalizedSkills.slice(0, 3).join(', ') || 'modern web stacks'}.`;

    candidates.push({
      name,
      title,
      company,
      location: location || 'Remote',
      skills: normalizedSkills.length ? normalizedSkills : ['JavaScript', 'React', 'Node.js'],
      summary,
      source,
      profileUrl: `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
      resumeUrl: '',
    });
  }

  return candidates;
}

type CandidateSource = {
  id: string;
  label: string;
  siteQuery: string;
  queryHint?: string;
  urlMustInclude?: string[];
  urlMustNotInclude?: string[];
};

const defaultCandidateSources: CandidateSource[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    siteQuery: 'site:linkedin.com/in',
    queryHint: '"software engineer" OR developer OR "data engineer"',
    urlMustInclude: ['linkedin.com/in/'],
    urlMustNotInclude: ['linkedin.com/jobs', 'linkedin.com/company'],
  },
  {
    id: 'github',
    label: 'GitHub',
    siteQuery: 'site:github.com',
    queryHint: '"followers" "repositories" -topics -orgs -search -blog',
    urlMustNotInclude: [
      'github.com/topics',
      'github.com/search',
      'github.com/blog',
      'github.com/marketplace',
      'github.com/sponsors',
      'github.com/collections',
    ],
  },
  {
    id: 'indeed',
    label: 'Indeed',
    siteQuery: 'site:indeed.com/resume OR site:indeed.com/resumes OR site:indeed.com/r/',
    queryHint: '"resume" OR "profile"',
    urlMustInclude: ['indeed.com/resume', 'indeed.com/resumes', 'indeed.com/r/'],
  },
  {
    id: 'dice',
    label: 'Dice',
    siteQuery: 'site:dice.com/resume',
    queryHint: '"resume" OR "profile"',
    urlMustInclude: ['dice.com/resume'],
  },
];

const enabledSourceIds = process.env.CANDIDATE_SOURCES
  ? process.env.CANDIDATE_SOURCES.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  : defaultCandidateSources.map((source) => source.id);

const candidateSources = defaultCandidateSources.filter((source) => enabledSourceIds.includes(source.id));

function scoreCandidateResult(text: string, skills: string[]) {
  if (!skills.length) return 1;
  const normalized = text.toLowerCase();
  return skills.reduce((score, skill) => (normalized.includes(skill.toLowerCase()) ? score + 1 : score), 0);
}

const badResultKeywords = [
  'salary',
  'career',
  'how to',
  'what is',
  'definition',
  'hiring',
  'apply',
  'resume template',
  'resume builder',
];

function containsAny(value: string, checks?: string[]) {
  if (!checks || checks.length === 0) return false;
  const normalized = value.toLowerCase();
  return checks.some((check) => normalized.includes(check.toLowerCase()));
}

function isValidCandidateUrl(sourceId: string, url: string) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (sourceId === 'linkedin') {
      return parsed.hostname.includes('linkedin.com') && parsed.pathname.includes('/in/');
    }
    if (sourceId === 'github') {
      if (!parsed.hostname.includes('github.com')) return false;
      if (pathParts.length < 1) return false;
      const blocked = new Set([
        'orgs',
        'topics',
        'search',
        'blog',
        'marketplace',
        'sponsors',
        'collections',
        'features',
        'about',
        'pricing',
        'contact',
        'security',
        'login',
        'join',
      ]);
      return !blocked.has(pathParts[0].toLowerCase());
    }
    if (sourceId === 'indeed') {
      return url.includes('/r/') || url.includes('/resumes/') || url.includes('/resume/');
    }
    if (sourceId === 'dice') {
      return url.includes('/resume');
    }
    return true;
  } catch {
    return false;
  }
}

type SerpEntry = { result: any; score: number };

async function fetchSerpApiCandidates(skills: string[], location: string): Promise<CandidateRecord[]> {
  if (!process.env.SERPAPI_KEY || process.env.CANDIDATE_SERPAPI_ENABLED !== 'true') {
    return [];
  }

  const queryBase = skills.length ? skills.join(' ') : 'software engineer';

  const fetches = candidateSources.map(async (source) => {
    try {
      const { data } = await axios.get('https://serpapi.com/search.json', {
        params: {
          engine: 'google',
          q: `${queryBase} ${location || ''} ${source.siteQuery} ${source.queryHint || ''}`.trim(),
          location: location || 'United States',
          api_key: process.env.SERPAPI_KEY,
        },
        timeout: 12000,
      });

      const organic = Array.isArray(data.organic_results) ? data.organic_results : [];
      return organic
        .map((result: any) => {
          const title = result?.title || 'Candidate';
          const snippet = result?.snippet || '';
          const score = scoreCandidateResult(`${title} ${snippet}`, skills);
          return { result, score };
        })
        .filter((entry: SerpEntry) => {
          const title = entry.result?.title || '';
          const snippet = entry.result?.snippet || '';
          const url = entry.result?.link || '';
          if (containsAny(`${title} ${snippet}`, badResultKeywords)) return false;
          if (source.urlMustInclude && !containsAny(url, source.urlMustInclude)) return false;
          if (source.urlMustNotInclude && containsAny(url, source.urlMustNotInclude)) return false;
          if (!isValidCandidateUrl(source.id, url)) return false;
          return true;
        })
        .filter((entry: SerpEntry) => (skills.length ? entry.score > 0 : true))
        .sort((a: SerpEntry, b: SerpEntry) => b.score - a.score)
        .slice(0, 3)
        .map(({ result }: SerpEntry) => ({
          name: result?.title?.split(' | ')[0] || 'Candidate',
          title: result?.snippet?.split(' · ')[0] || 'Candidate',
          company: source.label,
          location: location || 'Remote',
          skills: [],
          summary: result?.snippet || 'Sourced from SerpAPI search.',
          source: source.label,
          profileUrl: result?.link || '',
          resumeUrl: '',
        }));
    } catch (error) {
      return [];
    }
  });

  const settled = await Promise.allSettled(fetches);
  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}

async function fetchSerpApiJobs(query: string, location: string): Promise<JobListing[]> {
  if (!process.env.SERPAPI_KEY) {
    return [];
  }

  try {
    const { data } = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_jobs',
        q: query,
        location: location || 'United States',
        api_key: process.env.SERPAPI_KEY,
      },
      timeout: 15000,
    });

    const results = Array.isArray(data.jobs_results) ? data.jobs_results : [];
    return results.slice(0, 10).map((job: any) => ({
      title: job?.title || 'Open Role',
      company: job?.company_name || 'Unknown Company',
      location: job?.location || location || 'Remote',
      jobUrl: job?.related_links?.[0]?.link || job?.share_link || '',
      description: job?.description?.slice(0, 400) || 'Sourced from SerpAPI jobs search.',
      source: 'SerpAPI',
    }));
  } catch (error) {
    return [];
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/search', async (req, res) => {
  const { skills = '', clearance = '', location = '', dateRange = '14' } = req.body || {};
  const skillList = String(skills)
    .split(',')
    .map((skill: string) => skill.trim())
    .filter(Boolean);

  const insertColumns: string[] = ['skills', 'location'];
  const insertValues: Array<string | number> = [skills, location];

  if (hasClearance) {
    insertColumns.push('clearance');
    insertValues.push(clearance || 'None');
  }

  if (hasSecurityClearance) {
    insertColumns.push('securityClearance');
    insertValues.push(clearance || 'None');
  }

  if (hasDateRange) {
    insertColumns.push('dateRange');
    insertValues.push(dateRange);
  }

  if (hasDateRangeSnake) {
    insertColumns.push('date_range');
    insertValues.push(dateRange);
  }

  if (statusColumn) {
    insertColumns.push(statusColumn);
    insertValues.push('completed');
  }

  if (resultsCountColumn) {
    insertColumns.push(resultsCountColumn);
    insertValues.push(0);
  }

  const insertSearch = database.prepare(
    `INSERT INTO searches (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`
  );

  const result = insertSearch.run(...insertValues);
  const searchId = Number(result.lastInsertRowid);

  if (process.env.CANDIDATE_SERPAPI_ENABLED !== 'true') {
    res.status(400).json({
      message: 'Real candidate search is disabled. Set CANDIDATE_SERPAPI_ENABLED=true to enable SerpAPI.',
    });
    return;
  }
  if (skillList.length === 0) {
    res.status(400).json({
      message: 'Please enter at least one skill to find real candidates.',
    });
    return;
  }

  const serpCandidates = await fetchSerpApiCandidates(skillList, location);

  const candidates = serpCandidates;

  const candidateInsertColumns: string[] = [];
  if (hasCandidateSearchId) candidateInsertColumns.push('searchId');
  candidateInsertColumns.push(...candidateNameColumns);
  candidateInsertColumns.push(...candidateTitleColumns);
  candidateInsertColumns.push(...candidateCompanyColumns);
  candidateInsertColumns.push(...candidateLocationColumns);
  candidateInsertColumns.push(...candidateClearanceColumns);
  if (hasCandidateSkills) candidateInsertColumns.push('skills');
  if (hasCandidateSummary) candidateInsertColumns.push('summary');
  if (hasCandidateSource) candidateInsertColumns.push('source');
  if (hasCandidateProfileUrl) candidateInsertColumns.push('profileUrl');
  if (hasCandidateResumeUrl) candidateInsertColumns.push('resumeUrl');
  if (hasCandidateContacted) candidateInsertColumns.push('contacted');
  if (hasCandidateContactedAt) candidateInsertColumns.push('contactedAt');
  if (hasCandidateCreatedAt) candidateInsertColumns.push('createdAt');

  const insertCandidate = database.prepare(
    `INSERT INTO candidates (${candidateInsertColumns.join(', ')}) VALUES (${candidateInsertColumns.map(() => '?').join(', ')})`
  );

  for (const candidate of candidates) {
    const candidateValues: Array<string | number | null> = [];
    if (hasCandidateSearchId) candidateValues.push(searchId);
    candidateNameColumns.forEach(() => candidateValues.push(candidate.name));
    candidateTitleColumns.forEach(() => candidateValues.push(candidate.title));
    candidateCompanyColumns.forEach(() => candidateValues.push(candidate.company));
    candidateLocationColumns.forEach(() => candidateValues.push(candidate.location));
    candidateClearanceColumns.forEach(() => candidateValues.push(clearance || 'None'));
    if (hasCandidateSkills) candidateValues.push(JSON.stringify(candidate.skills));
    if (hasCandidateSummary) candidateValues.push(candidate.summary);
    if (hasCandidateSource) candidateValues.push(candidate.source);
    if (hasCandidateProfileUrl) candidateValues.push(candidate.profileUrl || '');
    if (hasCandidateResumeUrl) candidateValues.push(candidate.resumeUrl || '');
    if (hasCandidateContacted) candidateValues.push(0);
    if (hasCandidateContactedAt) candidateValues.push(null);
    if (hasCandidateCreatedAt) candidateValues.push(new Date().toISOString());

    insertCandidate.run(...candidateValues);
  }

  if (resultsCountColumn) {
    database.prepare(`UPDATE searches SET ${resultsCountColumn} = ? WHERE id = ?`).run(candidates.length, searchId);
  }

  const sourceCounts = candidates.reduce<Record<string, number>>((acc, candidate) => {
    acc[candidate.source] = (acc[candidate.source] || 0) + 1;
    return acc;
  }, {});

  res.json({
    id: searchId,
    status: 'completed',
    resultsCount: candidates.length,
    sourcesQueried: candidateSources.map((source) => source.label),
    sourceCounts,
  });
});

app.get('/api/search', (_req, res) => {
  const rows = database.prepare('SELECT * FROM searches ORDER BY createdAt DESC').all();
  res.json(rows);
});

app.get('/api/search/:id', (req, res) => {
  const search = database.prepare('SELECT * FROM searches WHERE id = ?').get(req.params.id) as any;
  if (!search) {
    res.status(404).json({ message: 'Search not found' });
    return;
  }
  res.json(search);
});

app.get('/api/candidates/search/:searchId', (req, res) => {
  const rows = database
    .prepare('SELECT * FROM candidates WHERE searchId = ? ORDER BY id DESC')
    .all(req.params.searchId);
  res.json(rows.map((row: any) => ({ ...row, skills: safeJsonParse(row.skills) })));
});

app.get('/api/candidates/:id', (req, res) => {
  const row = database.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ message: 'Candidate not found' });
    return;
  }
  res.json({ ...row, skills: safeJsonParse(row.skills) });
});

app.get('/api/candidates', (req, res) => {
  const contacted = req.query.contacted;
  let rows;
  if (contacted === 'true' || contacted === 'false') {
    rows = database
      .prepare('SELECT * FROM candidates WHERE contacted = ? ORDER BY createdAt DESC')
      .all(contacted === 'true' ? 1 : 0);
  } else {
    rows = database.prepare('SELECT * FROM candidates ORDER BY createdAt DESC').all();
  }
  res.json(rows.map((row: any) => ({ ...row, skills: safeJsonParse(row.skills) })));
});

app.patch('/api/candidates/:id', (req, res) => {
  const { contacted } = req.body || {};
  const contactedValue = contacted ? 1 : 0;
  const contactedAt = contacted ? new Date().toISOString() : null;

  const result = database
    .prepare('UPDATE candidates SET contacted = ?, contactedAt = ? WHERE id = ?')
    .run(contactedValue, contactedAt, req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ message: 'Candidate not found' });
    return;
  }

  const updated = database.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id) as any;
  res.json({ ...(updated || {}), skills: safeJsonParse(updated?.skills) });
});

app.post('/api/email/generate', async (req, res) => {
  const { candidateId, companyName = '', roleRequirements = '' } = req.body || {};
  if (!candidateId) {
    res.status(400).json({ message: 'candidateId is required' });
    return;
  }

  const candidate = database.prepare('SELECT * FROM candidates WHERE id = ?').get(candidateId) as any;
  if (!candidate) {
    res.status(404).json({ message: 'Candidate not found' });
    return;
  }

  let subject = `Opportunity at ${companyName || candidate.company}`;
  let body = `Hi ${candidate.name},\n\n` +
    `I came across your profile and thought you might be a strong fit for a ${candidate.title} opportunity at ${companyName || candidate.company}. ` +
    `Your experience with ${(safeJsonParse(candidate.skills) || []).slice(0, 3).join(', ') || 'modern technologies'} stood out.\n\n` +
    `If you're open to a quick chat, I'd love to share more details and learn about your goals.\n\n` +
    `Best regards,\nTalent Search Team`;

  if (anthropic) {
    try {
      const prompt = `Write a concise recruiting outreach email.\n\nCandidate: ${candidate.name}\nTitle: ${candidate.title}\nCompany: ${companyName || candidate.company}\nSkills: ${safeJsonParse(candidate.skills).join(', ')}\nRole requirements: ${roleRequirements}\n\nReturn subject line and email body.`;
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const text = content.text.trim();
        const lines = text.split('\n').filter(Boolean);
        if (lines[0]?.toLowerCase().startsWith('subject')) {
          subject = lines[0].replace(/^subject:\s*/i, '');
          body = lines.slice(1).join('\n').trim();
        } else {
          body = text;
        }
      }
    } catch (error) {
      // Keep fallback content on AI errors.
    }
  }

  const insertTemplate = database.prepare(`
    INSERT INTO email_templates (candidateId, subject, body) VALUES (?, ?, ?)
  `);
  insertTemplate.run(candidateId, subject, body);

  res.json({ candidateId, subject, body });
});

app.get('/api/email/templates/:candidateId', (req, res) => {
  const rows = database
    .prepare('SELECT * FROM email_templates WHERE candidateId = ? ORDER BY createdAt DESC')
    .all(req.params.candidateId);
  res.json(rows);
});

app.post('/api/jobs/search', async (req, res) => {
  const { query = '', location = '' } = req.body || {};
  const keyword = String(query).trim();
  const jobResults = keyword
    ? await fetchSerpApiJobs(keyword, location)
    : [];

  const listings = jobResults.length
    ? jobResults
    : [
        {
          title: 'Software Engineer',
          company: 'Sample Company',
          location: location || 'Remote',
          jobUrl: 'https://example.com/jobs/software-engineer',
          description: 'Sample job listing for demonstration.',
          source: 'Mock',
        },
      ];

  const insertListing = database.prepare(`
    INSERT INTO job_listings (title, company, location, jobUrl, description, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const inserted = listings.map((listing) => {
    const result = insertListing.run(
      listing.title,
      listing.company,
      listing.location,
      listing.jobUrl,
      listing.description,
      listing.source,
      'new'
    );
    return { id: Number(result.lastInsertRowid), ...listing, status: 'new' };
  });

  res.json(inserted);
});

app.get('/api/jobs', (_req, res) => {
  const rows = database.prepare('SELECT * FROM job_listings ORDER BY createdAt DESC').all();
  res.json(rows);
});

app.post('/api/jobs/apply', async (req, res) => {
  const { jobListingId, resumePath = '', coverLetterTemplate = '', userProfile = {} } = req.body || {};
  if (!jobListingId) {
    res.status(400).json({ message: 'jobListingId is required' });
    return;
  }

  const job = database.prepare('SELECT * FROM job_listings WHERE id = ?').get(jobListingId);
  if (!job) {
    res.status(404).json({ message: 'Job listing not found' });
    return;
  }

  const automationEnabled = process.env.APPLY_AUTOMATION_ENABLED === 'true';
  if (automationEnabled) {
    try {
      const { applicationAgent } = await import('./services/applicationAgent.js');
      const result = await applicationAgent.applyToJob(jobListingId, {
        resumePath,
        coverLetterTemplate,
        userProfile,
      });
      res.json(result);
      return;
    } catch (error) {
      res.status(500).json({ message: 'Automation failed', error: String(error) });
      return;
    }
  }

  database.prepare(`
    INSERT INTO job_applications (
      jobListingId, status, appliedAt, applicationMethod, coverLetter, resumeUsed, message
    ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?)
  `).run(jobListingId, 'manual_required', 'manual', coverLetterTemplate, resumePath, 'Manual application required.');

  res.json({
    success: false,
    status: 'manual_required',
    message: 'Automation is disabled. Please apply manually using the job link.',
  });
});

function safeJsonParse(value: any): any[] {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

