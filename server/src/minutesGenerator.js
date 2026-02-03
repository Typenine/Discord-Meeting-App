/*
 * Meeting minutes generator with Markdown formatting and action item extraction.
 * 
 * This module provides enhanced minutes generation with:
 * - Comprehensive meeting metadata
 * - Markdown formatting for better readability
 * - Automatic action item extraction from agenda notes
 * - Meeting statistics and summaries
 */

/**
 * Extract action items from text using pattern matching.
 * Looks for common patterns like:
 * - TODO: task
 * - ACTION: task
 * - - [ ] task
 * - @username do something
 */
function extractActionItems(text) {
  if (!text) return [];
  
  const actionItems = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Pattern 1: TODO: or TODO - 
    if (/^TODO[:\-]\s+/i.test(trimmed)) {
      const item = trimmed.replace(/^TODO[:\-]\s+/i, '').trim();
      if (item) actionItems.push({ text: item, priority: 'medium', assignee: null });
    }
    // Pattern 2: ACTION: or ACTION -
    else if (/^ACTION[:\-]\s+/i.test(trimmed)) {
      const item = trimmed.replace(/^ACTION[:\-]\s+/i, '').trim();
      if (item) actionItems.push({ text: item, priority: 'high', assignee: null });
    }
    // Pattern 3: - [ ] task (markdown checkbox)
    else if (/^[-*]\s*\[\s*\]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s*\[\s*\]\s+/, '').trim();
      if (item) actionItems.push({ text: item, priority: 'medium', assignee: null });
    }
    // Pattern 4: @username do something
    else if (/@(\w+)\s+(.+)/.test(trimmed)) {
      const match = trimmed.match(/@(\w+)\s+(.+)/);
      if (match) {
        actionItems.push({ 
          text: match[2].trim(), 
          priority: 'medium', 
          assignee: match[1] 
        });
      }
    }
    // Pattern 5: Lines starting with HIGH:, CRITICAL:, URGENT:
    else if (/^(HIGH|CRITICAL|URGENT)[:\-]\s+/i.test(trimmed)) {
      const item = trimmed.replace(/^(HIGH|CRITICAL|URGENT)[:\-]\s+/i, '').trim();
      if (item) actionItems.push({ text: item, priority: 'high', assignee: null });
    }
  }
  
  return actionItems;
}

/**
 * Format duration in a human-readable way
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format a timestamp as a readable date/time
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Generate comprehensive meeting minutes in Markdown format
 */
