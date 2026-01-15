# How to Get Your Anthropic API Key

## What is ANTHROPIC_API_KEY?

The `ANTHROPIC_API_KEY` is used to authenticate with Anthropic's Claude AI API. This API is used to generate personalized cover letters for job applications automatically.

## Steps to Get Your API Key

1. **Visit Anthropic Console**
   - Go to: https://console.anthropic.com/
   - Sign up for a free account (or log in if you already have one)

2. **Navigate to API Keys**
   - Once logged in, go to **Settings** → **API Keys**
   - Or visit: https://console.anthropic.com/settings/keys

3. **Create a New API Key**
   - Click **"+ Create Key"** button
   - Give it a name (e.g., "Job Application Agent")
   - Click **"Create Key"**
   - **IMPORTANT**: Copy the key immediately - you won't be able to see it again!

4. **Add to Your .env File**
   - Open `backend/.env` file
   - Add or update this line:
     ```
     ANTHROPIC_API_KEY=sk-ant-api03-...your-actual-key-here...
     ```
   - Replace `...your-actual-key-here...` with the key you copied

5. **Restart the Backend Server**
   - Stop the server (Ctrl+C)
   - Start it again: `npm run dev`

## Pricing

- Anthropic offers free credits for new accounts
- Check their pricing page for current rates: https://www.anthropic.com/pricing
- Cover letters are relatively inexpensive (usually a few cents per application)

## Note

If you don't want to use the API key, the app will still work but will use a default cover letter template instead of AI-generated personalized ones.


