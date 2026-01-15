import { useState, useEffect } from 'react'
import { Loader2, User, MapPin, Briefcase, Shield, Calendar } from 'lucide-react'
import { api } from '../lib/api'
import { Candidate } from '../App'

interface SearchResultsProps {
  searchId: number
  onSelectCandidate: (candidate: Candidate) => void
}

export function SearchResults({ searchId, onSelectCandidate }: SearchResultsProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchStatus, setSearchStatus] = useState<string>('in_progress')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!searchId) {
      setError('Invalid search ID')
      setIsLoading(false)
      return
    }

    let isMounted = true
    let pollTimeout: NodeJS.Timeout | null = null

    const fetchCandidates = async () => {
      if (!isMounted) return

      try {
        // Check search status
        const statusResponse = await api.get(`/search/${searchId}`)
        const newStatus = statusResponse.data.status
        
        if (!isMounted) return
        
        setSearchStatus(newStatus)

        if (newStatus === 'completed' || newStatus === 'in_progress') {
          // Fetch candidates
          const candidatesResponse = await api.get(`/candidates/search/${searchId}`)
          if (isMounted) {
            setCandidates(candidatesResponse.data)
          }
        }

        if (newStatus === 'in_progress') {
          // Poll for updates
          pollTimeout = setTimeout(fetchCandidates, 2000)
        } else {
          setIsLoading(false)
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.response?.data?.error || 'Failed to fetch candidates')
          setIsLoading(false)
        }
      }
    }

    fetchCandidates()

    return () => {
      isMounted = false
      if (pollTimeout) {
        clearTimeout(pollTimeout)
      }
    }
  }, [searchId])

  const getClearanceBadgeColor = (clearance: string) => {
    switch (clearance) {
      case 'TS/SCI':
        return 'bg-purple-100 text-purple-800'
      case 'Top Secret':
        return 'bg-red-100 text-red-800'
      case 'Secret':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading && candidates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
        <p className="text-gray-600">Searching for candidates...</p>
        <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-md">
        {error}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">
          Search Results ({candidates.length} candidates)
        </h2>
        {searchStatus === 'in_progress' && (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Search in progress...</span>
          </div>
        )}
      </div>

      {candidates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-600">No candidates found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              onClick={() => onSelectCandidate(candidate)}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border border-gray-200"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{candidate.fullName}</h3>
                    <p className="text-sm text-gray-600">{candidate.jobTitle}</p>
                  </div>
                </div>
                {candidate.contacted && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    Contacted
                  </span>
                )}
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4" />
                  <span>{candidate.location}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Briefcase className="h-4 w-4" />
                  <span>
                    {candidate.yearsOfExperience
                      ? `${candidate.yearsOfExperience} years`
                      : 'Experience not specified'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4" />
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getClearanceBadgeColor(
                      candidate.securityClearance
                    )}`}
                  >
                    {candidate.securityClearance}
                  </span>
                </div>
                {candidate.datePosted && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Posted {new Date(candidate.datePosted).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-2">Key Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {candidate.skills.slice(0, 5).map((skill, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                    >
                      {skill}
                    </span>
                  ))}
                  {candidate.skills.length > 5 && (
                    <span className="text-xs text-gray-500">+{candidate.skills.length - 5} more</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">Source: {candidate.source}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

