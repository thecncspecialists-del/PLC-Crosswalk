# Coworker Install Guide

This guide is for running **The Machinists Institute - PLC Crosswalk** on another Windows PC for local use.
Use this as a fallback when the shared hosted URL is unavailable or when local development is required.

The app is a Next.js web app with a PostgreSQL-compatible Prisma database. For a coworker laptop, the recommended setup uses Prisma's local development database, so they do not need to install a separate PostgreSQL service.

## 1. Stack Needed

Install these before touching the project folder:

1. **Windows 10 or Windows 11**
2. **PowerShell**
   - Built into Windows.
   - Use normal PowerShell, not Git Bash, for the commands in this guide.
3. **Node.js LTS**
   - Use Node.js **24 LTS** if possible.
   - Node.js 22 LTS also works if it is at least Node 22.12.
   - Install from the official Node.js download page: https://nodejs.org/en/download
   - Important: use the normal Windows installer and leave "Add to PATH" enabled.
   - The helper script expects Node at this default path:

```powershell
C:\Program Files\nodejs\npm.cmd
```

4. **Git or a zip copy of the project**
   - Git is only needed if the coworker will clone the repo.
   - If they receive a zip file, Git is not required.

Optional:

1. **Beekeeper Studio**
   - Only needed if they want a GUI database viewer.
   - The app can launch it from Settings if `BEEKEEPER_LAUNCH_URL` is set.

## 2. Confirm Node Is Installed

Open PowerShell and run:

```powershell
node -v
npm -v
```

Expected:

- `node -v` should print something like `v24.x.x` or `v22.x.x`.
- `npm -v` should print a version number.

If either command says it is not recognized, reinstall Node.js and make sure "Add to PATH" is enabled. Then close and reopen PowerShell.

## 3. Put the App on the PC

Place the project folder somewhere simple, for example:

```text
C:\Users\<coworker>\Documents\machinists-plc-crosswalk
```

Then open PowerShell in that folder.

One reliable way:

```powershell
cd "$env:USERPROFILE\Documents\machinists-plc-crosswalk"
```

The folder should contain files like:

```text
package.json
package-lock.json
prisma\schema.prisma
src\
scripts\app-up.ps1
```

## 4. Install App Dependencies

From the project folder, run:

```powershell
npm install
```

This downloads the JavaScript packages listed in `package-lock.json`.

If this fails on a work network, connect to the normal company network or VPN and try again. The install needs access to the npm package registry.

## 5. Create the Local Database

This project uses Prisma. For a coworker PC, use the local Prisma Postgres server.

Run:

```powershell
npx prisma dev --name default
```

When it starts, Prisma will show a small menu. Press:

```text
h
```

Copy the full `DATABASE_URL` value. It will look generally like this:

```text
prisma+postgres://localhost:<port>/?api_key=<long-value>
```

Keep that PowerShell window open for now. The database has to stay running while the app is being initialized.

Important notes:

- Copy the entire `DATABASE_URL`; do not stop halfway through the long `api_key`.
- The old `.env.example` also shows a normal `postgresql://postgres:postgres@localhost:5432/...` URL. That only works if PostgreSQL is separately installed and running. For this coworker setup, use the `prisma+postgres://...` URL from `npx prisma dev`.

## 6. Create the `.env` File

In a second PowerShell window, from the project folder, copy the example file:

```powershell
Copy-Item .env.example .env
```

Open `.env` in Notepad:

```powershell
notepad .env
```

Set these values:

```env
DATABASE_URL="paste-the-full-prisma+postgres-url-here"
AUTH_SECRET="paste-a-long-random-secret-here"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@machinists.institute"
ADMIN_PASSWORD="choose-a-temporary-admin-password"
STORAGE_PROVIDER="local"
S3_ENDPOINT=""
S3_REGION="us-east-1"
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_FORCE_PATH_STYLE="false"
S3_PUBLIC_BASE_URL=""
BEEKEEPER_LAUNCH_URL=""
```

To generate a good `AUTH_SECRET`, run this in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy the generated value into `AUTH_SECRET`.

For a local coworker setup:

- Use `STORAGE_PROVIDER="local"`.
- Leave the S3 values blank.
- Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the first admin login you want created.
- Do not send `.env` through email or commit it to source control.

## 7. Initialize the Database Tables and Seed Data

Make sure the Prisma database from Step 5 is still running.

