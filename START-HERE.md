# Upload this complete project

Extract this ZIP and upload ALL its contents to the root of your new GitHub repository. package.json, vercel.json, api/ and public/ must appear directly at the repository root. Do not upload the ZIP itself.

This includes the complete original application plus the origin and reviewer-linking corrections. No previous ZIP is required.

Connect the new repository to your EXISTING Vercel project wedddddding1 if you want to keep https://wedddddding1.vercel.app/. Keep the existing Supabase project, environment variables and records. Do not seed or reset the database. Set GITHUB_REPO_URL to the new repository URL. Set Production APP_URL to https://wedddddding1.vercel.app and redeploy.

Production origin is pinned to https://wedddddding1.vercel.app in lib/site-config.mjs. If you deliberately use a different production address, update that canonicalOrigin and APP_URL together. The origin security check remains enforced.

Vercel build settings: Framework Other; Build Command npm run build; Output Directory public; Node.js 22.

Read docs/CORRECTION-INSTRUCTIONS.md for safe reviewer linking and the real bot/Sheet/repository settings still required. Existing server credentials belong in Vercel, never GitHub. Real Telegram delivery and Viewer access to the Sheet must be configured and verified separately; links alone do not activate these integrations.

Run npm test and npm run build locally if desired. The correction was checked with 24 passing automated tests. The archive excludes secrets, dependencies and the local sample database.
