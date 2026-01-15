import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { Search as SearchType } from '../App'

interface SearchFormProps {
  onSearchComplete: (search: SearchType) => void
}

export function SearchForm({ onSearchComplete }: SearchFormProps) {
  const [formData, setFormData] = useState({
    skills: '',
    securityClearance: 'None',
    location: '',
    dateRange: 14,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await api.post('/search', formData)
      onSearchComplete(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start search')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
      <h2 className="text-xl font-semibold mb-6 text-gray-900">Search for Talent</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="skills" className="block text-sm font-medium text-gray-700 mb-2">
            Skills/Keywords *
          </label>
          <input
            type="text"
            id="skills"
            required
            value={formData.skills}
            onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
            placeholder="e.g., Java, Spring, Microservices"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">Separate multiple skills with commas</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="clearance" className="block text-sm font-medium text-gray-700 mb-2">
              Security Clearance Level *
            </label>
            <select
              id="clearance"
              required
              value={formData.securityClearance}
              onChange={(e) => setFormData({ ...formData, securityClearance: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="None">None</option>
              <option value="Secret">Secret</option>
              <option value="Top Secret">Top Secret</option>
              <option value="TS/SCI">TS/SCI</option>
            </select>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              Location *
            </label>
            <input
              type="text"
              id="location"
              required
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Washington, DC or Remote"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 mb-2">
            Date Range (days)
          </label>
          <input
            type="number"
            id="dateRange"
            min="1"
            max="90"
            value={formData.dateRange}
            onChange={(e) => setFormData({ ...formData, dateRange: parseInt(e.target.value) || 14 })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">Search for profiles posted within the last N days (default: 14)</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Starting Search...
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              Search for Candidates
            </>
          )}
        </button>
      </form>
    </div>
  )
}

