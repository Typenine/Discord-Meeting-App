// Vercel Serverless Function - API Router
// This handles all /api/* requests by using the shared Express app

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (Vercel sets these, but also check for .env files)
const envLocalPath = path.resolve(__dirname, "../server/.env.local");
const envPath = path.resolve(__dirname, "../server/.env");

if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath, override: true });
if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: true });

// Also load from Vercel environment
dotenv.config({ override: false });

// Import the app factory and store
import * as store from "../server/src/store.js";
import { createApp } from "../server/src/app.js";

// Parse host configuration
const rawHostIds = String(process.env.HOST_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const HOST_ALLOW_ALL = rawHostIds.includes("*");
const HOST_IDS = new Set(rawHostIds.filter((id) => id !== "*"));

// Initialize store with host authorization
store.setHostAuthConfig({
  allowAll: HOST_ALLOW_ALL,
  hostIds: HOST_IDS,
});

// Create the Express app with root mounting for Vercel
const app = createApp({
  CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
  HOST_ALLOW_ALL,
  HOST_IDS,
  mountAtRoot: true, // Mount API routes at root for Vercel compatibility
});

// Export the Express app directly - Vercel handles the wrapping
export default app;
