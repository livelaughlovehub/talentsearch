import { useState } from 'react'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Shield,
  Download,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { Candidate } from '../App'
import { EmailModal } from './EmailModal'

interface CandidateDetailProps {
  candidate: Candidate
  onBack: () => void
  onUpdate: (candidate: Candidate) => void
}

export function CandidateDetail({ candidate, onBack, onUpdate }: CandidateDetailProps) {
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getClearanceBadgeColor = (clearance: string) => {
    switch (clearance) {
      case 'TS/SCI':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'Top Secret':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'Secret':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Results</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{candidate.fullName}</h1>
              <p className="text-xl text-gray-600">{candidate.jobTitle}</p>
            </div>

            {candidate.profileSummary && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Profile Summary</h2>
                <p className="text-gray-700 leading-relaxed">{candidate.profileSummary}</p>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Location</p>
                  <p className="font-medium text-gray-900">{candidate.location}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Experience</p>
                  <p className="font-medium text-gray-900">
                    {candidate.yearsOfExperience
                      ? `${candidate.yearsOfExperience} years`
                      : 'Not specified'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm text-gray-600">Security Clearance</p>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getClearanceBadgeColor(
                      candidate.securityClearance
                    )}`}
                  >
                    {candidate.securityClearance}
                  </span>
                </div>
              </div>

              {candidate.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-600" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Email</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{candidate.email}</p>
                      <button
                        onClick={() => copyToClipboard(candidate.email!, 'email')}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Copy email"
                      >
                        {copied === 'email' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {candidate.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-600" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">Phone</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{candidate.phone}</p>
                      <button
                        onClick={() => copyToClipboard(candidate.phone!, 'phone')}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="Copy phone"
                      >
                        {copied === 'phone' ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600 mb-2">Source</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{candidate.source}</span>
                  {candidate.sourceUrl && (
                    <a
                      href={candidate.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {candidate.resumeDownloadUrl && (
                <a
                  href={candidate.resumeDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download Resume
                </a>
              )}

              <button
                onClick={() => setShowEmailModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                <Mail className="h-4 w-4" />
                Generate & Send Email
              </button>
            </div>

            {candidate.contacted && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  ✓ Contacted on {new Date(candidate.contactedAt!).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEmailModal && (
        <EmailModal
          candidate={candidate}
          onClose={() => setShowEmailModal(false)}
          onSent={() => {
            setShowEmailModal(false)
            onUpdate({ ...candidate, contacted: true, contactedAt: new Date().toISOString() })
          }}
        />
      )}
    </>
  )
}



