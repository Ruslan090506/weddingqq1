# Friends Included Ltd — Wedding Guests for Hire

A Day 4 homework application for recording paid sales and expenses, approving commission splits, allocating costs and comparing the two wedding-guest projects. Includes a responsive website, Telegram bot webhook, private Supabase storage and an automatic Google Sheets copy.

**Delivery status:** complete source repository with automated tests and local preview. Live Supabase, Telegram, Google Sheets and Vercel connections require your own accounts and environment settings. No live deployment, real Telegram delivery or real Sheets update is claimed by the included local tests.

## Run locally

Install Node.js 22 or newer. No third-party packages are required.

1. Copy `.env.example` to `.env`.
2. Set `DATA_MODE=local`, `MOCK_INTEGRATIONS=true`, `APP_URL=http://localhost:3000`, and a random `SESSION_SECRET` of at least 32 characters.
3. Run `npm start`, then visit **http://localhost:3000**.
4. Select an employee and click **Open workspace**. Select Svetlana for the dashboard, approvals and Telegram linking.

Optional: before starting the server, run `npm run demo:seed` to preview the final assignment numbers. It refuses to overwrite an existing local ledger. These records are visibly labeled `local_fixture`; they do not replace the required live bot test. For live assessment use the empty Supabase database created by the SQL migration.

```sh
npm test
npm run build
```

## Deploy and submit

Follow [SETUP](docs/SETUP.md) to connect Supabase, Sheets and Telegram and deploy on Vercel. Follow [TESTING](docs/TESTING.md) to enter the assignment data and verify the expected results. [ARCHITECTURE](docs/ARCHITECTURE.md) explains permissions, accounting, idempotency and retries. [VERIFICATION](docs/VERIFICATION.md) distinguishes completed checks from account-dependent checks.

Extract this ZIP, then upload the **contents** of the extracted repository folder to a new GitHub repository. Include hidden files such as `.github`, `.gitignore` and `.env.example`. Never upload `.env`, service-account keys or `.local`. Import the GitHub repository into Vercel. No compiled bundle or dependency installation is needed.

Set `STUDENT_NAME`, `GITHUB_REPO_URL`, `TELEGRAM_BOT_USERNAME` and `GOOGLE_SHEET_ID`; the website displays the name and project links. Your final course submission can then use the Vercel website URL, with the bot, spreadsheet and repository accessible from its header.

## Features

- Five selectable demonstration roles, with server-side permission checks.
- Telegram users identified by numeric sender ID; only the manager can link a user after `/start`.
- Sales count only after manager approval; expenses affect the company immediately.
- Original proposals and final decisions stored separately.
- Exact cents, a 10% commission pool and deterministic rounding residuals.
- Project and company results, commission earnings and pending items.
- Unique references, atomic saves, repeat-safe approvals and deduplicated bot updates.
- Automatic Sheets updates to stable rows in Sales and Expenses, with two-decimal money formatting.
- Persisted notification jobs and visible delivery/synchronization failures with manager retry.

This is intentionally a classroom demonstration: anyone with website access (and the optional shared access code) can choose a role. It is not an authenticated production finance system.
