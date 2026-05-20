import React, { useState, useEffect, useMemo } from 'react';
// Import from the actual Hitch integration
// Adjust path based on your file structure
import { HitchLogger, HitchPlay } from '../core/HitchNLP';

// Create instances or get from OGZPrime instance
const hitchLogger = new HitchLogger();
const getCommandHistory = (filter) => hitchLogger.getCommandHistory(filter);

// HitchPlay instance should come from your OGZPrime instance
// const hitchplay = ogzPrime.hitchplay;

const TopHitchCommands = ({ ogzPrime, refreshInterval = 60000 }) => {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('weekly'); // daily, weekly, all-time
  const [replayingId, setReplayingId] = useState(null);

  // Get Hitch instances from OGZPrime
  const hitchplay = ogzPrime?.hitchplay;

  // Fetch and process command history
  const fetchTopCommands = async () => {
    if (!hitchLogger) {
      console.error('HitchLogger not available');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Get filter dates for the query
      const now = new Date();
      const filterOptions = {};
      
      if (filter === 'daily') {
        filterOptions.startDate = now.getTime() - (24 * 60 * 60 * 1000);
      } else if (filter === 'weekly') {
        filterOptions.startDate = now.getTime() - (7 * 24 * 60 * 60 * 1000);
      }
      
      const history = await hitchLogger.getCommandHistory(filterOptions);
      
      // Get cutoff date based on filter
      const cutoffDate = new Date();
      if (filter === 'daily') {
        cutoffDate.setDate(now.getDate() - 1);
      } else if (filter === 'weekly') {
        cutoffDate.setDate(now.getDate() - 7);
      } else {
        cutoffDate.setFullYear(2020); // all-time
      }

      // Filter and process commands
      const processedCommands = history
        .filter(cmd => {
          const cmdDate = new Date(cmd.timestamp);
          // Must have impact data with updates array
          return cmdDate >= cutoffDate && 
                 cmd.impact?.updates && 
                 cmd.impact.updates.length > 0;
        })
        .map(cmd => {
          // Get the final impact from the last update
          const finalUpdate = cmd.impact.updates[cmd.impact.updates.length - 1];
          
          return {
            id: cmd.id,
            text: cmd.input, // Changed from cmd.command to cmd.input
            percentChange: finalUpdate.percentChange || 0,
            tradesExecuted: finalUpdate.tradesExecuted || 0,
            timestamp: cmd.timestamp,
            // Sum all trades across all updates
            totalTrades: cmd.impact.updates.reduce((sum, update) => 
              sum + (update.tradesExecuted || 0), 0)
          };
        })
        .filter(cmd => cmd.percentChange !== 0) // Only show commands with impact
        .sort((a, b) => b.percentChange - a.percentChange)
        .slice(0, 10);

      setCommands(processedCommands);
    } catch (error) {
      console.error('Failed to fetch command history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh
  useEffect(() => {
    if (hitchLogger) {
      fetchTopCommands();
      const interval = setInterval(fetchTopCommands, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [filter, refreshInterval, hitchLogger]);

  // Replay command handler
  const handleReplay = async (commandId) => {
    if (!hitchplay) {
      console.error('HitchPlay not available');
      return;
    }
    
    setReplayingId(commandId);
    try {
      await hitchplay.replayCommand(commandId);
      // Flash success indicator
      setTimeout(() => setReplayingId(null), 2000);
    } catch (error) {
      console.error('Replay failed:', error);
      setReplayingId(null);
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) {
      const diffMins = Math.floor((now - date) / (1000 * 60));
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }
  };

  // Styles
  const containerStyle = {
    backgroundColor: '#000',
    color: '#00ff00',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #00ff00',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)',
    minHeight: '400px'
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid #00ff00',
    paddingBottom: '10px'
  };

  const filterButtonStyle = (active) => ({
    backgroundColor: active ? '#00ff00' : 'transparent',
    color: active ? '#000' : '#00ff00',
    border: '1px solid #00ff00',
    padding: '5px 15px',
    marginLeft: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '14px',
    transition: 'all 0.3s',
    textTransform: 'uppercase'
  });

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse'
  };

  const rowStyle = {
    borderBottom: '1px solid #003300',
    transition: 'all 0.3s'
  };

  const replayButtonStyle = (isReplaying) => ({
    backgroundColor: isReplaying ? '#ffff00' : 'transparent',
    color: isReplaying ? '#000' : '#00ff00',
    border: '1px solid #00ff00',
    padding: '4px 12px',
    cursor: isReplaying ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
    transition: 'all 0.3s'
  });

  // Check if Hitch is integrated
  if (!hitchLogger || !hitchplay) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: '50px', color: '#ff0000' }}>
          <h3>⚠️ HITCH NOT INTEGRATED</h3>
          <p style={{ color: '#888', marginTop: '20px' }}>
            Please ensure OGZPrime has Hitch integrated and pass the ogzPrime instance as a prop.
          </p>
          <pre style={{ color: '#00ff00', marginTop: '20px', fontSize: '12px' }}>
            {`<TopHitchCommands ogzPrime={ogzPrimeInstance} />`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, textShadow: '0 0 10px #00ff00' }}>
          🏆 TOP HITCH COMMANDS
        </h2>
        <div>
          {['daily', 'weekly', 'all-time'].map(f => (
            <button
              key={f}
              style={filterButtonStyle(filter === f)}
              onClick={() => setFilter(f)}
              onMouseEnter={(e) => {
                if (filter !== f) {
                  e.target.style.backgroundColor = '#003300';
                }
              }}
              onMouseLeave={(e) => {
                if (filter !== f) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <div style={{ fontSize: '24px', animation: 'pulse 1s infinite' }}>
            SCANNING PROFIT MATRIX...
          </div>
        </div>
      ) : commands.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
          NO COMMANDS FOUND FOR {filter.toUpperCase()} PERIOD
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr style={{ color: '#00ff00', textAlign: 'left' }}>
              <th style={{ padding: '10px', width: '5%' }}>#</th>
              <th style={{ padding: '10px', width: '40%' }}>COMMAND</th>
              <th style={{ padding: '10px', width: '15%' }}>% CHANGE</th>
              <th style={{ padding: '10px', width: '15%' }}>TRADES</th>
              <th style={{ padding: '10px', width: '15%' }}>TIME</th>
              <th style={{ padding: '10px', width: '10%' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {commands.map((cmd, index) => (
              <tr 
                key={cmd.id} 
                style={rowStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#001100';
                  e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <td style={{ padding: '10px', color: '#ffff00' }}>
                  {index + 1}
                </td>
                <td style={{ 
                  padding: '10px', 
                  maxWidth: '300px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {cmd.text}
                </td>
                <td style={{ 
                  padding: '10px',
                  color: cmd.percentChange >= 0 ? '#00ff00' : '#ff0000',
                  fontWeight: 'bold',
                  textShadow: cmd.percentChange >= 5 ? '0 0 5px currentColor' : 'none'
                }}>
                  {cmd.percentChange >= 0 ? '+' : ''}{cmd.percentChange.toFixed(2)}%
                </td>
                <td style={{ padding: '10px' }}>
                  {cmd.totalTrades}
                </td>
                <td style={{ padding: '10px', color: '#888' }}>
                  {formatTime(cmd.timestamp)}
                </td>
                <td style={{ padding: '10px' }}>
                  <button
                    style={replayButtonStyle(replayingId === cmd.id)}
                    onClick={() => handleReplay(cmd.id)}
                    disabled={replayingId === cmd.id}
                    onMouseEnter={(e) => {
                      if (replayingId !== cmd.id) {
                        e.target.style.backgroundColor = '#00ff00';
                        e.target.style.color = '#000';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (replayingId !== cmd.id) {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#00ff00';
                      }
                    }}
                  >
                    {replayingId === cmd.id ? 'REPLAYING...' : 'REPLAY'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style>
        {`
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

export default TopHitchCommands;
