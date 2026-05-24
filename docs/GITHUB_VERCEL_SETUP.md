# GitHub + Vercel Setup

This checklist turns the project into a shared hosted app with CI.

## 1) Initialize and push repository

From project root:

```powershell
& "C:\Program Files\Git\cmd\git.exe" init
& "C:\Program Files\Git\cmd\git.exe" add .
& "C:\Program Files\Git\cmd\git.exe" commit -m "Initial PLC Crosswalk baseline"
& "C:\Program Files\Git\cmd\git.exe" branch -M main
& "C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/thecncspecialists-del/PLC-Crosswalk.git
& "C:\Program Files\Git\cmd\git.exe" push -u origin main
```

## 2) Configure GitHub protections

In GitHub repository settings for `main`:

1. Require pull request before merging.
2. Require status checks.
3. Block direct pushes to `main`.
4. Require at least one approval when available.

## 3) Connect Vercel to GitHub repository

1. Create/import project in Vercel from `thecncspecialists-del/PLC-Crosswalk`.
2. Keep framework auto-detected as Next.js.
3. Build command should be `npm run build`.

## 4) Add environment variables in Vercel

Set:

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

## 5) First production release

1. Push `main`.
2. Verify Vercel deployment completes.
3. Run migration deploy against production DB:

```bash
npm run db:migrate:deploy
```

4. Create individual admin accounts:

```bash
npm run user:create-admin -- --email "<email>" --name "<name>" --temp-password "<temp-password>"
```

5. Run smoke checks and verify `/api/health`.
