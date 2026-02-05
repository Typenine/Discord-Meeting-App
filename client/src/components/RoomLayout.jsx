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
      <div className="flex items-center text-center" style={{
        justifyContent: "center",
        height: "calc(100vh - var(--topbar-height))"
      }}>
        <div className="text-muted" style={{ fontSize: "var(--font-size-lg)" }}>
          Loading meeting data...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "var(--spacing-xl)"
    }}>
      <div className="container">
        <div style={{
          display: "grid",
          gap: "var(--spacing-xl)"
        }}>
          {/* Current Agenda Item + Timer Section */}
          <div className="card">
            <div className="cardHeader">
              <h2 className="cardTitle">Current Agenda Item</h2>
            </div>
            <div className="cardBody">
              {state.activeAgendaId ? (() => {
                const activeItem = state.agenda.find(item => item.id === state.activeAgendaId);
                return activeItem ? (
                  <div>
                    <div className="listItem active mb-lg">
                      <div style={{ 
                        fontSize: "var(--font-size-xl)", 
                        fontWeight: "var(--font-weight-bold)",
                        marginBottom: "var(--spacing-sm)"
                      }}>
                        {activeItem.title}
                      </div>
                      {activeItem.notes && (
                        <div className="text-muted mt-sm" style={{ fontStyle: "italic" }}>
                          {activeItem.notes}
                        </div>
                      )}
                      <div className="pill pill-accent mt-sm">
                        Duration: {formatTime(activeItem.durationSec)}
                      </div>
                    </div>
                    
                    {/* Timer Display */}
                    <div className="card-elevated text-center" style={{
                      padding: "var(--spacing-2xl)",
                      border: `3px solid ${state.timer.running ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: state.timer.running ? "rgba(11, 95, 152, 0.1)" : "var(--color-surface)"
                    }}>
                      <div className={`mb-sm ${state.timer.running && localTimer < 10 ? 'text-danger' : ''}`} style={{ 
                        fontSize: "var(--font-size-3xl)", 
                        fontWeight: "var(--font-weight-bold)", 
                        fontFamily: "var(--font-family-mono)"
                      }}>
                        {formatTime(localTimer)}
                      </div>
                      <div className="text-muted" style={{ 
                        fontSize: "var(--font-size-lg)", 
                        fontWeight: "var(--font-weight-medium)"
                      }}>
                        {state.timer.running ? '▶️ Running' : 
                         state.timer.pausedRemainingSec !== null ? '⏸ Paused' : 
                         '⏹ Stopped'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted" style={{ 
                    padding: "var(--spacing-2xl)"
                  }}>
                    No active agenda item
                  </div>
                );
              })() : (
                <div className="text-center text-muted" style={{ 
                  padding: "var(--spacing-2xl)"
                }}>
                  No agenda item selected. {isHost && !viewAsAttendee && "Use host controls to set an active item."}
                </div>
              )}
            </div>
          </div>

          {/* Agenda List */}
          <div className="card">
            <div className="cardHeader">
              <h3 className="cardTitle">Full Agenda ({state.agenda.length} items)</h3>
            </div>
            <div className="cardBody">
              {state.agenda.length === 0 ? (
                <div className="text-center text-muted" style={{ 
                  padding: "var(--spacing-lg)",
                  fontStyle: "italic"
                }}>
                  No agenda items yet. {isHost && !viewAsAttendee && "Add items using the host controls."}
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {state.agenda.map((item, index) => (
                    <li 
                      key={item.id} 
                      className={`listItem ${state.activeAgendaId === item.id ? 'active' : ''} mb-md`}
                    >
                      <div className="flex gap-lg" style={{ alignItems: "flex-start" }}>
                        <div style={{
                          minWidth: "30px",
                          height: "30px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: state.activeAgendaId === item.id ? "var(--color-accent)" : "rgba(252, 252, 252, 0.3)",
                          color: state.activeAgendaId === item.id ? "var(--color-bg)" : "var(--color-text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "var(--font-weight-bold)",
                          fontSize: "var(--font-size-sm)"
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontWeight: "var(--font-weight-bold)", 
                            fontSize: "var(--font-size-lg)",
                            marginBottom: "var(--spacing-xs)"
                          }}>
                            {item.title}
                          </div>
                          <div className="pill pill-accent mb-xs">
                            {formatTime(item.durationSec)}
                          </div>
                          {item.notes && (
                            <div className="text-muted mt-sm" style={{ 
                              fontSize: "var(--font-size-sm)", 
                              fontStyle: "italic"
                            }}>
                              {item.notes}
                            </div>
                          )}
                          {state.activeAgendaId === item.id && (
                            <div className="pill pill-accent mt-sm">
                              ⭐ ACTIVE NOW
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Attendance Section */}
          <div className="card">
            <div className="cardHeader">
              <h3 className="cardTitle">Attendance ({Object.keys(state.attendance || {}).length})</h3>
            </div>
            <div className="cardBody">
              <div className="grid3">
                {Object.values(state.attendance || {}).map((att) => (
                  <div key={att.userId} className="pill pill-neutral">
                    {att.displayName || att.userId}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Voting Section */}
          {state.vote.open && (
            <div className="card" style={{ borderColor: "var(--color-warning)", borderWidth: "2px" }}>
              <div className="cardHeader" style={{ background: "rgba(255, 193, 7, 0.1)" }}>
                <h3 className="cardTitle">🗳️ Active Vote</h3>
              </div>
              <div className="cardBody">
                <div className="mb-lg" style={{ 
                  fontSize: "var(--font-size-xl)", 
                  fontWeight: "var(--font-weight-bold)"
                }}>
                  {state.vote.question}
                </div>
                
                <div className="mb-lg">
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
                        className={`listItem mb-md ${votedForThis ? 'active' : ''}`}
                        style={{ 
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          backgroundColor: votedForThis ? "rgba(40, 167, 69, 0.1)" : undefined,
                          borderColor: votedForThis ? "var(--color-success)" : undefined
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: "var(--font-size-lg)",
                            fontWeight: "var(--font-weight-medium)",
                            marginBottom: "var(--spacing-xs)"
                          }}>
                            {optionLabel}
                          </div>
                          <div className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
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
        </div>
      </div>
    </div>
  );
}
