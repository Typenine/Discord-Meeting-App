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
        height: "calc(100vh - 90px)",
        fontSize: "1.2rem",
        color: "#666"
      }}>
        Loading meeting data...
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "1.5rem",
      backgroundColor: "#ffffff"
    }}>
      {/* Main Content Grid */}
      <div style={{
        display: "grid",
        gap: "1.5rem",
        maxWidth: "1200px",
        margin: "0 auto"
      }}>
        {/* Current Agenda Item + Timer Section */}
        <div style={{
          backgroundColor: "#f8f9fa",
          border: "2px solid #dee2e6",
          borderRadius: "8px",
          padding: "1.5rem"
        }}>
          <h2 style={{ 
            marginTop: 0, 
            marginBottom: "1rem",
            color: "#333",
            fontSize: "1.5rem"
          }}>
            Current Agenda Item
          </h2>
          
          {state.activeAgendaId ? (() => {
            const activeItem = state.agenda.find(item => item.id === state.activeAgendaId);
            return activeItem ? (
              <div>
                <div style={{
                  padding: "1rem",
                  backgroundColor: "#fff3cd",
                  border: "2px solid #ffc107",
                  borderRadius: "6px",
                  marginBottom: "1rem"
                }}>
                  <div style={{ 
                    fontSize: "1.3rem", 
                    fontWeight: "bold",
                    marginBottom: "0.5rem",
                    color: "#333"
                  }}>
                    {activeItem.title}
                  </div>
                  {activeItem.notes && (
                    <div style={{ 
                      fontSize: "0.95rem", 
                      color: "#666",
                      fontStyle: "italic",
                      marginTop: "0.5rem"
                    }}>
                      {activeItem.notes}
                    </div>
                  )}
                  <div style={{ 
                    fontSize: "0.9rem",
                    color: "#856404",
                    marginTop: "0.5rem",
                    fontWeight: "500"
                  }}>
                    Duration: {activeItem.durationSec} seconds
                  </div>
                </div>
                
                {/* Timer Display */}
                <div style={{
                  padding: "2rem",
                  backgroundColor: state.timer.running ? "#d1ecf1" : "#ffffff",
                  border: `3px solid ${state.timer.running ? "#0c5460" : "#dee2e6"}`,
                  borderRadius: "8px",
                  textAlign: "center"
                }}>
                  <div style={{ 
                    fontSize: "4rem", 
                    fontWeight: "bold", 
                    fontFamily: "monospace",
                    color: state.timer.running && localTimer < 10 ? "#dc3545" : "#333",
                    marginBottom: "0.5rem"
                  }}>
                    {formatTime(localTimer)}
                  </div>
                  <div style={{ 
                    fontSize: "1.1rem", 
                    color: "#666",
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
                padding: "2rem", 
                textAlign: "center", 
                color: "#666",
                backgroundColor: "#ffffff",
                border: "1px solid #dee2e6",
                borderRadius: "6px"
              }}>
                No active agenda item
              </div>
            );
          })() : (
            <div style={{ 
              padding: "2rem", 
              textAlign: "center", 
              color: "#666",
              backgroundColor: "#ffffff",
              border: "1px solid #dee2e6",
              borderRadius: "6px"
            }}>
              No agenda item selected. {isHost && !viewAsAttendee && "Use host controls to set an active item."}
            </div>
          )}
        </div>

        {/* Agenda List */}
        <div style={{
          backgroundColor: "#f8f9fa",
          border: "1px solid #dee2e6",
          borderRadius: "8px",
          padding: "1.5rem"
        }}>
          <h3 style={{ 
            marginTop: 0, 
            marginBottom: "1rem",
            color: "#333"
          }}>
            Full Agenda ({state.agenda.length} items)
          </h3>
          
          {state.agenda.length === 0 ? (
            <div style={{ 
              padding: "1rem", 
              textAlign: "center", 
              color: "#666",
              fontStyle: "italic"
            }}>
              No agenda items yet. {isHost && !viewAsAttendee && "Add items using the host controls."}
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {state.agenda.map((item, index) => (
                <li key={item.id} style={{ 
                  marginBottom: "0.75rem",
                  padding: "1rem",
                  backgroundColor: state.activeAgendaId === item.id ? "#fff3cd" : "#ffffff",
                  border: `2px solid ${state.activeAgendaId === item.id ? "#ffc107" : "#dee2e6"}`,
                  borderRadius: "6px"
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{
                      minWidth: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      backgroundColor: state.activeAgendaId === item.id ? "#ffc107" : "#6c757d",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "0.9rem"
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: "bold", 
                        fontSize: "1.1rem",
                        marginBottom: "0.25rem",
                        color: "#333"
                      }}>
                        {item.title}
                      </div>
                      <div style={{ 
                        fontSize: "0.9rem",
                        color: "#666",
                        marginBottom: "0.25rem"
                      }}>
                        Duration: {item.durationSec} seconds
                      </div>
                      {item.notes && (
                        <div style={{ 
                          fontSize: "0.9rem", 
                          color: "#666",
                          fontStyle: "italic",
                          marginTop: "0.5rem"
                        }}>
                          {item.notes}
                        </div>
                      )}
                      {state.activeAgendaId === item.id && (
                        <div style={{
                          marginTop: "0.5rem",
                          padding: "0.25rem 0.75rem",
                          backgroundColor: "#ffc107",
                          borderRadius: "20px",
                          display: "inline-block",
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          color: "#000"
                        }}>
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

        {/* Attendance Section */}
        <div style={{
          backgroundColor: "#f8f9fa",
          border: "1px solid #dee2e6",
          borderRadius: "8px",
          padding: "1.5rem"
        }}>
          <h3 style={{ 
            marginTop: 0, 
            marginBottom: "1rem",
            color: "#333"
          }}>
            Attendance ({Object.keys(state.attendance || {}).length})
          </h3>
          
          <ul style={{ 
            listStyle: "none", 
            padding: 0, 
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem"
          }}>
            {Object.values(state.attendance || {}).map((att) => (
              <li key={att.userId} style={{
                padding: "0.75rem",
                backgroundColor: "#ffffff",
                border: "1px solid #dee2e6",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#28a745",
                  flexShrink: 0
                }} />
                <div style={{ 
                  fontSize: "0.95rem",
                  fontWeight: "500",
                  color: "#333"
                }}>
                  {att.displayName || att.userId}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Voting Section */}
        {state.vote.open && (
          <div style={{
            backgroundColor: "#fff3cd",
            border: "2px solid #ffc107",
            borderRadius: "8px",
            padding: "1.5rem"
          }}>
            <h3 style={{ 
              marginTop: 0, 
              marginBottom: "1rem",
              color: "#333"
            }}>
              🗳️ Active Vote
            </h3>
            
            <div style={{ 
              fontSize: "1.2rem", 
              fontWeight: "bold",
              marginBottom: "1rem",
              color: "#333"
            }}>
              {state.vote.question}
            </div>
            
            <div style={{ marginBottom: "1rem" }}>
              {state.vote.options.map((opt) => {
                const optionId = opt.id || opt;
                const optionLabel = opt.label || opt;
                const voteCount = state.vote.votesByClientId 
                  ? Object.values(state.vote.votesByClientId).filter(v => v === optionId).length 
                  : 0;
                const hasVoted = state.vote.votesByClientId?.[clientId] !== undefined;
                const votedForThis = state.vote.votesByClientId?.[clientId] === optionId;
                
                return (
                  <div key={optionId} style={{ 
                    marginBottom: "0.75rem",
                    padding: "1rem",
                    backgroundColor: votedForThis ? "#d4edda" : "#ffffff",
                    border: `2px solid ${votedForThis ? "#28a745" : "#dee2e6"}`,
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: "1.1rem",
                        fontWeight: "500",
                        marginBottom: "0.25rem",
                        color: "#333"
                      }}>
                        {optionLabel}
                      </div>
                      <div style={{ 
                        fontSize: "0.9rem", 
                        color: "#666"
                      }}>
                        {voteCount} vote{voteCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {!isHost && (
                      <button
                        onClick={() => onCastVote(optionId)}
                        disabled={hasVoted}
                        style={{
                          padding: "0.5rem 1.5rem",
                          backgroundColor: votedForThis ? "#28a745" : "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: hasVoted ? "not-allowed" : "pointer",
                          opacity: hasVoted ? 0.6 : 1,
                          fontSize: "1rem",
                          fontWeight: "bold"
                        }}
                      >
                        {votedForThis ? "✓ Voted" : "Vote"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div style={{ 
              fontSize: "0.95rem", 
              color: "#856404",
              textAlign: "center",
              fontWeight: "500"
            }}>
              Total votes cast: {Object.keys(state.vote.votesByClientId || {}).length}
            </div>
          </div>
        )}

        {/* Past Votes */}
        {state.vote.closedResults && state.vote.closedResults.length > 0 && (
          <details style={{
            backgroundColor: "#f8f9fa",
            border: "1px solid #dee2e6",
            borderRadius: "8px",
            padding: "1rem"
          }}>
            <summary style={{ 
              cursor: "pointer", 
              fontWeight: "bold",
              fontSize: "1.1rem",
              color: "#333",
              marginBottom: "1rem"
            }}>
              📊 Past Votes ({state.vote.closedResults.length})
            </summary>
            <div style={{ marginTop: "1rem" }}>
              {state.vote.closedResults.map((result, idx) => (
                <div key={idx} style={{ 
                  marginBottom: "1rem",
                  padding: "1rem",
                  backgroundColor: "#ffffff",
                  border: "1px solid #dee2e6",
                  borderRadius: "6px"
                }}>
                  <div style={{ 
                    fontWeight: "bold",
                    fontSize: "1.05rem",
                    marginBottom: "0.75rem",
                    color: "#333"
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
                          marginBottom: "0.5rem",
                          padding: "0.5rem",
                          backgroundColor: "#f8f9fa",
                          borderRadius: "4px"
                        }}>
                          <div style={{ 
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}>
                            <span style={{ fontWeight: "500" }}>{optionLabel}:</span>
                            <span style={{ color: "#666" }}>
                              {voteCount} vote{voteCount !== 1 ? 's' : ''} ({percentage}%)
                            </span>
                          </div>
                          <div style={{
                            marginTop: "0.25rem",
                            height: "6px",
                            backgroundColor: "#dee2e6",
                            borderRadius: "3px",
                            overflow: "hidden"
                          }}>
                            <div style={{
                              width: `${percentage}%`,
                              height: "100%",
                              backgroundColor: "#007bff",
                              transition: "width 0.3s ease"
                            }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div style={{ 
                    fontSize: "0.9rem", 
                    color: "#666",
                    marginTop: "0.5rem",
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
