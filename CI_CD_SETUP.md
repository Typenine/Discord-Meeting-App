# CI/CD Setup Guide

This document provides detailed instructions for setting up automated deployment of the Cloudflare Worker using GitHub Actions.

## Overview

The GitHub Actions workflow automatically deploys the Cloudflare Worker (backend) whenever changes are pushed to the `main` or `deploy` branches. This eliminates local Node version conflicts and ensures consistent deployments.

## Workflow Features

### ✅ Automated Deployment
- Triggers on push to `main` or `deploy` branches
- Only runs when worker code changes (efficient)
- Manual trigger available via workflow_dispatch

### ✅ Node 20 Guaranteed
- Uses Node.js 20 in CI environment
- No local Node version conflicts
- Consistent build environment

### ✅ Dependency Management
- Runs `npm ci` for reproducible builds
- Caches dependencies for faster runs
- Validates package-lock.json

### ✅ Pre-Deployment Validation
- Verifies Durable Object configuration
- Checks for MEETING_ROOM binding
- Fails early if misconfigured

### ✅ Clear Output
- Prints deployed worker URL
- Shows Vercel configuration instructions
- Confirms Durable Object deployment

## Setup Instructions

### Step 1: Get Cloudflare Credentials

#### CLOUDFLARE_API_TOKEN

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Configure permissions:
   - Account: Your account → Cloudflare Workers → Edit
   - Zone: All zones → Workers Scripts → Edit
