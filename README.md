# Talent Search & Outreach Application

A comprehensive AI-powered talent search and outreach platform that helps recruiters find and contact qualified candidates across multiple job boards.

## Features

- **Advanced Search Interface**: Search by skills, security clearance, location, and date range
- **Multi-Platform Search**: Automatically searches across Indeed, LinkedIn, Dice, Monster, ZipRecruiter, and GitHub
- **AI-Powered Email Generation**: Uses Claude AI to generate personalized outreach emails
- **Candidate Management**: View detailed candidate profiles, track contact status, and manage outreach
- **Resume Download**: Direct links to candidate resumes
- **Contact Tracking**: Mark candidates as contacted with timestamps

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons
- Axios for API calls

### Backend
- Node.js with Express
- TypeScript
- SQLite database (easily upgradeable to PostgreSQL)
- Anthropic Claude API for email generation
- Better-SQLite3 for database operations

## Prerequisites

- Node.js 18+ and npm (Node.js 20+ recommended for best compatibility)
- Anthropic API key (for email generation)
- Python 3.x (required for building native dependencies like better-sqlite3)

## Installation

1. **Clone the repository** (if applicable) or navigate to the project directory

2. **Install dependencies**:
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**:
   
   Create a `.env` file in the `backend` directory:
   ```bash
   cd backend
   cp env.example .env
   ```
   
   Edit `.env` and add your API keys:
   ```
   PORT=3001
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

4. **Initialize the database**:
   The database will be automatically created on first run in `backend/data/talentsearch.db`

## Running the Application

### Development Mode

Run both frontend and backend concurrently:
```bash
npm run dev
```

Or run them separately:

**Backend** (from project root):
```bash
npm run dev:backend
```

**Frontend** (from project root):
```bash
npm run dev:frontend
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Production Build

1. **Build the frontend**:
   ```bash
   npm run build
   ```

2. **Start the backend**:
   ```bash
   npm start
   ```

## Usage

1. **Start a Search**:
   - Enter skills/keywords (comma-separated)
   - Select security clearance level
   - Enter location
   - Set date range (default: 14 days)
   - Click "Search for Candidates"

2. **View Results**:
   - Browse candidate cards in grid layout
   - Click on a candidate to view full details

3. **Generate Email**:
   - Open a candidate's detail page
   - Click "Generate & Send Email"
   - Optionally add company name and role requirements
   - Review and edit the AI-generated email
   - Copy email address or full email, or mark as sent

4. **Track Outreach**:
   - Candidates marked as "Contacted" show a status indicator
   - View contact history in candidate details

## API Endpoints

### Search
- `POST /api/search` - Create a new search
- `GET /api/search/:id` - Get search status
- `GET /api/search` - Get all searches

### Candidates
- `GET /api/candidates/search/:searchId` - Get candidates for a search
- `GET /api/candidates/:id` - Get a single candidate
- `PATCH /api/candidates/:id` - Update candidate (e.g., mark as contacted)
- `GET /api/candidates` - Get all candidates (with optional filters)

### Email
- `POST /api/email/generate` - Generate AI email for a candidate
- `GET /api/email/templates/:candidateId` - Get email templates for a candidate

## Database Schema

### Searches Table
- Stores search queries and their status
- Tracks results count and timestamps

### Candidates Table
- Stores candidate information
- Links to searches via `searchId`
- Tracks contact status and timestamps

### Email Templates Table
- Stores generated email templates
- Links to candidates

## Configuration

### Environment Variables

**Backend** (`backend/.env`):
- `PORT`: Server port (default: 3001)
- `ANTHROPIC_API_KEY`: Your Anthropic Claude API key (required for email generation)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: Optional email sending configuration
- `SERPAPI_KEY`: Optional SerpAPI key for real web search integration

## Development Notes

### Real Search Integration (SerpAPI)

The application now supports **real search results** via SerpAPI! 

**To enable real searches:**

1. **Get a SerpAPI key**: 
   - Sign up at https://serpapi.com/
   - Get your API key from the dashboard
   - Add it to `backend/.env`: `SERPAPI_KEY=your_key_here`

2. **How it works**:
   - The app automatically uses SerpAPI when `SERPAPI_KEY` is configured
   - Falls back to mock data if SerpAPI is unavailable or returns no results
   - Searches across LinkedIn, Indeed, Dice, Monster, ZipRecruiter, and GitHub

3. **Rate Limits**: 
   - SerpAPI has usage limits based on your plan
   - The app includes error handling and fallback to mock data
   - Monitor your usage at https://serpapi.com/dashboard

**Note**: Without a SerpAPI key, the app uses realistic mock data for demonstration purposes.

### Email Sending
Currently, the app marks emails as "sent" but doesn't actually send them. To enable real email sending:

1. Configure SMTP settings in `.env`
2. Implement email sending in `backend/src/services/emailService.ts` using nodemailer
3. Update the email route to handle actual sending

### Database Migration
To upgrade from SQLite to PostgreSQL:

1. Install `pg` package
2. Update `backend/src/database/index.ts` to use PostgreSQL connection
3. Update SQL syntax if needed (SQLite and PostgreSQL are mostly compatible)

## Security Considerations

- Store API keys securely in environment variables
- Implement rate limiting for API endpoints
- Add authentication/authorization for production use
- Ensure GDPR compliance when handling candidate data
- Respect robots.txt and terms of service for scraped sites
- Implement proper error handling and logging

## Future Enhancements

- [ ] Real web search integration (SerpAPI or direct scraping)
- [ ] Actual email sending via SMTP
- [ ] User authentication and multi-user support
- [ ] Advanced filtering and sorting options
- [ ] Export results to CSV
- [ ] Search history and saved searches
- [ ] Candidate notes and tagging
- [ ] Analytics dashboard
- [ ] Chrome extension for quick searches
- [ ] Bulk email sending
- [ ] A/B testing for email templates

## License

MIT

## Support

For issues or questions, please open an issue in the repository.

