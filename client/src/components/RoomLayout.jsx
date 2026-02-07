import React from "react";

export default function RoomLayout({ 
  state, 
  username,
  clientId,
  localTimer,
  formatTime,
  isHost,
  viewAsAttendee,
  onCastVote
}) {
  if (!state) {
    return (
      <div className="flex items-center justify-center text-center" style={{
        height: "calc(100vh - var(--topbar-height))"
      }}>
        <div className="text-muted" style={{ fontSize: "var(--font-size-lg)" }}>
          Loading meeting data...
        </div>
      </div>
    );
  }

  return (
    <div className="mainColumn">
      {/* Hero Panel - Current Agenda Item */}
      <div className="heroPanel">
        <div className="sectionHeader">
          <h2 className="sectionTitle">Current Agenda Item</h2>
        </div>
        
        {state.activeAgendaId ? (() => {
          const activeItem = state.agenda.find(item => item.id === state.activeAgendaId);
          return activeItem ? (
            <div key={activeItem.id}>
              <div className="agendaItemDisplay">
                <div className="itemTitle">{activeItem.title}</div>
                {activeItem.notes && (
                  <div className="itemNotes">{activeItem.notes}</div>
                )}
                
                {/* Proposal Packet */}
                {activeItem.type === "proposal" && (activeItem.description || activeItem.link) && (
                  <div style={{
                    marginTop: "var(--spacing-lg)",
                    padding: "var(--spacing-lg)",
                    backgroundColor: "rgba(191, 153, 68, 0.1)",
                    border: "2px solid var(--color-accent)",
                    borderRadius: "var(--radius-lg)"
                  }}>
                    <div style={{ 
                      fontSize: "var(--font-size-lg)", 
                      fontWeight: "var(--font-weight-bold)",
                      color: "var(--color-accent)",
                      marginBottom: "var(--spacing-md)"
                    }}>
                      📋 Proposal Packet
                    </div>
                    {activeItem.description && (
                      <div style={{ 
                        fontSize: "var(--font-size-base)", 
                        marginBottom: "var(--spacing-md)",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap"
                      }}>
                        {activeItem.description}
                      </div>
                    )}
                    {activeItem.link && (
                      <a 
                        href={activeItem.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ 
                          display: "inline-block",
                          fontSize: "var(--font-size-base)",
                          color: "var(--color-accent)",
                          textDecoration: "none",
                          padding: "var(--spacing-sm) var(--spacing-md)",
                          backgroundColor: "rgba(191, 153, 68, 0.2)",
                          border: "1px solid var(--color-accent)",
                          borderRadius: "var(--radius-md)",
                          transition: "all var(--transition-fast)"
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = "rgba(191, 153, 68, 0.3)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = "rgba(191, 153, 68, 0.2)";
                        }}
                      >
                        🔗 View Full Proposal Document
                      </a>
                    )}
                  </div>
                )}
                
                <div className="pill pill-accent itemDuration">
                  Duration: {formatTime(activeItem.durationSec)}
                </div>
              </div>
              
              {/* Timer Display */}
              <div className={`timerDisplay ${state.timer.running ? 'running' : ''} ${localTimer < 0 ? 'overtime' : ''}`}>
                <div className={`timerValue ${state.timer.running && localTimer < 10 && localTimer >= 0 ? 'warning' : ''} ${localTimer < 0 ? 'overtime' : ''}`}>
                  {formatTime(localTimer)}
                </div>
                <div className="timerStatus">
                  {localTimer < 0 ? '⏱️ Overtime' :
                   state.timer.running ? '▶️ Running' : 
                   state.timer.pausedRemainingSec !== null ? '⏸ Paused' : 
                   '⏹ Stopped'}
                </div>
              </div>
            </div>
          ) : (
            <div className="emptyState">
              <div className="emptyIcon">📋</div>
              <div className="emptyText">No active agenda item</div>
            </div>
          );
        })() : (
          <div className="emptyState">
            <div className="emptyIcon">📋</div>
            <div className="emptyText">
              No agenda item selected. {isHost && !viewAsAttendee && "Use host controls to set an active item."}
            </div>
          </div>
        )}
      </div>

      {/* Timeline Panel - Agenda Queue */}
      <div className="timelinePanel">
        <div className="sectionHeader">
          <h3 className="sectionTitle">Agenda Timeline</h3>
          <span className="itemCount">{state.agenda.length} {state.agenda.length === 1 ? 'item' : 'items'}</span>
        </div>
        
        {state.agenda.length === 0 ? (
          <div className="text-center text-muted" style={{ 
            padding: "var(--spacing-lg)",
            fontStyle: "italic"
          }}>
            No agenda items yet. {isHost && !viewAsAttendee && "Add items using the host controls."}
          </div>
        ) : (
          <ul className="agendaTimeline">
            {state.agenda.map((item, index) => {
              // For active item, show live remaining time; otherwise show configured duration
              const isActive = state.activeAgendaId === item.id;
              const displayTime = isActive ? localTimer : item.durationSec;
              
              return (
                <li 
                  key={item.id} 
                  className={`timelineItem ${isActive ? 'active' : ''}`}
                >
                  <div className="timelineItemContent">
                    <div className="timelineItemNumber">{index + 1}</div>
                    <div className="timelineItemDetails">
                      <div className="timelineItemTitle">{item.title}</div>
                      <div className="timelineItemMeta">
                        <div className="pill pill-accent">
                          {formatTime(displayTime)}
                        </div>
                        {isActive && (
                          <div className="pill pill-accent">
                            ⭐ ACTIVE NOW
                          </div>
                        )}
                      </div>
                      {item.notes && (
                        <div className="timelineItemNotes">{item.notes}</div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Voting Section */}
      {state.vote.open && (
        <div className="votingSection">
          <div className="sectionHeader">
            <h3 className="sectionTitle">🗳️ Active Vote</h3>
          </div>
          
          <div className="voteQuestion">{state.vote.question}</div>
          
          <div className="voteOptions">
            {state.vote.options.map((opt) => {
              const optionId = opt.id || opt;
              const optionLabel = opt.label || opt;
              const voteCount = state.vote.votesByClientId 
                ? Object.values(state.vote.votesByClientId).filter(v => v === optionId).length 
                : 0;
              const hasVoted = state.vote.votesByClientId?.[clientId] !== undefined;
              const votedForThis = state.vote.votesByClientId?.[clientId] === optionId;
              
              return (
                <div 
                  key={optionId} 
                  className={`voteOption ${votedForThis ? 'voted' : ''}`}
                >
                  <div style={{ flex: 1 }}>
                    <div className="voteOptionLabel">{optionLabel}</div>
                    <div className="voteOptionCount">
                      {voteCount} vote{voteCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  {!(isHost && !viewAsAttendee) && (
                    <button
                      className={`btn ${votedForThis ? 'btnSecondary' : 'btnPrimary'}`}
                      onClick={() => onCastVote(optionId)}
                      disabled={hasVoted}
                    >
                      {votedForThis ? "✓ Voted" : "Vote"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="text-center text-muted" style={{ 
            fontWeight: "var(--font-weight-medium)"
          }}>
            Total votes cast: {Object.keys(state.vote.votesByClientId || {}).length}
          </div>
        </div>
      )}

      {/* Past Votes */}
      {state.vote.closedResults && state.vote.closedResults.length > 0 && (
        <details className="card">
          <summary style={{ 
            cursor: "pointer", 
            fontWeight: "var(--font-weight-bold)",
            fontSize: "var(--font-size-lg)",
            padding: "var(--spacing-lg)"
          }}>
            📊 Past Votes ({state.vote.closedResults.length})
          </summary>
          <div style={{ padding: "0 var(--spacing-lg) var(--spacing-lg)" }}>
            {state.vote.closedResults.map((result, idx) => (
              <div key={idx} className="listItem mb-lg">
                <div className="mb-md" style={{ 
                  fontWeight: "var(--font-weight-bold)",
                  fontSize: "var(--font-size-lg)"
                }}>
                  {result.question}
                </div>
                <ul style={{ 
                  listStyle: "none", 
                  padding: 0, 
                  margin: 0 
                }}>
                  {result.options.map((opt) => {
                    const optionId = opt.id || opt;
                    const optionLabel = opt.label || opt;
                    const voteCount = typeof result.tally === 'object' 
                      ? (result.tally[optionId] || 0) 
                      : (result.tally[result.options.indexOf(opt)] || 0);
                    const percentage = result.totalVotes > 0 
                      ? Math.round((voteCount / result.totalVotes) * 100) 
                      : 0;
                    
                    return (
                      <li key={optionId} className="mb-sm" style={{ 
                        padding: "var(--spacing-sm)",
                        background: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "var(--radius-sm)"
                      }}>
                        <div className="flex" style={{ 
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span style={{ fontWeight: "var(--font-weight-medium)" }}>{optionLabel}:</span>
                          <span className="text-muted">
                            {voteCount} vote{voteCount !== 1 ? 's' : ''} ({percentage}%)
                          </span>
                        </div>
                        <div style={{
                          marginTop: "var(--spacing-xs)",
                          height: "6px",
                          backgroundColor: "var(--color-border-muted)",
                          borderRadius: "var(--radius-sm)",
                          overflow: "hidden"
                        }}>
                          <div style={{
                            width: `${percentage}%`,
                            height: "100%",
                            backgroundColor: "var(--color-primary)",
                            transition: "width 0.3s ease"
                          }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="text-muted mt-sm" style={{ 
                  fontSize: "var(--font-size-sm)", 
                  fontWeight: "var(--font-weight-medium)"
                }}>
                  Total votes: {result.totalVotes}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      
      {/* Ballot Queue */}
      {state.agenda && state.agenda.some(item => item.onBallot) && (
        <div className="card">
          <div className="sectionHeader">
            <h3 className="sectionTitle">🗳️ Ballot Queue</h3>
            <span className="itemCount">
              {state.agenda.filter(item => item.onBallot).length} proposal{state.agenda.filter(item => item.onBallot).length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="cardBody">
            <div style={{ 
              fontSize: "var(--font-size-sm)", 
              opacity: 0.7, 
              marginBottom: "var(--spacing-md)" 
            }}>
              Proposals ready for voting
            </div>
            {state.agenda
              .filter(item => item.onBallot)
              .map((item, index) => (
                <div 
                  key={item.id}
                  style={{
                    padding: "var(--spacing-md)",
                    marginBottom: "var(--spacing-md)",
                    backgroundColor: "rgba(191, 153, 68, 0.1)",
                    border: "2px solid var(--color-accent)",
                    borderRadius: "var(--radius-md)"
                  }}
                >
                  <div style={{
                    fontSize: "var(--font-size-lg)",
                    fontWeight: "var(--font-weight-bold)",
                    marginBottom: "var(--spacing-sm)"
                  }}>
                    {index + 1}. {item.title}
                  </div>
                  {item.description && (
                    <div style={{
                      fontSize: "var(--font-size-base)",
                      marginBottom: "var(--spacing-sm)",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap"
                    }}>
                      {item.description}
                    </div>
                  )}
                  {item.link && (
                    <a 
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        fontSize: "var(--font-size-sm)",
                        color: "var(--color-accent)",
                        textDecoration: "underline"
                      }}
                    >
                      🔗 View proposal document
                    </a>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
