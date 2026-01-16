import React, { useMemo, useState } from 'react';
import {
  Candidate,
  createSearch,
  fetchCandidates,
  generateEmail,
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
  const [form, setForm] = useState<SearchForm>(initialForm);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [emailNotes, setEmailNotes] = useState('');

  const totalResults = candidates.length;

  const handleChange = (key: keyof SearchForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleSearch = async () => {
    setLoading(true);
    setEmailDraft(null);
    try {
      const response = await createSearch(form);
      setSearchId(response.id);
      const results = await fetchCandidates(response.id);
      setCandidates(results);
      setSelected(results[0] ?? null);
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

  return (
    <div className="app">
      <header className="header">
        <h1>Talent Search & Outreach</h1>
        <p>Find qualified candidates, generate outreach, and track contact status.</p>
      </header>

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
        {searchId && (
          <p className="status">Search #{searchId} · {totalResults} results</p>
        )}
      </section>

      <section className="panel">
        <div className="card">
          <h2>Results</h2>
          <p className="muted">Click a candidate to view details and outreach tools.</p>
          <div className="grid" style={{ marginTop: 16 }}>
            {candidates.map((candidate) => (
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
    </div>
  );
}

