# Quick Start Guide

Get the Talent Search application running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm run install:all
```

This installs dependencies for both frontend and backend.

## Step 2: Configure API Key

1. Get your Anthropic API key from https://console.anthropic.com/
2. Create `.env` file in the `backend` directory:
   ```bash
   cd backend
   cp env.example .env
   ```
3. Edit `.env` and add your API keys:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   SERPAPI_KEY=your_serpapi_key_here  # Optional - for real search results
   ```
   
   **Note**: 
   - `ANTHROPIC_API_KEY` is required for email generation
   - `SERPAPI_KEY` is optional - without it, the app uses mock data for searches

## Step 3: Start the Application

From the project root:

```bash
npm run dev
```

This starts both:
- Frontend on http://localhost:3000
- Backend on http://localhost:3001

## Step 4: Use the Application

1. Open http://localhost:3000 in your browser
2. Fill out the search form:
   - Skills: e.g., "Java, Spring, Microservices"
   - Security Clearance: Select from dropdown
   - Location: e.g., "Washington, DC"
   - Date Range: Default is 14 days
3. Click "Search for Candidates"
4. Wait for results (mock data will be generated)
5. Click on a candidate to view details
6. Click "Generate & Send Email" to create an AI-powered email

## Troubleshooting

### Installation Errors

If you see C++ compilation errors:
- Make sure you have Xcode Command Line Tools: `xcode-select --install`
- The latest `better-sqlite3` (v12.5.0+) is already configured for Node.js 24+
- If issues persist, try: `cd backend && npm install better-sqlite3@latest`

### Port Already in Use
If port 3000 or 3001 is already in use:
- Frontend: Edit `frontend/vite.config.ts` and change the port
- Backend: Edit `backend/.env` and change `PORT=3001` to another port

### API Key Error
If email generation fails:
- Verify your Anthropic API key is correct in `backend/.env`
- Check that the key has proper permissions
- The app will use a fallback template if the API fails

### Database Issues
The database is automatically created in `backend/data/talentsearch.db`. If you need to reset:
- Stop the server
- Delete `backend/data/talentsearch.db`
- Restart the server

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Customize the search service to integrate real APIs
- Configure SMTP for actual email sending
- Add authentication for production use

