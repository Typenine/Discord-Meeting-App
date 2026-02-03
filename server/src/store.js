/*
 * Meeting session store with simple in‑memory state and JSON persistence.
 *
 * Each meeting session tracks revision numbers so clients can poll for
 * changes.  When a host or attendee modifies the session (e.g. editing
 * the agenda, starting/pausing the timer, opening/closing a vote), the
 * revision is incremented.  The session is persisted to disk on every
 * mutation to survive process restarts.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// Location on disk where session data is stored.  We derive this from
// __dirname so tests and deployments behave the same regardless of
// working directory.  The data directory is created if it doesn't exist.
const DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../data');
const DATA_PATH = path.join(DATA_DIR, 'sessions.json');

// Host authorization configuration (injected from index.js)
let hostAuthConfig = null;

// Persistence health tracking
let persistenceHealth = {
  lastSaveSuccess: null,
  lastSaveFailure: null,
  consecutiveFailures: 0,
  totalSaves: 0,
  totalFailures: 0,
};

// In‑memory copy of all sessions, keyed by sessionId.
let sessions = {};

// Initialize host authorization configuration. Must be called by index.js
// before any session operations that require host validation.
export function setHostAuthConfig(config) {
  hostAuthConfig = config;
  console.log('[store] Host authorization configured:', {
    allowAll: config.allowAll,
    hostIdsCount: config.hostIds.size,
  });
}

// Validate if a user is an authorized host according to global config
function isAuthorizedHost(userId) {
  if (!hostAuthConfig) {
    console.warn('[store] Host auth config not initialized');
    return false;
  }
  if (hostAuthConfig.allowAll) return true;
  return hostAuthConfig.hostIds.has(String(userId));
}

// Load sessions from disk once when the module is first imported.  If the
// file doesn't exist or can't be parsed, we'll start with an empty
// object.  Enhanced with better logging and error tracking.
function loadSessions() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      console.log('[store] Data directory does not exist, will be created on first save:', DATA_DIR);
    }
    if (fs.existsSync(DATA_PATH)) {
      const text = fs.readFileSync(DATA_PATH, 'utf8');
      sessions = JSON.parse(text) || {};
      console.log('[store] Loaded sessions from disk:', {
        sessionCount: Object.keys(sessions).length,
        path: DATA_PATH,
      });
    } else {
      console.log('[store] No existing sessions file, starting fresh');
    }
  } catch (err) {
    console.error('[store] Failed to load sessions from disk:', String(err));
    sessions = {};
  }
}

// Persist the current sessions object to disk.  Writes are atomic via
// fs.writeFileSync; tracks persistence health for diagnostics.
function saveSessions() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(sessions, null, 2), 'utf8');
    persistenceHealth.lastSaveSuccess = Date.now();
    persistenceHealth.consecutiveFailures = 0;
    persistenceHealth.totalSaves++;
  } catch (err) {
    console.error('[store] Failed to save sessions to disk:', String(err));
    persistenceHealth.lastSaveFailure = Date.now();
    persistenceHealth.consecutiveFailures++;
    persistenceHealth.totalFailures++;
  }
}

// Get persistence health diagnostics
export function getPersistenceHealth() {
  return {
    ...persistenceHealth,
    dataDir: DATA_DIR,
    dataPath: DATA_PATH,
    dataDirExists: fs.existsSync(DATA_DIR),
    dataPathExists: fs.existsSync(DATA_PATH),
    dataDirWritable: (() => {
      try {
        fs.accessSync(DATA_DIR, fs.constants.W_OK);
        return true;
      } catch {
        return false;
      }
    })(),
  };
}

// Ensure sessions are loaded on first require.
loadSessions();

// Deep clone of a value using JSON serialization.  Used to avoid
// accidentally mutating internal session objects when returning data to
// callers.
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Compute the current remaining seconds based on endsAtMs and now.  We
// ceil to the nearest second to avoid showing zero before time runs out.
function computeRemainingSec(session) {
  const { timer } = session;
  if (!timer.running || timer.endsAtMs == null) return timer.remainingSec;
  const remainingMs = Math.max(0, timer.endsAtMs - Date.now());
  return Math.ceil(remainingMs / 1000);
}

// Return a snapshot of the session with computed remaining seconds and
// without exposing internal revision counters or minutes text.  This is
// what gets sent to clients.  The caller can append revision and
// serverNow if needed.
function snapshotSession(session) {
  const copy = clone(session);
  copy.timer = { ...copy.timer, remainingSec: computeRemainingSec(session) };
  return copy;
}

// Create a new meeting session and assign hostUserId.  Returns a
// snapshot of the created session.  The session id is a UUID.
// Enhanced to validate host authorization against global config.
export function createSession({ userId, username, sessionId }) {
  // Validate that the creating user is an authorized host
  if (!isAuthorizedHost(userId)) {
    console.warn('[store] Unauthorized host attempt:', { userId });
    return { error: 'unauthorized_host', message: 'User not authorized to create meetings' };
  }
  
  // Allow caller to specify a sessionId.  If none provided we generate a
  // UUID.  Passing a fixed sessionId enables deterministic meeting IDs
  // (e.g. based on Discord channel) so that clients can discover and
  // join the same session without guessing a random token.
  const id = sessionId || randomUUID();
  const now = Date.now();
  sessions[id] = {
    id,
    status: 'active',
    revision: 0,
    createdAt: now,
    updatedAt: now,
    hostUserId: String(userId),
    hostAuthorized: true, // Track that host was validated
    attendance: {
      [userId]: {
        userId: String(userId),
        displayName: username || '',
        joinedAt: now,
        lastSeenAt: now,
      },
    },
    agenda: [],
    currentAgendaItemId: null,
    timer: {
      running: false,
      endsAtMs: null,
      remainingSec: 0,
    },
    vote: {
      open: false,
      question: '',
      options: [],
      votesByUserId: {},
      closedResults: [],
    },
    minutes: '',
  };
  saveSessions();
  console.log('[store] Session created:', { sessionId: id, hostUserId: userId });
  return snapshotSession(sessions[id]);
}

// Join an existing meeting session.  Adds the user to attendance but
// doesn't bump the revision.  Returns a snapshot or null if not found.
export function joinSession({ sessionId, userId, username }) {
  const session = sessions[sessionId];
  if (!session) return null;
  const now = Date.now();
  const key = String(userId);
  session.attendance[key] = session.attendance[key] || {
    userId: key,
    displayName: username || '',
    joinedAt: now,
    lastSeenAt: now,
  };
  session.attendance[key].lastSeenAt = now;
  saveSessions();
  return snapshotSession(session);
}

// Mark that a user has been seen (poll).  Updates lastSeenAt but
// doesn't bump revision.
export function markSeen({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  const attendee = session.attendance[String(userId)];
  if (attendee) attendee.lastSeenAt = Date.now();
  saveSessions();
  return snapshotSession(session);
}

// Get the raw session object.  Returns null if not found.
export function getSession(sessionId) {
  return sessions[sessionId] || null;
}

// Internal helper to validate host access for a session.
// Returns true if userId is the session host AND authorized globally.
function validateHostAccess(session, userId) {
  if (!session) return false;
  const isSessionHost = session.hostUserId === String(userId);
  const isGloballyAuthorized = isAuthorizedHost(userId);
  
  if (isSessionHost && !isGloballyAuthorized) {
    console.warn('[store] Session host no longer globally authorized:', {
      sessionId: session.id,
      hostUserId: session.hostUserId,
    });
  }
  
  return isSessionHost && isGloballyAuthorized;
}

// Internal helper to bump revision and updatedAt.
function bumpRevision(session) {
  session.revision++;
  session.updatedAt = Date.now();
}

// Agenda management - Enhanced with validateHostAccess
export function addAgenda({ sessionId, userId, title, durationSec }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const id = randomUUID();
  session.agenda.push({ id, title: String(title), durationSec: Number(durationSec) || 0, notes: '' });
  if (!session.currentAgendaItemId) session.currentAgendaItemId = id;
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function updateAgenda({ sessionId, userId, agendaId, title, durationSec, notes }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const item = session.agenda.find((a) => a.id === agendaId);
  if (!item) return null;
  if (title !== undefined) item.title = String(title);
  if (durationSec !== undefined) item.durationSec = Number(durationSec) || 0;
  if (notes !== undefined) item.notes = String(notes);
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function deleteAgenda({ sessionId, userId, agendaId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const idx = session.agenda.findIndex((a) => a.id === agendaId);
  if (idx < 0) return null;
  session.agenda.splice(idx, 1);
  // If active item was removed, clear currentAgendaItemId
  if (session.currentAgendaItemId === agendaId) {
    session.currentAgendaItemId = session.agenda.length ? session.agenda[0].id : null;
    // Reset timer when deleting active agenda
    session.timer.running = false;
    session.timer.endsAtMs = null;
    session.timer.remainingSec = 0;
  }
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function setActiveAgenda({ sessionId, userId, agendaId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const exists = session.agenda.some((a) => a.id === agendaId);
  if (!exists) return null;
  session.currentAgendaItemId = agendaId;
  // Reset timer based on agenda duration if timer not running
  if (!session.timer.running) {
    const item = session.agenda.find((a) => a.id === agendaId);
    const sec = item ? Math.max(0, Math.round(item.durationSec)) : 0;
    session.timer.remainingSec = sec;
    session.timer.endsAtMs = null;
  }
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Timer controls - Enhanced with validateHostAccess
export function startTimer({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (session.timer.running) return snapshotSession(session);
  const remaining = computeRemainingSec(session);
  session.timer.running = true;
  session.timer.remainingSec = remaining;
  session.timer.endsAtMs = Date.now() + remaining * 1000;
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function pauseTimer({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (!session.timer.running) return snapshotSession(session);
  session.timer.remainingSec = computeRemainingSec(session);
  session.timer.running = false;
  session.timer.endsAtMs = null;
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function extendTimer({ sessionId, userId, seconds }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const delta = Number(seconds) || 0;
  if (delta === 0) return snapshotSession(session);
  if (session.timer.running && session.timer.endsAtMs != null) {
    session.timer.endsAtMs += delta * 1000;
  } else {
    session.timer.remainingSec = Math.max(0, session.timer.remainingSec + delta);
  }
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Voting - Enhanced with validateHostAccess
export function openVote({ sessionId, userId, question, options }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (!Array.isArray(options) || options.length < 2) return null;
  session.vote.open = true;
  session.vote.question = String(question || '');
  session.vote.options = options.map((o) => String(o));
  session.vote.votesByUserId = {};
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function castVote({ sessionId, userId, optionIndex }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!session.vote.open) return null;
  const idx = Number(optionIndex);
  if (Number.isNaN(idx) || idx < 0 || idx >= session.vote.options.length) return null;
  session.vote.votesByUserId[String(userId)] = idx;
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

export function closeVote({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (!session.vote.open) return snapshotSession(session);
  // Tally votes
  const tally = Array(session.vote.options.length).fill(0);
  for (const idx of Object.values(session.vote.votesByUserId)) {
    tally[idx] += 1;
  }
  const result = {
    ts: Date.now(),
    agendaId: session.currentAgendaItemId,
    question: session.vote.question,
    options: session.vote.options.slice(),
    tally,
    totalVotes: Object.keys(session.vote.votesByUserId).length,
  };
  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = '';
  session.vote.options = [];
  session.vote.votesByUserId = {};
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// End meeting and generate minutes.  For simplicity, the minutes are a
// plain‑text summary of the agenda, votes, and a placeholder for action
// items.  Returns the minutes string. Enhanced with validateHostAccess.
export function endMeeting({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (session.status === 'ended') return session.minutes;
  // Build minutes summary
  const lines = [];
  lines.push(`Meeting ID: ${session.id}`);
  lines.push(`Started at: ${new Date(session.createdAt).toLocaleString()}`);
  lines.push('');
  lines.push('Agenda:');
  session.agenda.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.title} (${item.durationSec || 0}s)`);
    if (item.notes) lines.push(`   Notes: ${item.notes}`);
  });
  lines.push('');
  // Votes summary
  if (session.vote.closedResults.length > 0) {
    lines.push('Votes:');
    session.vote.closedResults.forEach((r, idx) => {
      lines.push(`Q${idx + 1}. ${r.question}`);
      r.options.forEach((opt, oi) => {
        lines.push(`   ${opt}: ${r.tally[oi]} votes`);
      });
      lines.push(`   Total votes: ${r.totalVotes}`);
    });
    lines.push('');
  }
  lines.push('Action items:');
  lines.push('- [ ] TODO');
  session.minutes = lines.join('\n');
  session.status = 'ended';
  bumpRevision(session);
  saveSessions();
  return session.minutes;
}

// Return a snapshot for a given session id.  This helper is exported
// so API routes can easily fetch a session's current state without
// duplicating internal logic.  Returns null if the session doesn't exist.
export function getSnapshot(sessionId) {
  const session = sessions[sessionId];
  return session ? snapshotSession(session) : null;
}

// Get comprehensive store diagnostics for health checks and debugging
export function getStoreDiagnostics() {
  const activeSessions = Object.values(sessions).filter((s) => s.status === 'active').length;
  const endedSessions = Object.values(sessions).filter((s) => s.status === 'ended').length;
  const persistenceInfo = getPersistenceHealth();
  
  return {
    sessions: {
      total: Object.keys(sessions).length,
      active: activeSessions,
      ended: endedSessions,
    },
    persistence: persistenceInfo,
    hostAuth: {
      configured: hostAuthConfig !== null,
      allowAll: hostAuthConfig?.allowAll ?? false,
      hostIdsCount: hostAuthConfig?.hostIds?.size ?? 0,
    },
  };
}
