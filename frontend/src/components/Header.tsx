export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-3">
          <img 
            src="/dcfuturetech.png" 
            alt="DC Future Tech" 
            className="h-10 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">DC Future Tech</h1>
            <p className="text-sm text-gray-600">AI-Powered Talent Search & Outreach Platform</p>
          </div>
        </div>
      </div>
    </header>
  )
}

