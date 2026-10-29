# BriefRadar

AI SEO brief generator + AI search tracker.

- **Public link** (`/`): anyone can generate briefs, limited to `PUBLIC_DAILY_LIMIT` (default 5) per visitor per day.
- **Full article** (`/`, second tab): finds the top 20 Google results (SerpApi, 2 searches), reads each page (respecting robots.txt), and has Nemotron 3 Ultra (free, via OpenRouter) write an original article from them with numbered citations. Every sentence is checked against the sources; any that are too close are rewritten automatically by Groq. Limited to `ARTICLE_DAILY_LIMIT` (default 2) per visitor per day.
- **Admin link** (`/admin`): sign in with `APP_PASSWORD` for unlimited briefs, the AI visibility dashboard and settings with share links.
- Built with Next.js, Tailwind CSS, shadcn-style components, Lucide icons and the Geist font.

- **Brief generator**: keyword in, content brief out — search intent, heading outline, questions to answer, related keywords. Built from real Google data (autocomplete, People Also Ask, related searches) via SerpApi's free plan, written up by an LLM.
- **AI search tracker** (`/tracker`): sends your prompts to ChatGPT, Perplexity, Gemini and Claude through their APIs and checks whether your brand (and competitors) are named. Runs on demand, and weekly via Vercel Cron.
- **Google Sheets** (optional): every brief and tracker run is appended to your sheet.

Stack: Next.js (App Router) on Vercel. The API routes are the backend, so there's no separate server.

## Honest limits

- Search volume and keyword difficulty aren't included — no free source provides them. Add Semrush or DataForSEO later if you need them.
- API answers are a close proxy for what people see in the ChatGPT/Perplexity/Gemini apps, not an exact copy (no personalisation, different search behaviour). Treat the tracker as a week-over-week trend.
- "Position" is your brand's order among the tracked names that appear in an answer.

## Setup

1. Deploy to Vercel (import this repo).
2. In **Project → Settings → Environment Variables**, add the variables from [`.env.example`](.env.example). Minimum for briefs: `SERPAPI_KEY` + `GROQ_API_KEY` (free at console.groq.com). Redeploy after adding them.

Briefs are written by Groq (`openai/gpt-oss-120b` by default) when `GROQ_API_KEY` is set. Groq's free tier allows about 1,000 requests and 200,000 tokens a day; one brief uses one request. Groq isn't an AI search product people use, so it isn't one of the tracker's engines.
3. Set `APP_PASSWORD` so strangers can't spend your quota, then enter it once in the site's Connections panel.

### Weekly tracker

Set `CRON_SECRET`, `TRACK_BRAND`, `TRACK_COMPETITORS` and `TRACK_PROMPTS` (prompts separated by `|`). Vercel calls `/api/cron/track` every Monday at 03:00 UTC (08:30 IST). Each run handles up to 10 prompts.

### Google Sheets

1. Create a Google Cloud service account and a JSON key; enable the Google Sheets API.
2. Create a sheet with two tabs: `Briefs` and `Tracker`. Share it with the service account email as **Editor**.
3. Set `GOOGLE_SHEET_ID` (from the sheet URL), `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`.

Column order — **Briefs**: created at, keyword, country, content type, intent, H1, outline, questions, related keywords, word count.
**Tracker**: run at, week, brand, prompt, engine, mentioned, position, competitors named, cited URLs, error.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```
