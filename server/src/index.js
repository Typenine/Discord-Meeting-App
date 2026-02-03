import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server/.env.local then server/.env, overriding any existing shell env vars.
const envLocalPath = path.resolve(__dirname, "../.env.local");
const envPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

// ---- config ----
const PORT = Number(process.env.PORT || 8787);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

// Host allowlist: comma-separated user IDs; "*" means allow anyone.
const rawHostIds = String(process.env.HOST_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HOST_ALLOW_ALL = rawHostIds.includes("*");
const HOST_IDS = new Set(rawHostIds.filter((id) => id !== "*"));

console.log("[ENV CHECK]", {
  cwd: process.cwd(),
  envLocalPath,
  envPath,
  envLocalExists: fs.existsSync(envLocalPath),
  envExists: fs.existsSync(envPath),
  port: PORT,
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  secretLength: (CLIENT_SECRET || "").length,
  hostAllowAll: HOST_ALLOW_ALL,
  hostIdsCount: HOST_IDS.size,
});

// Import our persistent meeting store and app factory
import * as store from "./store.js";
import { createApp } from "./app.js";

// Initialize store with host authorization configuration
store.setHostAuthConfig({
  allowAll: HOST_ALLOW_ALL,
  hostIds: HOST_IDS,
});

// Create Express app with all routes
const app = createApp({
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  HOST_ALLOW_ALL,
  HOST_IDS,
});

// ---- server ----
// Start the HTTP server.
const server = app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});
