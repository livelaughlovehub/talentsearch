import { useState, useEffect } from 'react'
import { X, Mail, Copy, Check, Send, Loader2 } from 'lucide-react'
import { Candidate } from '../App'
import { api } from '../lib/api'

interface EmailModalProps {
  candidate: Candidate
  onClose: () => void
  onSent: () => void
}

export function EmailModal({ candidate, onClose, onSent }: EmailModalProps) {
  const [email, setEmail] = useState({ subject: '', body: '' })
  const [isGenerating, setIsGenerating] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [roleRequirements, setRoleRequirements] = useState('')
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    generateEmail()
  }, [])

  const generateEmail = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const response = await api.post('/email/generate', {
        candidateId: candidate.id,
        roleRequirements: roleRequirements || undefined,
        companyName: companyName || undefined,
      })
      setEmail(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate email')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyFullEmail = () => {
    const fullEmail = `To: ${candidate.email}\nSubject: ${email.subject}\n\n${email.body}`
    copyToClipboard(fullEmail, 'full')
  }

  const handleSend = async () => {
    if (!candidate.email) {
      setError('No email address available for this candidate')
      return
    }

    setIsSending(true)
    setError(null)

    try {
      // Mark candidate as contacted
      await api.patch(`/candidates/${candidate.id}`, { contacted: true })
      
      // In a real app, you would send the email here via your email service
      // For now, we'll just mark as contacted
      alert(`Email would be sent to ${candidate.email}\n\nIn production, this would use your configured email service.`)
      
      onSent()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send email')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Generate Email</h2>
            <p className="text-sm text-gray-600 mt-1">For {candidate.fullName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Optional fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name (Optional)
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your company name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role Requirements (Optional)
              </label>
              <input
                type="text"
                value={roleRequirements}
                onChange={(e) => setRoleRequirements(e.target.value)}
                placeholder="Brief role description"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {isGenerating ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Generating personalized email...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={email.subject}
                  onChange={(e) => setEmail({ ...email, subject: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Body
                </label>
                <textarea
                  value={email.body}
                  onChange={(e) => setEmail({ ...email, body: e.target.value })}
                  rows={12}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>To: {candidate.email || 'No email available'}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <button
              onClick={generateEmail}
              disabled={isGenerating}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Regenerate
            </button>
            {!isGenerating && email.body && (
              <>
                <button
                  onClick={() => copyToClipboard(candidate.email || '', 'email')}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  {copied === 'email' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Email
                    </>
                  )}
                </button>
                <button
                  onClick={copyFullEmail}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  {copied === 'full' ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Full Email
                    </>
                  )}
                </button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            {!isGenerating && email.body && (
              <button
                onClick={handleSend}
                disabled={isSending || !candidate.email}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Mark as Sent
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

