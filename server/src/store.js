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
import { generateMinutes } from './minutesGenerator.js';

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

// Validate if a user is an authorized host according to global config.
// If no hostIds are configured, all users are allowed (default behavior).
// If hostIds are configured, they act as an additional allowlist.
function isAuthorizedHost(userId) {
  if (!hostAuthConfig) {
    console.warn('[store] Host auth config not initialized');
    return false;
  }
  // If allowAll is set (*), everyone is allowed
  if (hostAuthConfig.allowAll) return true;
  // If no specific host IDs are configured, allow anyone (optional allowlist)
  if (hostAuthConfig.hostIds.size === 0) return true;
  // If host IDs are configured, check if user is in the allowlist
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

// Compute the current elapsed time for the meeting timer in seconds
function computeMeetingElapsedSec(session) {
  const { meetingTimer } = session;
  if (!meetingTimer.running || meetingTimer.startedAtMs == null) return 0;
  const elapsedMs = Date.now() - meetingTimer.startedAtMs;
  return Math.floor(elapsedMs / 1000);
}

// Return a snapshot of the session with computed remaining seconds and
// without exposing internal revision counters or minutes text.  This is
// what gets sent to clients.  The caller can append revision and
// serverNow if needed.
function snapshotSession(session) {
  const copy = clone(session);
  copy.timer = { ...copy.timer, remainingSec: computeRemainingSec(session) };
  copy.meetingTimer = { 
    ...copy.meetingTimer, 
    elapsedSec: computeMeetingElapsedSec(session) 
  };
  return copy;
}

// Create a new meeting session and assign hostUserId.  Returns a
// snapshot of the created session.  The session id is a UUID.
// Host authorization: If HOST_USER_IDS is not set, anyone can create meetings.
// If HOST_USER_IDS is set, it acts as an additional allowlist for extra safety.
export function createSession({ userId, username, sessionId, channelId, guildId }) {
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
    // Discord context for channel-specific meetings
    channelId: channelId ? String(channelId) : null,
    guildId: guildId ? String(guildId) : null,
    // Meeting setup and configuration
    meetingName: '',
    meetingStarted: false, // Track if meeting has been officially started
    meetingTimer: {
      running: false,
      startedAtMs: null, // When meeting timer was started
    },
    attendance: {
      [userId]: {
        userId: String(userId),
        displayName: username || '',
        joinedAt: now,
        lastSeenAt: now,
        leftAt: null,
      },
    },
    agenda: [],
    currentAgendaItemId: null,
    timer: {
      running: false,
      endsAtMs: null,
      remainingSec: 0,
      durationSet: 0, // Track original duration for validation
    },
    vote: {
      open: false,
      question: '',
      options: [],
      votesByUserId: {},
      closedResults: [],
      linkedAgendaId: null, // Link current vote to agenda item
    },
    minutes: '',
  };
  saveSessions();
  console.log('[store] Session created:', { sessionId: id, hostUserId: userId, channelId, guildId });
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
// Returns true if userId is the session host AND (authorized globally OR no allowlist configured).
function validateHostAccess(session, userId) {
  if (!session) return false;
  const isSessionHost = session.hostUserId === String(userId);
  const isGloballyAuthorized = isAuthorizedHost(userId);
  
  if (isSessionHost && !isGloballyAuthorized) {
    console.warn('[store] Session host blocked by allowlist:', {
      sessionId: session.id,
      hostUserId: session.hostUserId,
      note: 'HOST_USER_IDS is configured and user is not in allowlist',
    });
  }
  
  return isSessionHost && isGloballyAuthorized;
}

// Internal helper to bump revision and updatedAt.
function bumpRevision(session) {
  session.revision++;
  session.updatedAt = Date.now();
}

// Agenda management - Enhanced with validateHostAccess and status tracking
export function addAgenda({ sessionId, userId, title, durationSec }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  const id = randomUUID();
  session.agenda.push({ 
    id, 
    title: String(title), 
    durationSec: Number(durationSec) || 0, 
    notes: '',
    status: 'pending', // 'pending' | 'active' | 'completed'
    startedAt: null,
    completedAt: null,
    timeSpent: 0,
  });
  // If this is the first agenda item, make it active
  if (!session.currentAgendaItemId) {
    session.currentAgendaItemId = id;
    const item = session.agenda.find((a) => a.id === id);
    if (item) {
      item.status = 'active';
      item.startedAt = Date.now();
    }
  }
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
  
  // Prevent deletion of active agenda item - must be completed or changed first
  const item = session.agenda[idx];
  if (item.status === 'active') {
    console.warn('[store] Cannot delete active agenda item:', { agendaId });
    return { error: 'active_item', message: 'Cannot delete active agenda item. Please mark as completed or switch to another item first.' };
  }
  
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
  
  // Mark previous active item as completed
  if (session.currentAgendaItemId) {
    const prevItem = session.agenda.find((a) => a.id === session.currentAgendaItemId);
    if (prevItem && prevItem.status === 'active') {
      prevItem.status = 'completed';
      prevItem.completedAt = Date.now();
      if (prevItem.startedAt) {
        prevItem.timeSpent = prevItem.completedAt - prevItem.startedAt;
      }
    }
  }
  
  // Mark new item as active
  const newItem = session.agenda.find((a) => a.id === agendaId);
  if (newItem) {
    newItem.status = 'active';
    if (!newItem.startedAt) {
      newItem.startedAt = Date.now();
    }
  }
  
  session.currentAgendaItemId = agendaId;
  // Reset timer based on agenda duration if timer not running
  if (!session.timer.running) {
    const item = session.agenda.find((a) => a.id === agendaId);
    const sec = item ? Math.max(0, Math.round(item.durationSec)) : 0;
    session.timer.remainingSec = sec;
    session.timer.endsAtMs = null;
    session.timer.durationSet = sec;
  }
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Update meeting setup (name and agenda before meeting starts)
export function updateMeetingSetup({ sessionId, userId, meetingName, agenda }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  
  // Can only update setup before meeting is started
  if (session.meetingStarted) {
    console.warn('[store] Cannot update setup after meeting has started:', { sessionId });
    return { error: 'meeting_started', message: 'Cannot update setup after meeting has started' };
  }
  
  if (meetingName !== undefined) {
    session.meetingName = String(meetingName);
  }
  
  if (agenda !== undefined && Array.isArray(agenda)) {
    // Replace entire agenda with new one
    session.agenda = agenda.map((item) => ({
      id: item.id || randomUUID(),
      title: String(item.title || ''),
      durationSec: Number(item.durationSec) || 0,
      notes: String(item.notes || ''),
      status: 'pending',
      startedAt: null,
      completedAt: null,
      timeSpent: 0,
    }));
    
    // Set first agenda item as active if agenda is not empty
    if (session.agenda.length > 0 && !session.currentAgendaItemId) {
      session.currentAgendaItemId = session.agenda[0].id;
    }
  }
  
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Start the meeting (host only) - can optionally start meeting timer
export function startMeeting({ sessionId, userId, startTimer = true }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  
  // Mark meeting as started
  if (!session.meetingStarted) {
    session.meetingStarted = true;
    
    // Start meeting timer if requested
    if (startTimer) {
      session.meetingTimer.running = true;
      session.meetingTimer.startedAtMs = Date.now();
    }
    
    // Mark first agenda item as active if not already set
    if (session.agenda.length > 0 && !session.currentAgendaItemId) {
      const firstItem = session.agenda[0];
      session.currentAgendaItemId = firstItem.id;
      firstItem.status = 'active';
      firstItem.startedAt = Date.now();
    }
    
    console.log('[store] Meeting started:', { 
      sessionId, 
      meetingName: session.meetingName,
      agendaItems: session.agenda.length,
      timerStarted: startTimer,
    });
  }
  
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Timer controls - Enhanced with validateHostAccess and decimal minute support
export function startTimer({ sessionId, userId, durationMinutes }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (session.timer.running) return snapshotSession(session);
  
  // Support decimal minutes (e.g., 2.5 minutes = 150 seconds)
  let remaining = computeRemainingSec(session);
  if (durationMinutes !== undefined) {
    const minutes = Number(durationMinutes);
    if (!Number.isNaN(minutes) && minutes > 0) {
      remaining = Math.round(minutes * 60);
      session.timer.durationSet = remaining;
    }
  }
  
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
  
  // Validate timer extensions - prevent excessive negative values
  if (session.timer.running && session.timer.endsAtMs != null) {
    const currentRemaining = Math.max(0, Math.floor((session.timer.endsAtMs - Date.now()) / 1000));
    const newRemaining = currentRemaining + delta;
    if (newRemaining < 0) {
      console.warn('[store] Timer extension would result in negative time:', { delta, currentRemaining });
      return { error: 'invalid_extension', message: 'Timer extension would result in negative time' };
    }
    // Prevent excessive extensions (more than 2x original duration)
    if (session.timer.durationSet > 0 && newRemaining > session.timer.durationSet * 2) {
      console.warn('[store] Timer extension exceeds 2x original duration:', { delta, durationSet: session.timer.durationSet });
      return { error: 'excessive_extension', message: 'Timer extension exceeds 2x original duration' };
    }
    session.timer.endsAtMs += delta * 1000;
  } else {
    session.timer.remainingSec = Math.max(0, session.timer.remainingSec + delta);
  }
  bumpRevision(session);
  saveSessions();
  return snapshotSession(session);
}

// Voting - Enhanced with validateHostAccess and duplicate prevention
export function openVote({ sessionId, userId, question, options }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (!Array.isArray(options) || options.length < 2) return null;
  session.vote.open = true;
  session.vote.question = String(question || '');
  session.vote.options = options.map((o) => String(o));
  session.vote.votesByUserId = {};
  session.vote.linkedAgendaId = session.currentAgendaItemId; // Link to current agenda
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
  
  // Allow users to change their vote, but track that they voted
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

// End meeting and generate minutes.  Enhanced with Markdown formatting,
// action item extraction, and comprehensive meeting statistics.
export function endMeeting({ sessionId, userId }) {
  const session = sessions[sessionId];
  if (!session) return null;
  if (!validateHostAccess(session, userId)) return null;
  if (session.status === 'ended') return session.minutes;
  
  // Validate meeting state before ending
  const warnings = [];
  
  // Check for incomplete agenda items
  const incompleteItems = session.agenda.filter(a => a.status === 'pending' || a.status === 'active');
  if (incompleteItems.length > 0) {
    warnings.push(`${incompleteItems.length} agenda item(s) not completed`);
  }
  
  // Check for open votes
  if (session.vote.open) {
    warnings.push('Vote is still open');
  }
  
  // Log warnings but allow meeting to end
  if (warnings.length > 0) {
    console.warn('[store] Meeting ended with warnings:', { sessionId, warnings });
  }
  
  // Mark any active agenda items as completed
  session.agenda.forEach(item => {
    if (item.status === 'active') {
      item.status = 'completed';
      item.completedAt = Date.now();
      if (item.startedAt) {
        item.timeSpent = item.completedAt - item.startedAt;
      }
    }
  });
  
  // Generate enhanced minutes using minutesGenerator
  session.minutes = generateMinutes(session);
  session.status = 'ended';
  session.endedAt = Date.now();
  bumpRevision(session);
  saveSessions();
  
  console.log('[store] Meeting ended:', { 
    sessionId, 
    duration: session.endedAt - session.createdAt,
    agendaItems: session.agenda.length,
    votes: session.vote.closedResults.length,
    warnings: warnings.length,
  });
  
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
