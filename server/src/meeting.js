export function createMeetingSession({ sessionId }) {
  return {
    sessionId,
    hostUserId: null,
    agenda: [
      { id: "a1", title: "Opening / Roll Call", minutes: 3 },
      { id: "a2", title: "Rulebook Changes", minutes: 20 },
      { id: "a3", title: "Draft Logistics", minutes: 15 },
      { id: "a4", title: "Votes", minutes: 10 }
    ],
    activeAgendaId: "a1",
    timer: {
      running: false,
      // When running: endsAtMs is authoritative
      endsAtMs: null,
      remainingSec: 3 * 60
    },
    vote: {
      open: false,
      question: "",
      options: [],
      votesByUserId: {}, // { [userId]: optionIndex }
      closedResults: []  // history
    },
    log: []
  };
}

export function snapshot(session) {
  return JSON.parse(JSON.stringify(session));
}

export function getActiveItem(session) {
  return session.agenda.find(a => a.id === session.activeAgendaId) ?? null;
}

export function setActiveItem(session, agendaId) {
  const exists = session.agenda.some(a => a.id === agendaId);
  if (!exists) return false;
  session.activeAgendaId = agendaId;

  // Reset timer to that item's minutes if not running
  const item = getActiveItem(session);
  if (!session.timer.running && item) {
    session.timer.remainingSec = Math.max(0, Math.round(item.minutes * 60));
    session.timer.endsAtMs = null;
  }

  return true;
}

export function timerStart(session) {
  if (session.timer.running) return;
  session.timer.running = true;
  session.timer.endsAtMs = Date.now() + session.timer.remainingSec * 1000;
}

export function timerPause(session) {
  if (!session.timer.running) return;
  const remainingMs = Math.max(0, session.timer.endsAtMs - Date.now());
  session.timer.remainingSec = Math.ceil(remainingMs / 1000);
  session.timer.running = false;
  session.timer.endsAtMs = null;
}

export function timerResetToActiveItem(session) {
  const item = getActiveItem(session);
  const sec = item ? Math.max(0, Math.round(item.minutes * 60)) : 0;
  session.timer.running = false;
  session.timer.endsAtMs = null;
  session.timer.remainingSec = sec;
}

export function tickTimer(session) {
  if (!session.timer.running) return;
  const remainingMs = Math.max(0, session.timer.endsAtMs - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  session.timer.remainingSec = remainingSec;

  if (remainingSec <= 0) {
    session.timer.running = false;
    session.timer.endsAtMs = null;
    session.log.push({ ts: Date.now(), type: "TIMER_DONE", agendaId: session.activeAgendaId });
  }
}

export function openVote(session, { question, options }) {
  session.vote.open = true;
  session.vote.question = question;
  session.vote.options = options;
  session.vote.votesByUserId = {};
}

export function castVote(session, { userId, optionIndex }) {
  if (!session.vote.open) return false;
  if (optionIndex < 0 || optionIndex >= session.vote.options.length) return false;
  session.vote.votesByUserId[userId] = optionIndex;
  return true;
}

export function closeVote(session) {
  if (!session.vote.open) return null;

  const tally = new Array(session.vote.options.length).fill(0);
  for (const idx of Object.values(session.vote.votesByUserId)) {
    tally[idx] += 1;
  }

  const result = {
    ts: Date.now(),
    agendaId: session.activeAgendaId,
    question: session.vote.question,
    options: session.vote.options,
    tally,
    totalVotes: Object.keys(session.vote.votesByUserId).length
  };

  session.vote.closedResults.push(result);
  session.vote.open = false;
  session.vote.question = "";
  session.vote.options = [];
  session.vote.votesByUserId = {};

  session.log.push({ ts: Date.now(), type: "VOTE_CLOSED", result });
  return result;
}
