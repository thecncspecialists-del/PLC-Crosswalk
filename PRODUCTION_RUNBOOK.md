# Production Runbook

This runbook assumes a shared hosted deployment so coworkers can access the app through one URL.

## 1) Prerequisites

1. GitHub repo: `thecncspecialists-del/PLC-Crosswalk`
2. Vercel project linked to that repo
3. Managed Postgres database (Neon or Vercel Postgres)
4. S3-compatible object storage bucket for transcripts/reports

## 2) Required Environment Variables

Set these in the production host (Vercel project settings):

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `STORAGE_PROVIDER=s3`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- Optional: `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL`

Notes:

- `AUTH_URL` and `NEXTAUTH_URL` should be the same production app URL.
- Use unique values per environment (production, preview, local).

## 3) Deploy Order (Canonical Path)

1. Merge to `main` (CI must pass).
2. Vercel builds and deploys the Next.js app.
3. Apply pending database migrations:

```bash
npm run db:migrate:deploy
```

4. Ensure admin accounts exist:

```bash
npm run user:create-admin -- --email "<email>" --name "<name>" --temp-password "<temp-password>"
```

5. Run smoke checks:
   - open `/sign-in`
   - login with a real admin account
   - upload transcript
   - map and approve plan
   - generate and download both report types
   - verify health endpoint: `/api/health`

## 4) Repository and Release Controls

Configure GitHub branch protection on `main`:

1. Require pull request before merging.
2. Require status checks to pass before merging.
3. Do not allow direct pushes to `main`.
4. Require at least one reviewer when possible.

Required checks should include:

- CI / Lint
- CI / Unit tests
- CI / Build

## 5) Admin Account Operations

Create or update an admin:

```bash
npm run user:create-admin -- --email "<email>" --name "<name>" --temp-password "<temp-password>"
```

Reset an admin password:

```bash
npm run user:reset-password -- --email "<email>" --temp-password "<temp-password>"
```

Policy:

1. No shared admin account.
2. One account per person.
3. Temporary passwords must be shared via a secure channel.

## 6) Incident Checklist

### A) Login failures

1. Confirm user email exists and is spelled correctly.
2. Reset password with `user:reset-password`.
3. Confirm `AUTH_SECRET`, `AUTH_URL`, and `NEXTAUTH_URL` are set correctly.

### B) Service unavailable / DB errors

1. Check `/api/health` for `database: "down"`.
2. Validate `DATABASE_URL` in host settings.
3. Verify DB provider status and connectivity.
4. Re-run `npm run db:migrate:deploy` if release included schema changes.

### C) Object storage failures

1. Confirm `STORAGE_PROVIDER=s3`.
2. Verify `S3_*` credentials, endpoint, region, and bucket.
3. Confirm bucket policy allows application read/write.

### D) Rollback

1. Roll back application deployment in Vercel.
2. If needed, restore DB from latest provider backup/snapshot.
3. Re-run smoke checks.

## 7) Backups and Retention

1. Enable automated Postgres backups with tested restore capability.
2. Enable S3 bucket versioning.
3. Configure lifecycle policies for report retention and cost control.
4. Run a restore drill at least quarterly.

## 8) Monthly Security Maintenance

1. Rotate `AUTH_SECRET`.
2. Rotate S3 access keys.
3. Rotate admin temporary credentials policy baseline.
4. Review admin user list for least privilege and inactive accounts.
5. Review CI and dependency updates; patch critical vulnerabilities.
