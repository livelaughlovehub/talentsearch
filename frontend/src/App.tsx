import React, { useEffect, useMemo, useState } from 'react';
import {
  Candidate,
  JobListing,
  SearchRecord,
  applyToJob,
  createSearch,
  fetchCandidates,
  fetchSearchHistory,
  generateEmail,
  searchJobs,
  updateCandidateContact,
} from './api';

type SearchForm = {
  skills: string;
  clearance: string;
  location: string;
  dateRange: string;
};

const initialForm: SearchForm = {
  skills: '',
  clearance: 'None',
  location: '',
  dateRange: '14',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'talent' | 'jobs'>('talent');
  const [form, setForm] = useState<SearchForm>(initialForm);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [emailNotes, setEmailNotes] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchRecord[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sourceSummary, setSourceSummary] = useState<string | null>(null);
  const [jobsQuery, setJobsQuery] = useState('');
  const [jobsLocation, setJobsLocation] = useState('');
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [profile, setProfile] = useState({
    fullName: '',
    email: '',
    phone: '',
    skills: '',
    experience: '',
  });
  const [resumePath, setResumePath] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [applyStatus, setApplyStatus] = useState<string | null>(null);

  const totalResults = candidates.length;

  const handleChange = (key: keyof SearchForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSearch = async () => {
    setLoading(true);
    setEmailDraft(null);
    setSearchError(null);
    setSourceSummary(null);
    try {
      const response = await createSearch(form);
      setSearchId(response.id);
      const results = await fetchCandidates(response.id);
      setCandidates(results);
      setSelected(results[0] ?? null);

      const history = await fetchSearchHistory();
      setSearchHistory(history);
      const url = new URL(window.location.href);
      url.searchParams.set('searchId', String(response.id));
      window.history.replaceState(null, '', url.toString());
      if (response.sourcesQueried && response.sourceCounts) {
        const summary = response.sourcesQueried
          .map((source: string) => `${source}: ${response.sourceCounts[source] || 0}`)
          .join(' · ');
        setSourceSummary(summary);
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Search failed. Please try again.';
      setSearchError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedSkills = useMemo(() => selected?.skills ?? [], [selected]);

  const handleContacted = async () => {
    if (!selected) return;
    const updated = await updateCandidateContact(selected.id, true);
    setCandidates((prev) => prev.map((candidate) => (candidate.id === updated.id ? updated : candidate)));
    setSelected(updated);
  };

  const handleGenerateEmail = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const draft = await generateEmail(
        selected.id,
        selected.company,
        emailNotes
      );
      setEmailDraft(draft);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      const history = await fetchSearchHistory();
      setSearchHistory(history);
    };
    loadHistory();

    const params = new URLSearchParams(window.location.search);
    const searchIdParam = params.get('searchId');
    if (searchIdParam) {
      const id = Number(searchIdParam);
      if (!Number.isNaN(id)) {
        fetchCandidates(id).then((results) => {
          setSearchId(id);
          setCandidates(results);
          setSelected(results[0] ?? null);
        });
      }
    }
  }, []);

  const handleLoadHistory = async (id: number) => {
    setLoading(true);
    try {
      const results = await fetchCandidates(id);
      setSearchId(id);
      setCandidates(results);
      setSelected(results[0] ?? null);

      const url = new URL(window.location.href);
      url.searchParams.set('searchId', String(id));
      window.history.replaceState(null, '', url.toString());
    } finally {
      setLoading(false);
    }
  };

  const formatSearchDate = (value?: string) => {
    if (!value) return 'Unknown date';
    return new Date(value).toLocaleString();
  };

  const getResultsCount = (record: SearchRecord) =>
    record.resultsCount ?? 0;

  const getClearance = (record: SearchRecord) =>
    record.clearance ?? record.securityClearance ?? 'None';

  const getDateRange = (record: SearchRecord) =>
    record.dateRange ?? record.date_range ?? '';

  const handleJobSearch = async () => {
    setLoading(true);
    setApplyStatus(null);
    try {
      const results = await searchJobs(jobsQuery, jobsLocation);
      setJobListings(results);
      setSelectedJob(results[0] ?? null);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedJob) return;
    setLoading(true);
    setApplyStatus(null);
    try {
      const response = await applyToJob(selectedJob.id, {
        resumePath,
        coverLetterTemplate: coverLetter,
        userProfile: profile,
      });
      setApplyStatus(response.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Talent Search & Outreach</h1>
        <p>Find qualified candidates, generate outreach, and track contact status.</p>
      </header>

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'talent' ? 'active' : ''}`}
          onClick={() => setActiveTab('talent')}
        >
          Talent Search
        </button>
        <button
          className={`tab-button ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Job Finder & Apply
        </button>
      </div>

      {activeTab === 'talent' && (
        <>
          <section className="card">
            <div className="form-grid">
              <div>
                <label>Skills</label>
                <input
                  value={form.skills}
                  onChange={handleChange('skills')}
                  placeholder="React, Node, AWS"
                />
              </div>
              <div>
                <label>Security Clearance</label>
                <select value={form.clearance} onChange={handleChange('clearance')}>
                  <option>None</option>
                  <option>Public Trust</option>
                  <option>Secret</option>
                  <option>Top Secret</option>
                </select>
              </div>
              <div>
                <label>Location</label>
                <input
                  value={form.location}
                  onChange={handleChange('location')}
                  placeholder="Washington, DC"
                />
              </div>
              <div>
                <label>Date Range (days)</label>
                <input value={form.dateRange} onChange={handleChange('dateRange')} />
              </div>
            </div>
            <button onClick={handleSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Search for Candidates'}
            </button>
            {searchError && <p className="status">{searchError}</p>}
            {searchId && (
              <p className="status">Search #{searchId} · {totalResults} results</p>
            )}
            {sourceSummary && <p className="muted">{sourceSummary}</p>}

            <div style={{ marginTop: 16 }}>
              <h3>Search History</h3>
              {searchHistory.length === 0 ? (
                <p className="muted">No previous searches yet.</p>
              ) : (
                <div className="grid" style={{ marginTop: 8 }}>
                  {searchHistory.slice(0, 8).map((record) => (
                    <div key={record.id} className="card">
                      <p className="muted">{formatSearchDate(record.createdAt)}</p>
                      <p><strong>Skills:</strong> {record.skills || '—'}</p>
                      <p><strong>Clearance:</strong> {getClearance(record)}</p>
                      <p><strong>Location:</strong> {record.location || '—'}</p>
                      {getDateRange(record) && (
                        <p><strong>Date Range:</strong> {getDateRange(record)} days</p>
                      )}
                      <p><strong>Results:</strong> {getResultsCount(record)}</p>
                      <button
                        className="secondary"
                        onClick={() => handleLoadHistory(record.id)}
                      >
                        View Results
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="card">
              <h2>Results</h2>
              <p className="muted">Click a candidate to view details and outreach tools.</p>
              {['LinkedIn', 'GitHub', 'Indeed', 'Dice'].map((source) => {
                const group = candidates.filter((candidate) => candidate.source === source);
                if (group.length === 0) return null;
                return (
                  <div key={source} style={{ marginTop: 16 }}>
                    <h3>{source}</h3>
                    <div className="grid" style={{ marginTop: 8 }}>
                      {group.map((candidate) => (
                        <div
                          key={candidate.id}
                          className="card candidate-card"
                          style={{ cursor: 'pointer', border: candidate.id === selected?.id ? '2px solid #2563eb' : '2px solid transparent' }}
                          onClick={() => {
                            setSelected(candidate);
                            setEmailDraft(null);
                          }}
                        >
                          <h3>{candidate.name}</h3>
                          <p>{candidate.title}</p>
                          <p>{candidate.company}</p>
                          <p className="muted">{candidate.location} · {candidate.source}</p>
                          <div>
                            {(candidate.skills || []).slice(0, 3).map((skill) => (
                              <span className="pill" key={skill}>{skill}</span>
                            ))}
                          </div>
                          {candidate.contacted ? (
                            <p className="status">Contacted</p>
                          ) : (
                            <p className="status">Not contacted</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card">
              <h2>Candidate Details</h2>
              {selected ? (
                <>
                  <h3>{selected.name}</h3>
                  <p>{selected.title} · {selected.company}</p>
                  <p className="muted">{selected.location}</p>
                  <p>{selected.summary}</p>
                  <div>
                    {selectedSkills.map((skill) => (
                      <span className="pill" key={skill}>{skill}</span>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    <button className="secondary" onClick={handleContacted} disabled={!!selected.contacted}>
                      {selected.contacted ? 'Already Contacted' : 'Mark Contacted'}
                    </button>
                    {selected.profileUrl && (
                      <a href={selected.profileUrl} target="_blank" rel="noreferrer">
                        <button className="secondary">View Profile</button>
                      </a>
                    )}
                  </div>
                  <div style={{ marginTop: 24 }}>
                    <label>Role Requirements</label>
                    <textarea
                      rows={4}
                      placeholder="e.g. Full-stack, client-facing, AWS experience"
                      value={emailNotes}
                      onChange={(event) => setEmailNotes(event.target.value)}
                    />
                    <button onClick={handleGenerateEmail} disabled={loading} style={{ marginTop: 12 }}>
                      {loading ? 'Generating...' : 'Generate & Send Email'}
                    </button>
                    {emailDraft && (
                      <div style={{ marginTop: 16 }}>
                        <h4>Email Draft</h4>
                        <p className="muted">Subject: {emailDraft.subject}</p>
                        <pre style={{ whiteSpace: 'pre-wrap', background: '#f1f5f9', padding: 12, borderRadius: 8 }}>
                          {emailDraft.body}
                        </pre>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Run a search to see candidate details.</p>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === 'jobs' && (
        <>
          <section className="card">
            <div className="form-grid">
              <div>
                <label>Job Keywords</label>
                <input
                  value={jobsQuery}
                  onChange={(event) => setJobsQuery(event.target.value)}
                  placeholder="Java engineer, DevOps, etc."
                />
              </div>
              <div>
                <label>Location</label>
                <input
                  value={jobsLocation}
                  onChange={(event) => setJobsLocation(event.target.value)}
                  placeholder="Remote or city"
                />
              </div>
            </div>
            <button onClick={handleJobSearch} disabled={loading}>
              {loading ? 'Searching...' : 'Find Open Jobs'}
            </button>
          </section>

          <section className="panel">
            <div className="card">
              <h2>Open Jobs</h2>
              <p className="muted">Select a job to review and apply.</p>
              <div className="grid" style={{ marginTop: 16 }}>
                {jobListings.map((job) => (
                  <div
                    key={job.id}
                    className="card candidate-card"
                    style={{ cursor: 'pointer', border: job.id === selectedJob?.id ? '2px solid #2563eb' : '2px solid transparent' }}
                    onClick={() => setSelectedJob(job)}
                  >
                    <h3>{job.title}</h3>
                    <p>{job.company}</p>
                    <p className="muted">{job.location} · {job.source}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Apply</h2>
              {selectedJob ? (
                <>
                  <h3>{selectedJob.title}</h3>
                  <p>{selectedJob.company}</p>
                  <p className="muted">{selectedJob.location}</p>
                  <p>{selectedJob.description}</p>
                  {selectedJob.jobUrl && (
                    <a href={selectedJob.jobUrl} target="_blank" rel="noreferrer">
                      <button className="secondary">View Job Posting</button>
                    </a>
                  )}
                  <div style={{ marginTop: 16 }} className="form-grid">
                    <div>
                      <label>Full Name</label>
                      <input
                        value={profile.fullName}
                        onChange={(event) => setProfile({ ...profile, fullName: event.target.value })}
                      />
                    </div>
                    <div>
                      <label>Email</label>
                      <input
                        value={profile.email}
                        onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                      />
                    </div>
                    <div>
                      <label>Phone</label>
                      <input
                        value={profile.phone}
                        onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                      />
                    </div>
                    <div>
                      <label>Resume File Path</label>
                      <input
                        value={resumePath}
                        onChange={(event) => setResumePath(event.target.value)}
                        placeholder="/path/to/resume.pdf"
                      />
                    </div>
                  </div>
                  <label>Skills</label>
                  <input
                    value={profile.skills}
                    onChange={(event) => setProfile({ ...profile, skills: event.target.value })}
                    placeholder="Java, Spring, AWS"
                  />
                  <label style={{ marginTop: 12 }}>Experience</label>
                  <textarea
                    rows={3}
                    value={profile.experience}
                    onChange={(event) => setProfile({ ...profile, experience: event.target.value })}
                  />
                  <label style={{ marginTop: 12 }}>Cover Letter Notes</label>
                  <textarea
                    rows={3}
                    value={coverLetter}
                    onChange={(event) => setCoverLetter(event.target.value)}
                  />
                  <button onClick={handleApply} disabled={loading} style={{ marginTop: 12 }}>
                    {loading ? 'Submitting...' : 'Apply Now'}
                  </button>
                  {applyStatus && <p className="status">{applyStatus}</p>}
                </>
              ) : (
                <p className="muted">Search and select a job to apply.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