5. Continue to summary → Create Token
6. **Copy the token** (you won't see it again)

#### CLOUDFLARE_ACCOUNT_ID

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click on your account name
3. On the right sidebar, find **Account ID**
4. Copy the ID (format: `abc123def456...`)

### Step 2: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

**Secret 1: CLOUDFLARE_API_TOKEN**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: The API token from Step 1
- Click "Add secret"

**Secret 2: CLOUDFLARE_ACCOUNT_ID**
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: The account ID from Step 1
- Click "Add secret"

### Step 3: Trigger Deployment

#### Option A: Push to Main Branch
```bash
git push origin main
```

The workflow will automatically run when:
- Any file in `worker/` directory changes
- The workflow file itself changes

#### Option B: Manual Trigger
1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Select "Deploy Cloudflare Worker" workflow
4. Click **Run workflow**
5. Choose branch: `main` or `deploy`
6. Click **Run workflow**

### Step 4: Monitor Deployment

1. Go to **Actions** tab in your repository
2. Click on the latest workflow run
3. Click "Deploy Worker to Cloudflare" job
4. Expand steps to see progress
5. Check the "Get deployment info" step for:
   - Deployed worker URL
   - Vercel configuration instructions
   - Durable Object confirmation

### Step 5: Configure Vercel

After successful deployment, configure your Vercel frontend:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add a new variable:

**Option 1 (Recommended): VITE_WORKER_DOMAIN**
- Name: `VITE_WORKER_DOMAIN`
- Value: `discord-agenda-activity-worker.YOUR_ACCOUNT_ID.workers.dev`
  - Replace `YOUR_ACCOUNT_ID` with your actual account ID
  - Get this from the workflow logs
- Environments: Check all (Production, Preview, Development)
- Click "Save"

**Option 2 (Alternative): VITE_API_BASE**
- Name: `VITE_API_BASE`
- Value: `https://discord-agenda-activity-worker.YOUR_ACCOUNT_ID.workers.dev/api`
- Environments: Check all (Production, Preview, Development)
- Click "Save"

5. Redeploy your Vercel project:
   - Go to **Deployments** tab
   - Click **...** on latest deployment
   - Select **Redeploy**

## Workflow Configuration

### File Location
```
.github/workflows/deploy-worker.yml
```

### Trigger Configuration

```yaml
on:
  push:
    branches:
      - main
      - deploy
    paths:
      - 'worker/**'
      - '.github/workflows/deploy-worker.yml'
  workflow_dispatch:
```

**Explanation:**
- `push.branches`: Runs on push to main or deploy branch
- `push.paths`: Only runs when worker code or workflow changes
- `workflow_dispatch`: Enables manual triggering

### Node Version

```yaml
- name: Setup Node.js 20
  uses: actions/setup-node@v4
  with:
    node-version: '20'
```

**Why Node 20?**
- Latest LTS version
- Better performance
- Cloudflare Workers compatibility
- Avoids local version conflicts

### Secrets Usage

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

**Security:**
- Secrets are encrypted in GitHub
- Never logged or exposed
- Only available during workflow execution
- Scoped to repository

## Durable Object Validation

The workflow includes a pre-deployment step that verifies:

```bash
✓ Durable Objects configuration found:
[durable_objects]
bindings = [
  { name = "MEETING_ROOM", class_name = "MeetingRoom" }
]

✓ MEETING_ROOM Durable Object binding found
```

**Why validate?**
- Durable Objects are critical for the app
- Early failure prevents incomplete deployments
- Clear error messages for troubleshooting

## Deployment Output

After successful deployment, the workflow prints:

```
=====================================
Deployment Complete!
=====================================
Worker name: discord-agenda-activity-worker

🚀 Deployed URL: https://discord-agenda-activity-worker.abc123.workers.dev

📋 Next steps:
  1. Set VITE_WORKER_DOMAIN in Vercel to: discord-agenda-activity-worker.abc123.workers.dev
     OR
  2. Set VITE_API_BASE in Vercel to: https://discord-agenda-activity-worker.abc123.workers.dev/api

✓ Durable Object 'MEETING_ROOM' is bound and deployed
=====================================
```

## Troubleshooting

### Error: "CLOUDFLARE_API_TOKEN not found"

**Cause:** Secret not configured in GitHub

**Solution:**
1. Go to repository Settings → Secrets → Actions
2. Verify CLOUDFLARE_API_TOKEN exists
3. Check spelling (case-sensitive)
4. Re-add if necessary

### Error: "MEETING_ROOM binding not found"

**Cause:** wrangler.toml missing Durable Object configuration

**Solution:**
1. Check `worker/wrangler.toml`
2. Ensure it contains:
   ```toml
   [durable_objects]
   bindings = [
     { name = "MEETING_ROOM", class_name = "MeetingRoom" }
   ]
   ```
3. Commit and push changes

### Error: "wrangler deploy failed"

**Cause:** Various (check logs for details)

**Solutions:**
- Verify API token has correct permissions
- Check Cloudflare account is active
- Ensure wrangler.toml is valid
- Review full error message in logs

### Workflow doesn't trigger

**Cause:** Changes not in `worker/` directory

**Solution:**
- Workflow only runs for worker changes
- Verify changed files are in `worker/` directory
- Or manually trigger via workflow_dispatch

### Deployment succeeds but frontend can't connect

**Cause:** Vercel environment variables not set

**Solution:**
1. Check Vercel Settings → Environment Variables
2. Ensure VITE_WORKER_DOMAIN or VITE_API_BASE is set
3. Redeploy Vercel project
4. Check browser console for errors

## Best Practices

### Development Workflow

1. **Local Testing First**
   ```bash
   cd worker
   npm run dev
   # Test at http://localhost:8787
   ```

2. **Push to Feature Branch**
   ```bash
   git checkout -b feature/my-change
   git push origin feature/my-change
   ```

3. **Create Pull Request**
   - Review changes
   - Get approval
   - Merge to main

4. **Automatic Deployment**
   - Merge triggers workflow
   - Worker deploys automatically
   - Check Actions tab for status

### Security Best Practices

✅ **Do:**
- Keep API tokens secret
- Rotate tokens periodically
- Use minimal required permissions
- Review deployment logs for sensitive data

❌ **Don't:**
- Commit API tokens to code
- Share tokens in issues/PRs
- Use overly permissive tokens
- Log secrets in console

### Monitoring

**Check deployment health:**
1. Visit deployed URL: `https://YOUR_WORKER.workers.dev/api/room/create`
2. Should return: `{"roomId":"ABC123","hostKey":"..."}`
3. Check Cloudflare dashboard for analytics
4. Monitor error rates and performance

## Advanced Configuration

### Custom Domain

To use a custom domain instead of workers.dev:

1. Add route in `wrangler.toml`:
   ```toml
   routes = [
     { pattern = "api.yourdomain.com/*", zone_name = "yourdomain.com" }
   ]
   ```

2. Update Vercel environment variable:
   ```
   VITE_WORKER_DOMAIN=api.yourdomain.com
   ```

### Environment-Specific Deployments

Create separate environments:

1. **Staging:**
   ```yaml
   # .github/workflows/deploy-worker-staging.yml
   branches:
     - staging
   ```

2. **Production:**
   ```yaml
   # .github/workflows/deploy-worker.yml
   branches:
     - main
   ```

3. Use different secrets for each environment

### Deployment Notifications

Add Slack/Discord notification:

```yaml
- name: Notify deployment
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -H 'Content-Type: application/json' \
      -d '{"text":"Worker deployed successfully!"}'
```

## Support

For issues with CI/CD setup:
1. Check GitHub Actions logs
2. Review this documentation
3. Check Cloudflare Workers docs
4. Open an issue in the repository

---

**Related Documentation:**
- [README.md](README.md) - Main project documentation
- [PRODUCTION_CONFIG.md](PRODUCTION_CONFIG.md) - Production deployment guide
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
