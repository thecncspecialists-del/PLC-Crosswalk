<<<<<<< HEAD
# The Machinists Institute - PLC Crosswalk

Admin-only web application for transcript ingestion, prior-learning-credit mapping, evidence tracking, and admin/student report export.

## Team Access

- Primary access mode is a shared hosted URL where coworkers sign in through the browser.
- Local installation is supported as a fallback only.
- Day-to-day hosted usage guide: `docs/DAILY_USE_REMOTE.md`
- GitHub/Vercel setup guide: `docs/GITHUB_VERCEL_SETUP.md`
- Local fallback install guide: `COWORKER_INSTALL_GUIDE.md`
- One-click local launcher: `Start-PLC-Crosswalk.bat`

## Stack

- Next.js 16 (App Router, Server Components, Server Actions)
- React + TypeScript
- Prisma ORM + PostgreSQL
- Auth.js (credentials + admin role)
- Tailwind CSS

## Key Workflows

1. Upload transcript PDF with student + institution metadata.
2. Parse transcript lines into external courses.
3. Review and map extracted courses into the selected MI program.
4. Approve mapping plans and generate admin/student reports.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
Optional: set `BEEKEEPER_LAUNCH_URL` (URI or Windows absolute path) to enable one-click launch from Settings.

3. Initialize Prisma schema:

```bash
npm run db:migrate
npm run db:seed
```

4. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000/sign-in` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Useful Commands

- `npm run db:generate` - regenerate Prisma client.
- `npm run db:push` - push schema to DB without migration files.
- `npm run user:create-admin -- --email "<email>" --name "<name>" --temp-password "<temp-password>"` - create/update an admin login.
- `npm run user:reset-password -- --email "<email>" --temp-password "<temp-password>"` - rotate an admin password.
- `npm run user:provision-admins -- -PrimaryEmail "<you@example.com>" -CoworkerEmail "<coworker@example.com>"` - provision two individual admin accounts together.
- `npm run test` - run unit tests.
- `npm run test:e2e` - run Playwright smoke tests.
- `npm run lint` - run lint checks.

## Notes

- Storage provider is environment-driven:
  - `STORAGE_PROVIDER=local` for development filesystem storage (`uploads/`)
  - `STORAGE_PROVIDER=s3` for production object storage
- Reports are generated as downloadable text files in this MVP.
- Curriculum catalog import endpoint remains available for internal/admin workflows, but is not exposed in the main transcript queue UI.

## Production (Vercel + Neon + S3)

1. Provision a Neon Postgres database and set `DATABASE_URL` in Vercel.
2. Set auth env vars in Vercel:
   - `AUTH_SECRET`
   - `AUTH_URL` (or `NEXTAUTH_URL`) as your production app URL
3. Set storage env vars in Vercel:
   - `STORAGE_PROVIDER=s3`
   - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - Optional: `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL`
4. Deploy on Vercel (build command: `npm run build`).
5. Run DB migration in production: `npx prisma migrate deploy`.
6. Bootstrap coworker/admin accounts with `npm run user:create-admin`.

See [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) for the full operational checklist.
=======
# PLC-Crosswalk
PLC Crosswalk is built to turn transcript review into a faster, cleaner decision workflow.
>>>>>>> 8ee9e963f0e4ec8849e63baff45719f9e6d746e4
