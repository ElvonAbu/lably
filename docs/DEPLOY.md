# A permanent public address for the backend

A tunnel on your laptop is temporary. A deployed backend gives you ONE address that never changes
(e.g. `https://api.mylably.com`), works when your laptop is off, and is what offer emails, the scientist app
and the patient app will use later. Offer emails, the 48 s search and the 20 s grace all need the backend
to be running at that moment, so use an **always-on** instance (not a free one that sleeps).

## Which host
- **Railway (Hobby, about $5/month) or Render (Starter, about $7/month):** always on, custom domain with free HTTPS, deploys from GitHub. Check each provider's pricing page before you pay.
- Avoid free web services that sleep after inactivity (Render's free tier sleeps after 15 minutes and takes 30-60 s to wake): a sleeping server would miss offers and the in-memory search timers.
- Run ONE instance only (search timers live in the server's memory).

## Set up (about 15 minutes)
1. Put the project on GitHub. Create a service from the repo with **root directory `lablybackend`**.
2. Build command `npm install`, start command `npm start`.
3. Environment variables: copy the names from your local `lablybackend/.env` (database, Supabase, JWT, Resend, Google routing, MATCH_*), plus:
   - `publicBaseUrl` = the public address, e.g. `https://api.mylably.com` (no trailing slash)
   - `corsOrigins` = your frontend address(es), comma separated
   - `MATCH_DEV_KEY` = a long random secret (see below)
4. MongoDB Atlas: allow the host's access (Network Access). Easiest for now: `0.0.0.0/0`.
5. Custom domain: in the host, add `api.mylably.com`; it shows a CNAME target. Add that CNAME record in your DNS panel (the same place as your other mylably.com records). Leave your existing records (mail, Resend) alone.
6. Frontend: set `VITE_apiUrl=https://api.mylably.com` when you build / run it against the deployed backend.
7. In `.env` (local) you can keep using `https://localhost:3000`; offer emails use `publicBaseUrl`, so on the deployed backend they point to the public address.

## Test tools on a public server
`/match-dev` (seed scientists, create test jobs, accept as anyone) is for testing only.
- `NODE_ENV=production` turns it OFF completely (use this once you go live).
- While you still test on the deployed server, keep `NODE_ENV` unset and set `MATCH_DEV_KEY`. Open
  `https://api.mylably.com/match-dev/console?key=<your key>` once; the browser remembers it.
  Seed with your own inbox: `https://api.mylably.com/match-dev/seed?lat=..&lng=..&email=you@gmail.com&key=<your key>`.
- The server prints a warning at startup if `/match-dev` is open on a public server.

## Quick option for today only (laptop)
ngrok's free plan gives you one fixed domain (assigned by ngrok, you cannot choose the name), but visitors first see an
ngrok warning page with a button (once per 7 days per browser). Fine for you testing, not for real scientists.
A Cloudflare named tunnel needs your domain on Cloudflare's DNS, which would move your mail records: not recommended now.
