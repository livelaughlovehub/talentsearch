import { useState } from 'react'
import { SearchForm } from './components/SearchForm'
import { SearchResults } from './components/SearchResults'
import { CandidateDetail } from './components/CandidateDetail'
import { JobAgent } from './components/JobAgent'
import { Header } from './components/Header'

export interface Candidate {
  id: number
  fullName: string
  jobTitle: string
  skills: string[]
  yearsOfExperience: number | null
  securityClearance: string
  location: string
  email: string | null
  phone: string | null
  resumeUrl: string | null
  resumeDownloadUrl: string | null
  profileSummary: string | null
  source: string
  sourceUrl: string | null
  datePosted: string | null
  searchId: number
  contacted: boolean
  contactedAt: string | null
}

export interface Search {
  id: number
  skills: string
  securityClearance: string
  location: string
  dateRange: number
  status: string
  resultsCount: number
  createdAt: string
  updatedAt: string
}

function App() {
  const [currentSearch, setCurrentSearch] = useState<Search | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [activeTab, setActiveTab] = useState<'talent' | 'jobs'>('talent')

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab('talent')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'talent'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Talent Search
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                activeTab === 'jobs'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Job Agent
            </button>
          </nav>
        </div>

        {activeTab === 'talent' ? (
          !selectedCandidate ? (
            <>
              <SearchForm onSearchComplete={setCurrentSearch} />
              {currentSearch && (
                <SearchResults
                  searchId={currentSearch.id}
                  onSelectCandidate={setSelectedCandidate}
                />
              )}
            </>
          ) : (
            <CandidateDetail
              candidate={selectedCandidate}
              onBack={() => setSelectedCandidate(null)}
              onUpdate={(updated) => setSelectedCandidate(updated)}
            />
          )
        ) : (
          <JobAgent />
        )}
      </main>
    </div>
  )
}

export default App

