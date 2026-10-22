# Putting the Work Tracker online

About 15 minutes, on the free plans of Vercel (the website) and Neon (the database), the same way as the Procurement tracker. You type only two settings.

You need: a GitHub account in the **Tejas-Softwares** organisation, a Vercel account signed in with GitHub, and the file `Tejas_Team_Structure.xlsx` (kept outside the code because the repository is public).

## Part 1: The code on GitHub

1. In GitHub, open **Tejas-Softwares**, click **New repository**, name it `Work_Tracker`, choose **Public**, and click **Create repository**. Vercel's free plan only deploys organisation repositories that are public. Nothing private is in the code: no passwords, no staff names.
2. The developer pushes the code from this folder:
   ```bash
   git init && git add . && git commit -m "Tejas Work Tracker 1.0"
   git branch -M main
   git remote add origin https://github.com/Tejas-Softwares/Work_Tracker.git
   git push -u origin main
   ```

## Part 2: The website on Vercel

3. In Vercel, click **Add New**, then **Project**, and **Import** `Work_Tracker`.
4. Open **Environment Variables** and add two:
   - `SETUP_CODE`: any 8 or more characters you choose. You type it once to create the first admin, and again only if an admin forgets their password. Keep it private.
   - `CRON_SECRET`: any long random text. It stops strangers from triggering the daily job.
5. Click **Deploy** and wait about 2 minutes. The site says **"Not ready yet"**. That's expected.

## Part 3: The database

6. In your project, click **Storage**, then **Create Database**. Choose **Neon**, the **Free** plan and the region **Singapore**. Click **Create**, then **Connect** (all environments).
7. Open **Deployments**. On the top one, click the three dots, then **Redeploy**. Wait until it says **Ready**. The tables are created during this deploy.

## Part 4: Start using it

8. Click **Visit**. The first time, it opens the setup page. Enter your `SETUP_CODE`, your name, work email and a password. You are the admin.
9. You land on **Settings, Import team**. Choose `Tejas_Team_Structure.xlsx`, click **Check the workbook**, read what will be added, then **Import**. This loads the 10 departments, all 40 seats with reporting lines, every role card and KRA, the KPIs, the meeting rhythm, and the 90-day rollout and hiring plan with their first tasks.
10. Open **Settings, Team and access** and, on your own account, choose your name under **Linked to**.
11. Send everyone the site's address with `/signup` at the end, for example `https://work-tracker.vercel.app/signup`. Each request appears under **Waiting for approval** with their name already matched. Pick the role and click **Approve**:
    - **Management**: the MD and Directors. They see everything.
    - **HR**: the HR team. They see every scorecard and plan.
    - **Team member**: everyone else. They see their own work and the work of anyone who reports to them.
    - **Admin**: whoever runs Settings (one or two people).
12. On a phone, open the address in Chrome and tap **Add to Home screen** to use it like an app.

When a new head joins (HR Manager, Head of Projects, Financial Controller, Billing Manager, Procurement Manager): in **Settings, People**, edit their "new hire" seat, untick **New hire seat**, put their name and email in, then use **When a new head joins** to move the team from the Director to them in one step.

## Later, when you want them

**Morning emails (Microsoft 365).** Add these in Vercel, then redeploy:
`SMTP_HOST` = `smtp.office365.com`, `SMTP_PORT` = `587`, `SMTP_USER` = the sending mailbox (for example `worktracker@tejaselectricals.com`), `SMTP_PASS` = its password, and optionally `SMTP_FROM`. The mailbox needs **Authenticated SMTP** turned on in the Microsoft 365 admin centre (Users, Active users, the mailbox, Mail, Manage email apps). Then **Settings, Backups and email, Send me a test email**. Each person gets one email a morning with what is overdue, due today and new for them, only when there is something.

**Your own address.** In Vercel, **Settings, Domains**, add `worktracker.tejaselectricals.com` and create the record Vercel shows at your domain registrar. Add `APP_URL` = `https://worktracker.tejaselectricals.com` so email links use it.

**Updating.** Push new code to the same repository. Vercel rebuilds, updates the tables and goes live in about two minutes. Nobody is signed out.

## What to expect on the free plans

- **Vercel Hobby**: its terms describe it as personal, non-commercial use. If Vercel raises it, Pro is US$20 a month for one developer seat; the office's users need no Vercel accounts. (Checked October 2026.)
- **Database**: it sleeps after 5 idle minutes, so the first page after a quiet spell takes a second longer. 1 GB holds many years of tasks.
- **Daily job**: Vercel runs it once a day at about 7:30 am India time (the free plan allows up to an hour either side). The first person to open the app each day also triggers it if it hasn't run, so repeating tasks and escalations never wait.

## Backups

Every night the daily job saves a copy of everything except passwords (30 kept), and one is taken before every import (20 kept). An admin can download any of them under **Settings, Backups and email**. Neon can also restore the whole database to an earlier moment (6 hours back on the free plan).

## If something goes wrong

| Problem | What to do |
| --- | --- |
| The site says "Not ready yet" after step 7 | Check the Neon database is connected to all environments, then redeploy. |
| The setup page says SETUP_CODE is not set | Add it in Vercel (step 4), then redeploy. |
| Someone can't sign in after asking for access | An admin approves them under Settings, Team and access. |
| Five wrong passwords | The account locks for 15 minutes. An admin can make a reset link (Team and access, Reset link) and send it on WhatsApp. |
| An admin forgot their password | On the sign-in page, click "Admin locked out?" and use the SETUP_CODE. |
| Someone sees "Your account isn't linked" | An admin picks their name under Linked to on Team and access. |
| No morning emails | Check the SMTP settings and the test email. In Vercel, Settings, Cron Jobs shows whether the daily job ran. |
| A person has left | Settings, People: tick "Has left the company", and turn their account off under Team and access. Their history stays. |