export function generateMinutes(session) {
  const lines = [];
  const now = Date.now();
  const duration = now - session.createdAt;
  
  // Extract metadata
  const channelInfo = session.channelId ? ` | **Channel:** <#${session.channelId}>` : '';
  const guildInfo = session.guildId ? ` | **Server:** ${session.guildId}` : '';
  const participantCount = Object.keys(session.attendance).length;
  
  // Meeting header
  const firstAgendaTitle = session.agenda.length > 0 ? session.agenda[0].title : 'Meeting';
  lines.push(`# Meeting: ${firstAgendaTitle}`);
  lines.push(`**Date:** ${formatTimestamp(session.createdAt)} | **Duration:** ${formatDuration(duration)}${channelInfo}${guildInfo}`);
  lines.push(`**Host:** ${session.attendance[session.hostUserId]?.displayName || session.hostUserId} | **Participants:** ${participantCount}`);
  lines.push('');
  
  // Meeting summary
  const completedItems = session.agenda.filter(a => a.status === 'completed').length;
  const totalVotes = session.vote.closedResults.length;
  
  lines.push('## Summary');
  lines.push(`- Agenda items completed: ${completedItems}/${session.agenda.length}`);
  lines.push(`- Votes taken: ${totalVotes}`);
  
  // Extract all action items from agenda notes
  const allActionItems = [];
  for (const item of session.agenda) {
    if (item.notes) {
      const items = extractActionItems(item.notes);
      items.forEach(ai => {
        ai.source = item.title;
        allActionItems.push(ai);
      });
    }
  }
  
  lines.push(`- Action items identified: ${allActionItems.length}`);
  lines.push(`- Attendance: ${participantCount} participant${participantCount !== 1 ? 's' : ''}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Agenda items
  if (session.agenda.length > 0) {
    lines.push('## Agenda Items');
    lines.push('');
    
    session.agenda.forEach((item, idx) => {
      const statusEmoji = item.status === 'completed' ? '✅' : item.status === 'active' ? '🔄' : '⏸️';
      const timeInfo = item.timeSpent > 0 ? ` (${formatDuration(item.timeSpent)})` : 
                       item.durationSec > 0 ? ` (${item.durationSec}s)` : '';
      
      lines.push(`### ${idx + 1}. ${item.title} ${statusEmoji}${timeInfo}`);
      lines.push(`**Status:** ${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`);
      
      if (item.notes) {
        lines.push(`**Notes:** ${item.notes}`);
      }
      
      // Find votes linked to this agenda item
      const linkedVotes = session.vote.closedResults.filter(v => v.agendaId === item.id);
      if (linkedVotes.length > 0) {
        linkedVotes.forEach(vote => {
          lines.push('');
          lines.push(`**Vote:** "${vote.question}"`);
          
          // Find winning option
          const maxVotes = Math.max(...vote.tally);
          vote.options.forEach((opt, oi) => {
            const isWinner = vote.tally[oi] === maxVotes && maxVotes > 0;
            const emoji = isWinner ? '✅' : '❌';
            const percentage = vote.totalVotes > 0 ? Math.round((vote.tally[oi] / vote.totalVotes) * 100) : 0;
            lines.push(`- ${emoji} ${opt}: ${vote.tally[oi]} vote${vote.tally[oi] !== 1 ? 's' : ''} (${percentage}%)`);
          });
          lines.push(`**Total votes:** ${vote.totalVotes}`);
        });
      }
      
      lines.push('');
    });
  }
  
  // Decisions made (votes summary)
  if (session.vote.closedResults.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Decisions Made');
    lines.push('');
    
    session.vote.closedResults.forEach((vote, idx) => {
      const maxVotes = Math.max(...vote.tally);
      const winnerIndex = vote.tally.indexOf(maxVotes);
      const winner = vote.options[winnerIndex];
      const approval = vote.totalVotes > 0 ? Math.round((maxVotes / vote.totalVotes) * 100) : 0;
      
      lines.push(`${idx + 1}. ${winner ? '✅' : '❌'} "${vote.question}" → **${winner}** (${approval}% approval)`);
    });
    
    lines.push('');
  }
  
  // Action items
  if (allActionItems.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Action Items');
    lines.push('');
    
    // Group by priority
    const highPriority = allActionItems.filter(ai => ai.priority === 'high');
    const mediumPriority = allActionItems.filter(ai => ai.priority === 'medium');
    
    if (highPriority.length > 0) {
      lines.push('### High Priority');
      highPriority.forEach(ai => {
        const assignee = ai.assignee ? `@${ai.assignee} ` : '';
        lines.push(`- [ ] ${assignee}${ai.text}`);
      });
      lines.push('');
    }
    
    if (mediumPriority.length > 0) {
      lines.push('### Medium Priority');
      mediumPriority.forEach(ai => {
        const assignee = ai.assignee ? `@${ai.assignee} ` : '';
        lines.push(`- [ ] ${assignee}${ai.text}`);
      });
      lines.push('');
    }
  } else {
    lines.push('---');
    lines.push('');
    lines.push('## Action Items');
    lines.push('');
    lines.push('*No action items identified during the meeting.*');
    lines.push('');
  }
  
  // Attendance
  lines.push('---');
  lines.push('');
  lines.push('## Attendance');
  lines.push('');
  
  const attendees = Object.values(session.attendance);
  attendees.forEach(user => {
    const joinTime = formatTimestamp(user.joinedAt);
    const leftTime = user.leftAt ? ` - ${formatTimestamp(user.leftAt)}` : ' - present';
    const isHost = user.userId === session.hostUserId ? ' (Host)' : '';
    lines.push(`- ${user.displayName || user.userId}${isHost} - joined ${joinTime}${leftTime}`);
  });
  
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Minutes generated: ${formatTimestamp(now)}*`);
  
  return lines.join('\n');
}
