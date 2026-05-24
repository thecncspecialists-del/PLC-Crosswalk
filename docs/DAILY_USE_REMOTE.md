# Daily Use - Remote Team

This page is for day-to-day users of the hosted PLC Crosswalk app.

## 1) Open the app

1. Open the production URL in your browser.
2. Go to `/sign-in` if not redirected automatically.

## 2) Sign in

1. Enter your assigned admin email and password.
2. If login fails, contact the system admin for a password reset.

## 3) Upload and process transcripts

1. Open the transcripts area.
2. Upload transcript PDF and student metadata.
3. Review extracted courses.
4. Complete mapping decisions and approve plan.
5. Generate admin and student reports.
6. Download the reports.

## 4) If something fails

1. Wrong password: request password reset from system admin.
2. "Service unavailable": report the exact time and screenshot to system admin.
3. Upload/report issues: include student name and transcript ID in your report.

## 5) Password reset process (admin action)

System admin command:

```bash
npm run user:reset-password -- --email "<user-email>" --temp-password "<temp-password>"
```

After receiving a temporary password, sign in and rotate to a private password immediately.