In the project folder, run:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
```

What these do:

- `db:generate` creates the Prisma client used by the app.
- `db:push` creates the database tables from `prisma\schema.prisma`.
- `db:seed` creates the first admin user and seed program/course records.

Use `db:push` for this local setup. The current project does not include a committed `prisma\migrations` folder, so `db:migrate` is not the best first-run command for a coworker machine.

## 8. Start the App

Recommended local start command:

```powershell
npm run app:up:dev
```

This helper script does four things:

1. Starts the local Prisma database named `default`.
2. Clears anything already using port `3000`.
3. Starts the Next.js development server.
4. Checks that the sign-in page responds.

When it succeeds, open:

```text
http://localhost:3000/sign-in
```

Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## 9. Production-Like Local Start

For a more stable local run that uses a built app instead of the dev server:

```powershell
npm run build
npm run app:up
```

Then open:

```text
http://localhost:3000/sign-in
```

Use this when you want the coworker to run it more like a packaged app.

Use `npm run app:up:dev` when you are actively changing code.

## 10. Manual Start Fallback

If the helper script fails, use two PowerShell windows.

Window 1, start the database:

```powershell
npx prisma dev start default
```

Window 2, start the web server:

```powershell
npm run dev -- --port 3000
```

Open:

```text
http://localhost:3000/sign-in
```

## 11. Stop the App

If the app was started manually in a visible PowerShell window, press:

```text
Ctrl+C
```

If the helper script started the app in the background and you need to stop port `3000`, run:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

To stop the local Prisma database:

```powershell
npx prisma dev stop default
```

Prisma may ask for confirmation before stopping the database.

## 12. Common Problems

### `node` or `npm` is not recognized

Node.js is not installed correctly, or PowerShell was opened before Node was installed.

Fix:

1. Reinstall Node.js LTS from https://nodejs.org/en/download.
2. Keep "Add to PATH" enabled.
3. Close and reopen PowerShell.
4. Run `node -v` and `npm -v` again.

### `npx prisma dev start default` does not start anything useful

The local Prisma database may not exist yet.

Fix:

```powershell
npx prisma dev --name default
```

Then press `h`, copy the `DATABASE_URL`, and update `.env`.

### Database connection errors

Usually this means the local Prisma database is stopped or `.env` has the wrong `DATABASE_URL`.

Fix:

```powershell
npx prisma dev start default
npx prisma dev ls
```

Confirm the running database URL matches the `DATABASE_URL` in `.env`.

### Sign-in says the local database service is offline

If the browser shows this message:

```text
Sign-in is temporarily unavailable because the local database service is offline.
Start Prisma dev and try again.
```

Use this exact recovery sequence from the project folder:

```powershell
npx prisma dev ls
```

If the `default` database is listed but says `not_running`, start it:

```powershell
npx prisma dev start default
```

Then run:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
npm run app:up:dev
```

If `npx prisma dev ls` does not show a `default` database, create it:

```powershell
npx prisma dev --name default
```

Press `h`, copy the full `DATABASE_URL`, paste it into `.env`, and then run:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
npm run app:up:dev
```

If the app is running on a port other than `3000`, make sure `.env` has matching auth URLs. For example, port `3001` needs:

```env
AUTH_URL="http://localhost:3001"
NEXTAUTH_URL="http://localhost:3001"
```

### Sign-in does not work

The database may not have the admin user yet, or the password in `.env` changed after seeding.

Fix:

```powershell
npm run db:seed
```

Or create/reset an admin explicitly:

```powershell
npm run user:create-admin -- --email "coworker@example.com" --name "Coworker Name" --temp-password "TempPassword123!"
```

```powershell
npm run user:reset-password -- --email "coworker@example.com" --temp-password "NewTempPassword123!"
```

### Port `3000` is already in use

The helper script normally clears port `3000` automatically. If starting manually, either stop the old process or run the app on another port:

```powershell
npm run dev -- --port 3001
```

If using port `3001`, update `.env` too:

```env
AUTH_URL="http://localhost:3001"
NEXTAUTH_URL="http://localhost:3001"
```

### Uploaded transcripts or reports are missing

With `STORAGE_PROVIDER="local"`, uploaded files are stored under:

```text
uploads\
```

If moving the app to another PC and you need old uploads, copy the `uploads` folder too. The database records and the files need to stay together.

## 13. Quick Command Checklist

Use this after Node.js is installed and the project folder is on the PC:

```powershell
cd "$env:USERPROFILE\Documents\machinists-plc-crosswalk"
npm install
npx prisma dev --name default
```

Press `h`, copy `DATABASE_URL`, create `.env`, then in a second PowerShell window:

```powershell
npm run db:generate
npm run db:push
npm run db:seed
npm run app:up:dev
```

Open:

```text
http://localhost:3000/sign-in
```
