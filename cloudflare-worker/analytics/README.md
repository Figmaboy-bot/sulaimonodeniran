# Analytics worker

Stores page views in Cloudflare D1 and serves the admin's Analytics tab.
See the header of `worker.js` for the two endpoints.

## One-time setup

From this folder:

```sh
npx wrangler login
npx wrangler d1 create portfolio-analytics      # paste the database_id into wrangler.toml
npx wrangler d1 execute portfolio-analytics --remote --file=schema.sql
openssl rand -hex 32 | npx wrangler secret put INGEST_SECRET
openssl rand -hex 32                              # keep this one: it's the admin's token
npx wrangler secret put STATS_TOKEN               # paste the value from the line above
npx wrangler deploy
```

Then, on the Vercel project (Production and Preview):

- `ANALYTICS_INGEST_URL` = `https://portfolio-analytics.<subdomain>.workers.dev/ingest`
- `ANALYTICS_INGEST_SECRET` = the same value as `INGEST_SECRET`

Add the same two lines to `.env.local` to run `scripts/import-analytics.py`.
Open the admin's Analytics tab and paste the `STATS_TOKEN` when it asks; it's
remembered in that browser, and that browser's own visits stop being counted.
