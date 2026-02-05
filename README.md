# Discord Meeting App (Synced Meeting App)

A real-time collaborative meeting application that works both as a standalone web app and as a Discord Activity. Features include shared agenda management, synchronized timers, and live voting.

## Features

- 🎯 **Dual Mode Support**
  - Standalone web app (anonymous, room-based)
  - Discord Activity integration (Discord OAuth)

- 📋 **Agenda Management**
  - Per-item durations
  - Edit agenda items inline
  - Next/Previous navigation
  - Active item tracking with automatic timer reset

- ⏱️ **Synchronized Timer**
  - Server-authoritative timestamps
  - Client-side rendering (1-second updates)
  - TIME_PING/PONG clock synchronization
  - START/PAUSE/RESUME/RESET controls

- 🗳️ **Live Voting**
  - Structured options with stable IDs
  - One vote per client/user
  - Real-time tally display
  - Visual feedback on voted options

- 🔐 **Security**
  - Host/viewer role separation
  - HostKey-based authentication (standalone)
  - Discord allowlist support (Discord mode)
  - Server-side validation

## Architecture

- **Frontend**: Vite + React (deployed on Vercel)
- **Backend**: Cloudflare Worker + Durable Objects (WebSocket & HTTP)
- **Standalone Mode**: WebSocket for real-time sync
- **Discord Activity Mode**: HTTP polling (Discord SDK)

## Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Typenine/Discord-Meeting-App.git
   cd Discord-Meeting-App
   ```

2. **Start the Cloudflare Worker (backend)**
   ```bash
   cd worker
   npm install
   npm run dev
   ```
   Worker runs at `http://localhost:8787`

3. **Start the frontend**
   ```bash
   cd client
   npm install
   npm run dev
   ```
   Frontend runs at `http://localhost:5173`

4. **Access the app**
   - Open http://localhost:5173 in your browser
   - No configuration needed for local development

## Deployment

### 1. Deploy Cloudflare Worker (Backend)

#### Option A: Manual Deployment

```bash
cd worker
npm install
npx wrangler deploy
```

#### Option B: Automated CI/CD (Recommended)

The repository includes a GitHub Actions workflow that automatically deploys the worker on push to `main` branch.

**Setup GitHub Secrets:**

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add the following repository secrets:

   - **CLOUDFLARE_API_TOKEN**
     - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
     - Create a new API token with "Edit Cloudflare Workers" permissions
     - Copy the token and add it as a secret

   - **CLOUDFLARE_ACCOUNT_ID**
     - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
     - Select your account
     - Copy the Account ID from the right sidebar
     - Add it as a secret

3. Push to `main` branch or trigger the workflow manually:
   ```bash
   git push origin main
   ```

4. Check the Actions tab to see deployment progress and get the deployed URL

**The workflow will:**
- ✅ Use Node.js 20
- ✅ Install dependencies
- ✅ Verify Durable Object bindings (MEETING_ROOM)
- ✅ Deploy to Cloudflare Workers
- ✅ Print the deployed URL in logs
- ✅ Provide Vercel configuration instructions

**After deployment, note your worker URL:**
```
https://discord-agenda-activity-worker.YOUR_ACCOUNT_ID.workers.dev
```

### 2. Deploy Frontend to Vercel

#### Step 1: Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure build settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

#### Step 2: Set Environment Variables in Vercel

After deploying your Cloudflare Worker, configure the frontend to connect to it:

**Option 1: Using VITE_WORKER_DOMAIN (Recommended)**

1. In Vercel project settings → Environment Variables
2. Add a new variable:
   - **Name**: `VITE_WORKER_DOMAIN`
   - **Value**: `discord-agenda-activity-worker.YOUR_ACCOUNT_ID.workers.dev`
   - **Environments**: Production, Preview, Development

This single variable is used for both WebSocket and HTTP connections.

**Option 2: Using VITE_API_BASE (Alternative)**

1. In Vercel project settings → Environment Variables
2. Add a new variable:
   - **Name**: `VITE_API_BASE`
   - **Value**: `https://discord-agenda-activity-worker.YOUR_ACCOUNT_ID.workers.dev/api`
   - **Environments**: Production, Preview, Development

**Important:** You MUST set at least one of these variables for production deployment to work. The app will fail with a clear error message if neither is configured.

#### Step 3: Deploy

1. Click "Deploy"
2. Wait for deployment to complete
3. Visit your deployed URL
4. Create a new room and start using the app!

### Verifying Deployment

**Check Worker Deployment:**
1. Visit `https://YOUR_WORKER_URL/api/room/create`
2. Should return: `{"roomId":"ABC123","hostKey":"xY7kL9mNpQ2rS5tU",...}`

