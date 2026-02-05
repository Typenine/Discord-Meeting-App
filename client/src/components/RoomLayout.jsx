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
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "calc(100vh - var(--topbar-height))",
        fontSize: "var(--font-size-lg)",
        color: "var(--color-muted)"
      }}>
        Loading meeting data...
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "var(--spacing-xl)",
      backgroundColor: "var(--color-background)"
    }}>
      {/* Main Content Grid */}
      <div style={{
        display: "grid",
        gap: "var(--spacing-xl)",
        maxWidth: "var(--max-width-container)",
        margin: "0 auto"
      }}>
        {/* Current Agenda Item + Timer Section */}
        <div className="card">
          <div className="cardHeader">
            <h2>Current Agenda Item</h2>
          </div>
          <div className="cardBody">
            {state.activeAgendaId ? (() => {
              const activeItem = state.agenda.find(item => item.id === state.activeAgendaId);
              return activeItem ? (
                <div>
                  <div style={{
                    padding: "var(--spacing-lg)",
                    backgroundColor: "#fffbf0",
                    border: `2px solid var(--color-accent)`,
                    borderRadius: "var(--radius-md)",
                    marginBottom: "var(--spacing-lg)"
                  }}>
                    <div style={{ 
                      fontSize: "var(--font-size-xl)", 
                      fontWeight: "bold",
                      marginBottom: "var(--spacing-sm)",
                      color: "var(--color-text)"
                    }}>
                      {activeItem.title}
                    </div>
                    {activeItem.notes && (
                      <div style={{ 
                        fontSize: "var(--font-size-base)", 
                        color: "var(--color-muted)",
                        fontStyle: "italic",
                        marginTop: "var(--spacing-sm)"
                      }}>
                        {activeItem.notes}
                      </div>
                    )}
                    <div className="badge badgeGold" style={{ marginTop: "var(--spacing-sm)" }}>
                      Duration: {formatTime(activeItem.durationSec)}
                    </div>
                  </div>
                  
                  {/* Timer Display */}
                  <div style={{
                    padding: "var(--spacing-2xl)",
                    backgroundColor: state.timer.running ? "#e7f3ff" : "var(--color-surface)",
                    border: `3px solid ${state.timer.running ? "var(--color-primary)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius-lg)",
                    textAlign: "center"
                  }}>
                    <div style={{ 
                      fontSize: "var(--font-size-3xl)", 
                      fontWeight: "bold", 
                      fontFamily: "monospace",
                      color: state.timer.running && localTimer < 10 ? "var(--color-destructive)" : "var(--color-text)",
                      marginBottom: "var(--spacing-sm)"
                    }}>
                      {formatTime(localTimer)}
                    </div>
                    <div style={{ 
                      fontSize: "var(--font-size-lg)", 
                      color: "var(--color-muted)",
                      fontWeight: "500"
                    }}>
                      {state.timer.running ? '▶️ Running' : 
                       state.timer.pausedRemainingSec !== null ? '⏸ Paused' : 
                       '⏹ Stopped'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ 
                  padding: "var(--spacing-2xl)", 
                  textAlign: "center", 
                  color: "var(--color-muted)",
                  backgroundColor: "var(--color-surface)",
                  border: `1px solid var(--color-border)`,
                  borderRadius: "var(--radius-md)"
                }}>
                  No active agenda item
                </div>
              );
            })() : (
              <div style={{ 
                padding: "var(--spacing-2xl)", 
                textAlign: "center", 
                color: "var(--color-muted)",
                backgroundColor: "var(--color-surface)",
                border: `1px solid var(--color-border)`,
                borderRadius: "var(--radius-md)"
              }}>
                No agenda item selected. {isHost && !viewAsAttendee && "Use host controls to set an active item."}
              </div>
            )}
          </div>
        </div>

        {/* Agenda List */}
        <div className="card">
          <div className="cardHeader">
            <h3>Full Agenda ({state.agenda.length} items)</h3>
          </div>
          <div className="cardBody">
            {state.agenda.length === 0 ? (
              <div style={{ 
                padding: "var(--spacing-lg)", 
                textAlign: "center", 
                color: "var(--color-muted)",
                fontStyle: "italic"
              }}>
                No agenda items yet. {isHost && !viewAsAttendee && "Add items using the host controls."}
              </div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {state.agenda.map((item, index) => (
                  <li 
                    key={item.id} 
                    className={`listItem ${state.activeAgendaId === item.id ? 'active' : ''}`}
                    style={{ marginBottom: "var(--spacing-md)" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-lg)" }}>
                      <div style={{
                        minWidth: "30px",
                        height: "30px",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: state.activeAgendaId === item.id ? "var(--color-accent)" : "var(--color-muted)",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        fontSize: "var(--font-size-sm)"
                      }}>
                        {index + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontWeight: "bold", 
                          fontSize: "var(--font-size-lg)",
                          marginBottom: "var(--spacing-xs)",
                          color: "var(--color-text)"
                        }}>
                          {item.title}
                        </div>
                        <div className="badge badgeGold" style={{ marginBottom: "var(--spacing-xs)" }}>
                          {formatTime(item.durationSec)}
                        </div>
                        {item.notes && (
                          <div style={{ 
                            fontSize: "var(--font-size-sm)", 
                            color: "var(--color-muted)",
                            fontStyle: "italic",
                            marginTop: "var(--spacing-sm)"
                          }}>
                            {item.notes}
                          </div>
                        )}
                        {state.activeAgendaId === item.id && (
                          <div className="badge badgeGold" style={{ marginTop: "var(--spacing-sm)" }}>
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
            <h3>Attendance ({Object.keys(state.attendance || {}).length})</h3>
          </div>
          <div className="cardBody">
            <ul style={{ 
              listStyle: "none", 
              padding: 0, 
              margin: 0,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "var(--spacing-md)"
            }}>
              {Object.values(state.attendance || {}).map((att) => (
                <li key={att.userId} className="attendanceChip">
                  <div style={{ 
                    fontSize: "var(--font-size-base)",
                    fontWeight: "500",
                    color: "var(--color-text)"
                  }}>
                    {att.displayName || att.userId}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Voting Section */}
        {state.vote.open && (
          <div className="card" style={{ border: `2px solid var(--color-warning)` }}>
            <div className="cardHeader" style={{ backgroundColor: "#fffbf0" }}>
              <h3>🗳️ Active Vote</h3>
            </div>
            <div className="cardBody">
              <div style={{ 
                fontSize: "var(--font-size-xl)", 
                fontWeight: "bold",
                marginBottom: "var(--spacing-lg)",
                color: "var(--color-text)"
              }}>
                {state.vote.question}
              </div>
              
              <div style={{ marginBottom: "var(--spacing-lg)" }}>
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
                      className="listItem"
                      style={{ 
                        marginBottom: "var(--spacing-md)",
                        backgroundColor: votedForThis ? "#d4edda" : "var(--color-surface)",
                        border: `2px solid ${votedForThis ? "var(--color-success)" : "var(--color-border)"}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: "var(--font-size-lg)",
                          fontWeight: "500",
                          marginBottom: "var(--spacing-xs)",
                          color: "var(--color-text)"
                        }}>
                          {optionLabel}
                        </div>
                        <div style={{ 
                          fontSize: "var(--font-size-sm)", 
                          color: "var(--color-muted)"
                        }}>
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
              
              <div style={{ 
                fontSize: "var(--font-size-base)", 
                color: "var(--color-muted)",
                textAlign: "center",
                fontWeight: "500"
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
              fontWeight: "bold",
              fontSize: "var(--font-size-lg)",
              color: "var(--color-text)",
              padding: "var(--spacing-lg)"
            }}>
              📊 Past Votes ({state.vote.closedResults.length})
            </summary>
            <div style={{ padding: "0 var(--spacing-lg) var(--spacing-lg)" }}>
              {state.vote.closedResults.map((result, idx) => (
                <div key={idx} className="listItem" style={{ marginBottom: "var(--spacing-lg)" }}>
                  <div style={{ 
                    fontWeight: "bold",
                    fontSize: "var(--font-size-lg)",
                    marginBottom: "var(--spacing-md)",
                    color: "var(--color-text)"
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
                        <li key={optionId} style={{ 
                          marginBottom: "var(--spacing-sm)",
                          padding: "var(--spacing-sm)",
                          backgroundColor: "var(--color-muted-bg)",
                          borderRadius: "var(--radius-sm)"
                        }}>
                          <div style={{ 
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}>
                            <span style={{ fontWeight: "500" }}>{optionLabel}:</span>
                            <span style={{ color: "var(--color-muted)" }}>
                              {voteCount} vote{voteCount !== 1 ? 's' : ''} ({percentage}%)
                            </span>
                          </div>
                          <div style={{
                            marginTop: "var(--spacing-xs)",
                            height: "6px",
                            backgroundColor: "var(--color-border)",
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
                  <div style={{ 
                    fontSize: "var(--font-size-sm)", 
                    color: "var(--color-muted)",
                    marginTop: "var(--spacing-sm)",
                    fontWeight: "500"
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
  );
}
