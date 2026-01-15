import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Briefcase, Send, Check, X, Loader2, Search, FileText, User } from 'lucide-react'

export function JobAgent() {
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState<number | null>(null) // Track which job is being applied to
  const [jobs, setJobs] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [showProfileView, setShowProfileView] = useState(false)
  const [searchForm, setSearchForm] = useState({
    skills: '',
    location: '',
  })

  useEffect(() => {
    fetchJobs()
    fetchApplications()
    fetchProfile()
  }, [])

  const fetchJobs = async () => {
    try {
      const response = await api.get('/jobs/listings')
      setJobs(response.data)
    } catch (error) {
      console.error('Error fetching jobs:', error)
    }
  }

  const fetchApplications = async () => {
    try {
      const response = await api.get('/jobs/applications')
      setApplications(response.data)
    } catch (error) {
      console.error('Error fetching applications:', error)
    }
  }

  const fetchProfile = async () => {
    try {
      const response = await api.get('/jobs/profile')
      setProfile(response.data)
    } catch (error: any) {
      if (error.response?.status === 404) {
        setShowProfileForm(true)
      }
    }
  }

  const searchJobs = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    try {
      await api.post('/jobs/search', searchForm)
      // Poll for results
      setTimeout(() => {
        fetchJobs()
        setSearching(false)
      }, 10000)
    } catch (error) {
      console.error(error)
      setSearching(false)
    }
  }

  const applyToJob = async (jobId: number) => {
    if (!profile) {
      alert('Please set up your profile first!')
      setShowProfileForm(true)
      return
    }

    if (applying !== null) {
      alert('Please wait for the current application to complete')
      return
    }

    setApplying(jobId)
    try {
      await api.post(`/jobs/apply/${jobId}`)
      fetchApplications()
      fetchJobs()
      // Note: Success/failure message is shown via the applications list update
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.error || error.response?.data?.message || 'Failed to apply'}`)
    } finally {
      setApplying(null)
    }
  }

  const reapplyToJob = async (jobListingId: number) => {
    if (!profile) {
      alert('Please set up your profile first!')
      setShowProfileForm(true)
      return
    }

    if (applying !== null) {
      alert('Please wait for the current application to complete')
      return
    }

    setApplying(jobListingId)
    try {
      await api.post(`/jobs/apply/${jobListingId}`)
      fetchApplications()
      fetchJobs()
      alert('Re-application submitted! Check the status below.')
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.error || error.response?.data?.message || 'Failed to reapply'}`)
    } finally {
      setApplying(null)
    }
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    
    // Create FormData for file upload
    const uploadFormData = new FormData()
    uploadFormData.append('fullName', formData.get('fullName') as string)
    uploadFormData.append('email', formData.get('email') as string)
    uploadFormData.append('phone', (formData.get('phone') as string) || '')
    uploadFormData.append('skills', (formData.get('skills') as string) || '')
    uploadFormData.append('experience', (formData.get('experience') as string) || '')
    uploadFormData.append('education', (formData.get('education') as string) || '')
    
    // Add resume file if selected
    const resumeFile = form.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0]
    if (resumeFile) {
      uploadFormData.append('resume', resumeFile)
    }

    try {
      const response = await api.post('/jobs/profile', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      await fetchProfile()
      setShowProfileForm(false)
      if (response.data.resumeUploaded) {
        alert('Profile and resume saved successfully!')
      } else {
        alert('Profile saved successfully!')
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to save profile'
      alert(`Error: ${errorMsg}`)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'applied':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      case 'manual_required':
        return 'bg-blue-100 text-blue-800'
      case 'login_required':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'applied':
        return <Check className="h-4 w-4 text-green-600" />
      case 'pending':
        return <Loader2 className="h-4 w-4 text-yellow-600 animate-spin" />
      case 'error':
        return <X className="h-4 w-4 text-red-600" />
      case 'manual_required':
        return <FileText className="h-4 w-4 text-blue-600" />
      case 'login_required':
        return <User className="h-4 w-4 text-purple-600" />
      default:
        return null
    }
  }

  const getStatusMessage = (status: string, message: string) => {
    switch (status) {
      case 'applied':
        return 'Application submitted successfully! Check your email for confirmation.'
      case 'pending':
        return 'Application is being processed...'
      case 'error':
        return message || 'Application failed. Please try again or apply manually.'
      case 'manual_required':
        return 'This job requires manual application. Click "View Job Posting" to apply.'
      case 'login_required':
        return message || 'This job requires login. Please sign in manually, then click "Apply" again and the form will be filled automatically.'
      default:
        return message || 'Status unknown'
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-blue-600" />
          Job Search & Auto-Apply Agent
        </h2>

        {/* Profile Section */}
        {showProfileForm ? (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold mb-2">Set Up Your Profile</h3>
            <p className="text-sm text-gray-600 mb-4">
              You need to configure your profile before applying to jobs.
            </p>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    name="fullName"
                    required
                    defaultValue={profile?.fullName || ''}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    defaultValue={profile?.email || ''}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={profile?.phone || ''}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Skills</label>
                  <input
                    type="text"
                    name="skills"
                    placeholder="Java, Spring, Microservices"
                    defaultValue={profile?.skills || ''}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Experience</label>
                <textarea
                  name="experience"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Describe your work experience..."
                  defaultValue={profile?.experience || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Education</label>
                <textarea
                  name="education"
                  rows={2}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Your education background..."
                  defaultValue={profile?.education || ''}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Resume (PDF) {!profile?.resumePath ? '*' : ''}
                </label>
                <input
                  type="file"
                  name="resume"
                  accept=".pdf,application/pdf"
                  className="w-full px-3 py-2 border rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {profile?.resumePath 
                    ? 'Upload a new resume to replace the existing one (max 10MB).'
                    : 'Upload your resume as PDF (max 10MB). Required for job applications.'}
                </p>
                {profile?.resumePath && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Resume already uploaded - upload new file to replace
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Profile
              </button>
            </form>
          </div>
        ) : profile ? (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{profile.fullName}</h3>
                <p className="text-sm text-gray-600">{profile.email}</p>
                {profile.resumePath ? (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Resume uploaded
                  </p>
                ) : (
                  <p className="text-xs text-yellow-600 mt-1">
                    ⚠️ No resume uploaded - upload one to apply for jobs
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowProfileView(!showProfileView)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {showProfileView ? 'Hide Profile' : 'View Profile'}
                </button>
                <button
                  onClick={() => {
                    setShowProfileForm(true)
                    setShowProfileView(false)
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit Profile
                </button>
              </div>
            </div>
            
            {showProfileView && (
              <div className="mt-4 pt-4 border-t border-green-200 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">Contact Information</h4>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p><span className="font-medium">Name:</span> {profile.fullName}</p>
                    <p><span className="font-medium">Email:</span> {profile.email}</p>
                    {profile.phone && (
                      <p><span className="font-medium">Phone:</span> {profile.phone}</p>
                    )}
                  </div>
                </div>
                
                {profile.skills && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-1">Skills</h4>
                    <p className="text-sm text-gray-600">{profile.skills}</p>
                  </div>
                )}
                
                {profile.experience && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-1">Experience</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{profile.experience}</p>
                  </div>
                )}
                
                {profile.education && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-1">Education</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{profile.education}</p>
                  </div>
                )}
                
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">Resume</h4>
                  {profile.resumePath ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-600">Resume uploaded and ready for applications</span>
                    </div>
                  ) : (
                    <p className="text-sm text-yellow-600">No resume uploaded</p>
                  )}
                </div>
                
                {profile.createdAt && (
                  <div className="text-xs text-gray-500 pt-2 border-t border-green-200">
                    Profile created: {new Date(profile.createdAt).toLocaleDateString()}
                    {profile.updatedAt && profile.updatedAt !== profile.createdAt && (
                      <span> • Last updated: {new Date(profile.updatedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {/* Job Search Form */}
        <form onSubmit={searchJobs} className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Skills/Keywords *</label>
              <input
                type="text"
                required
                value={searchForm.skills}
                onChange={(e) => setSearchForm({ ...searchForm, skills: e.target.value })}
                placeholder="Java, Spring, Microservices"
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Location *</label>
              <input
                type="text"
                required
                value={searchForm.location}
                onChange={(e) => setSearchForm({ ...searchForm, location: e.target.value })}
                placeholder="Washington, DC"
                className="w-full px-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching Jobs...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search Jobs
              </>
            )}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Listings */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Job Listings ({jobs.length})
          </h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {jobs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No jobs found. Start a search!</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{job.title}</h4>
                        {job.source && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                            {job.source}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{job.company}</p>
                      <p className="text-xs text-gray-500">{job.location}</p>
                      {job.salary && (
                        <p className="text-xs text-green-600 font-medium mt-1">{job.salary}</p>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  {job.description && (
                    <p className="text-sm text-gray-700 mb-3 line-clamp-2">{job.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <a
                      href={job.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Job
                    </a>
                    {job.status === 'new' && (
                      <button
                        onClick={() => applyToJob(job.id)}
                        disabled={applying !== null || !profile}
                        className="ml-auto px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {applying === job.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Applying...
                          </>
                        ) : (
                          <>
                            <Send className="h-3 w-3" />
                            Apply
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Applications */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Applications ({applications.length})
          </h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {applications.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No applications yet.</p>
            ) : (
              applications.map((app) => (
                <div key={app.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{app.title}</h4>
                        {app.source && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                            {app.source}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{app.company}</p>
                      <p className="text-xs text-gray-500">{app.location}</p>
                      {app.salary && (
                        <p className="text-xs text-green-600 font-medium mt-1">{app.salary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(app.status)}
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}
                      >
                        {app.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Job Description */}
                  {app.description && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-700 mb-1">Job Description:</p>
                      <p className="text-sm text-gray-600 line-clamp-3">{app.description}</p>
                    </div>
                  )}

                  {/* Application Details */}
                  <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                    {app.appliedAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">Applied:</span>
                        <span className="text-xs text-gray-600">
                          {new Date(app.appliedAt).toLocaleString()}
                        </span>
                      </div>
                    )}

                    {app.applicationMethod && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">Method:</span>
                        <span className="text-xs text-gray-600 capitalize">{app.applicationMethod}</span>
                      </div>
                    )}

                    {/* Status Message */}
                    <div className="flex items-start gap-2 p-2 rounded-md bg-gray-50">
                      <div className="mt-0.5">
                        {getStatusIcon(app.status)}
                      </div>
                      <p className="text-xs text-gray-700 flex-1">
                        {getStatusMessage(app.status, app.message || '')}
                      </p>
                    </div>

                    {/* Login Required */}
                    {app.status === 'login_required' && (
                      <div className="p-2 rounded-md bg-purple-50 border border-purple-200">
                        <p className="text-xs font-medium text-purple-900 mb-1">🔐 Login Required:</p>
                        <ul className="text-xs text-purple-800 space-y-1 list-disc list-inside">
                          <li>Click "View Job Posting" below to open the job page</li>
                          <li>Sign in with your account (email/password)</li>
                          <li>After signing in, the form will be automatically filled</li>
                          <li>Review and submit the application</li>
                        </ul>
                        <p className="text-xs text-purple-700 mt-2 font-medium">
                          💡 Tip: After you sign in, the application agent will automatically fill the form for you!
                        </p>
                      </div>
                    )}

                    {/* Manual Steps Required */}
                    {app.status === 'manual_required' && (
                      <div className="p-2 rounded-md bg-blue-50 border border-blue-200">
                        <p className="text-xs font-medium text-blue-900 mb-1">⚠️ Manual Steps Required:</p>
                        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                          <li>Click "View Job Posting" below to open the job page</li>
                          <li>Complete the application form manually</li>
                          <li>Upload your resume if not already attached</li>
                          <li>Submit the application on the job board website</li>
                        </ul>
                      </div>
                    )}

                    {/* Success Confirmation */}
                    {app.status === 'applied' && (
                      <div className="p-2 rounded-md bg-green-50 border border-green-200">
                        <p className="text-xs text-green-800 mb-2">
                          <strong>✅ Successfully Applied!</strong>
                        </p>
                        {app.confirmationUrl && (
                          <a
                            href={app.confirmationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-700 hover:underline flex items-center gap-1 mb-2"
                          >
                            <Check className="h-3 w-3" />
                            View Application Confirmation
                          </a>
                        )}
                        {app.atsType && (
                          <p className="text-xs text-green-700 mb-2">
                            Applied via: <strong>{app.atsType}</strong>
                          </p>
                        )}
                        {app.finalApplicationUrl && app.finalApplicationUrl !== app.jobUrl && (
                          <p className="text-xs text-green-600 mb-2">
                            Final URL: <a href={app.finalApplicationUrl} target="_blank" rel="noopener noreferrer" className="underline">{app.finalApplicationUrl.substring(0, 50)}...</a>
                          </p>
                        )}
                        <p className="text-xs text-green-700 mt-2">
                          <strong>📧 Email Confirmation:</strong> Most job boards send a confirmation email 
                          within a few minutes. Check your inbox (and spam folder) for confirmation.
                        </p>
                      </div>
                    )}

                    {/* Error Details */}
                    {app.status === 'error' && app.message && (
                      <div className="p-2 rounded-md bg-red-50 border border-red-200">
                        <p className="text-xs font-medium text-red-900 mb-1">Error Details:</p>
                        <p className="text-xs text-red-800">{app.message}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                    <a
                      href={app.jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <FileText className="h-3 w-3" />
                      View Job Posting
                    </a>
                    
                    {/* Re-apply button for failed/error/manual_required applications */}
                    {(app.status === 'error' || app.status === 'manual_required' || app.status === 'login_required' || app.status === 'pending') && (
                      <button
                        onClick={() => reapplyToJob(app.jobListingId)}
                        disabled={applying !== null}
                        className="ml-auto px-3 py-1 bg-orange-600 text-white text-xs rounded-md hover:bg-orange-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {applying === app.jobListingId ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Re-applying...
                          </>
                        ) : (
                          <>
                            <Send className="h-3 w-3" />
                            Re-apply
                          </>
                        )}
                      </button>
                    )}
                    
                    {app.status === 'applied' && (
                      <span className="text-xs text-green-600 flex items-center gap-1 ml-auto">
                        <Check className="h-3 w-3" />
                        Application Submitted
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