**Check Frontend Deployment:**
1. Visit your Vercel URL
2. Click "Create New Meeting"
3. Should show room creation modal with viewer/host links
4. No console errors about missing API configuration

## Environment Variables Reference

### Frontend (Vercel)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_WORKER_DOMAIN` | Yes* | Cloudflare Worker domain (without https://) | `my-worker.workers.dev` |
| `VITE_API_BASE` | Yes* | Alternative: Full API URL | `https://my-worker.workers.dev/api` |
| `VITE_PUBLIC_APP_URL` | No | Public-facing frontend URL for invite links (optional) | `https://discord-meeting-prod.vercel.app` |

*At least one is required for production deployment

### Backend (Cloudflare Worker)

These are configured in `worker/wrangler.toml`:

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord Application ID | `1467595700689703012` |
| `DISCORD_REDIRECT_URI` | Discord OAuth redirect | `https://1467595700689703012.discordsays.com` |
| `HOST_USER_IDS` | Discord user IDs allowed as hosts | `319255380074954753` |

## Documentation

Comprehensive documentation is available in the repository:

- **[STANDALONE_MODE.md](STANDALONE_MODE.md)** - Complete standalone mode guide
- **[IDENTITY_SYSTEM.md](IDENTITY_SYSTEM.md)** - ClientId/RoomId/HostKey system
- **[TIMER_SYSTEM.md](TIMER_SYSTEM.md)** - Synchronized timer implementation
- **[AGENDA_SYSTEM.md](AGENDA_SYSTEM.md)** - Agenda management features
- **[VOTING_SYSTEM.md](VOTING_SYSTEM.md)** - Voting functionality
- **[DUAL_MODE.md](DUAL_MODE.md)** - Standalone vs Discord Activity
- **[PRODUCTION_CONFIG.md](PRODUCTION_CONFIG.md)** - Production deployment details
- **[TEST_PLAN.md](TEST_PLAN.md)** - Testing scenarios

## Usage

### Standalone Mode

1. **Create a Meeting**
   - Click "Create New Meeting"
   - Get two links:
     - **Viewer Link**: Share with attendees (view-only)
     - **Host Link**: Keep private (full control)

2. **Host Capabilities**
   - Add/edit/delete agenda items
   - Navigate between items (Next/Previous)
   - Control timer (Start/Pause/Resume/Reset)
   - Open/close votes
   - Set active agenda item

3. **Attendee Capabilities**
   - View agenda and notes
   - See timer countdown
   - Cast votes when open
   - See live vote tallies

### Discord Activity Mode

1. **Setup**
   - Deploy to Discord-approved domain (discordsays.com)
   - Configure Discord Application
   - Set OAuth redirect URIs

2. **Usage**
   - Same features as standalone mode
   - Uses Discord user IDs for identity
   - Host determined by allowlist or hostKey

## Troubleshooting

### "Production requires VITE_API_BASE or VITE_WORKER_DOMAIN"

**Problem**: Frontend can't find backend API

**Solution**: Set environment variable in Vercel:
```
VITE_WORKER_DOMAIN=your-worker.workers.dev
```

### Worker deployment fails with "Account ID required"

**Problem**: Missing CLOUDFLARE_ACCOUNT_ID secret

**Solution**: Add the secret in GitHub repository settings

### WebSocket connection fails

**Problem**: Frontend trying to connect to wrong worker domain

**Solution**: Verify VITE_WORKER_DOMAIN matches your deployed worker URL

### Timer not syncing across clients

**Problem**: TIME_PING/PONG not working

**Solution**: Check browser console for WebSocket errors, verify worker is deployed

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

[Add your license here]

## Support

For issues, questions, or feature requests, please:
- Open an issue on GitHub
- Check the documentation files listed above
- Review the troubleshooting section

## Troubleshooting

### Vercel Deployment Protection

**Problem**: Viewers are prompted to sign into Vercel when accessing shared meeting links.

**Solution**: This occurs when Vercel Deployment Protection or Vercel Authentication is enabled for your production deployment.

To fix this:
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Deployment Protection**
3. For the **Production** deployment:
   - Disable **Vercel Authentication** (if enabled)
   - Disable **Deployment Protection** (if enabled)
4. Redeploy your application

**Note**: Deployment Protection is useful for preview/staging environments, but should typically be disabled for production deployments that need to be publicly accessible.

**Alternative**: If you need to keep Deployment Protection enabled for some reason, you can set the `VITE_PUBLIC_APP_URL` environment variable to a different public URL that doesn't have protection enabled, and invite links will be generated using that URL.

---

**Built with**: React, Vite, Cloudflare Workers, Durable Objects, WebSocket, Discord SDK
