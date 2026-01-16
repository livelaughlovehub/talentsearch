import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

export type SearchRequest = {
  skills: string;
  clearance: string;
  location: string;
  dateRange: string;
};

export type Candidate = {
  id: number;
  searchId: number;
  name: string;
  title: string;
  company: string;
  location: string;
  skills: string[];
  summary: string;
  source: string;
  profileUrl?: string;
  resumeUrl?: string;
  contacted: number;
  contactedAt?: string | null;
};

export async function createSearch(payload: SearchRequest) {
  const { data } = await api.post('/api/search', payload);
  return data;
}

export async function fetchCandidates(searchId: number) {
  const { data } = await api.get(`/api/candidates/search/${searchId}`);
  return data as Candidate[];
}

export async function updateCandidateContact(id: number, contacted: boolean) {
  const { data } = await api.patch(`/api/candidates/${id}`, { contacted });
  return data as Candidate;
}

export async function generateEmail(candidateId: number, companyName: string, roleRequirements: string) {
  const { data } = await api.post('/api/email/generate', {
    candidateId,
    companyName,
    roleRequirements,
  });
  return data as { subject: string; body: string };
}

export type JobListing = {
  id: number;
  title: string;
  company: string;
  location: string;
  jobUrl: string;
  description: string;
  source: string;
  status: string;
};

export async function searchJobs(query: string, location: string) {
  const { data } = await api.post('/api/jobs/search', { query, location });
  return data as JobListing[];
}

export async function applyToJob(jobListingId: number, payload: {
  resumePath: string;
  coverLetterTemplate: string;
  userProfile: {
    fullName: string;
    email: string;
    phone?: string;
    skills?: string;
    experience?: string;
  };
}) {
  const { data } = await api.post('/api/jobs/apply', { jobListingId, ...payload });
  return data as { success: boolean; status: string; message: string };
}

