import React, { useState, useEffect } from 'react';

// HitchQuickFire - Instant replay profitable commands during hot sessions
const HitchQuickFire = ({ ogzPrime, position = 'bottom-right' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [quickCommands, setQuickCommands] = useState([]);
  const [executing, setExecuting] = useState(null);
  const [sessionStats, setSessionStats] = useState({ profit: 0, trades: 0 });
  
  const hitchLogger = ogzPrime?.hitch?.logger;
  const hitch = ogzPrime?.hitch;

  // Load top profitable commands for quick access
  useEffect(() => {
    if (!hitchLogger) return;
    
    const loadQuickCommands = async () => {
      const history = await hitchLogger.getCommandHistory({
        startDate: Date.now() - (7 * 24 * 60 * 60 * 1000) // Last 7 days
      });
      
      // Get top 5 most profitable commands
      const profitable = history
        .filter(cmd => {
          if (!cmd.impact?.updates?.length) return false;
          const finalUpdate = cmd.impact.updates[cmd.impact.updates.length - 1];
          return finalUpdate.percentChange > 1; // Only 1%+ winners
        })
        .sort((a, b) => {
          const aProfit = a.impact.updates[a.impact.updates.length - 1].percentChange;
          const bProfit = b.impact.updates[b.impact.updates.length - 1].percentChange;
          return bProfit - aProfit;
        })
        .slice(0, 5)
        .map(cmd => ({
          id: cmd.id,
          command: cmd.input,
          profit: cmd.impact.updates[cmd.impact.updates.length - 1].percentChange,
          icon: getCommandIcon(cmd.input),
          shortName: getShortName(cmd.input)
        }));
      
      setQuickCommands(profitable);
    };
    
    loadQuickCommands();
    // Refresh every minute
    const interval = setInterval(loadQuickCommands, 60000);
    return () => clearInterval(interval);
  }, [hitchLogger]);

  // Get icon based on command type
  const getCommandIcon = (command) => {
    const lower = command.toLowerCase();
    if (lower.includes('risk')) return '⚖️';
    if (lower.includes('stop')) return '🛑';
    if (lower.includes('start')) return '▶️';
    if (lower.includes('profile')) return '👤';
    if (lower.includes('rsi') || lower.includes('macd')) return '📊';
    if (lower.includes('time') || lower.includes('after') || lower.includes('before')) return '⏰';
    return '🎯';
  };

  // Get short name for button
  const getShortName = (command) => {
    const lower = command.toLowerCase();
    if (lower.includes('risk')) return 'Risk';
    if (lower.includes('stop trading')) return 'Stop';
    if (lower.includes('start trading')) return 'Start';
    if (lower.includes('scalper')) return 'Scalper';
    if (lower.includes('conservative')) return 'Safe';
    if (lower.includes('aggressive')) return 'Aggro';
    if (lower.includes('rsi')) return 'RSI';
    // Take first two words
    return command.split(' ').slice(0, 2).join(' ');
  };

  // Execute command instantly
  const fireCommand = async (cmd) => {
    if (!hitch || executing) return;
    
    setExecuting(cmd.id);
    
    try {
      const result = await hitch.processCommand(cmd.command, {
        source: 'quickfire',
        timestamp: Date.now()
      });
      
      if (result.success) {
        // Flash success
        showToast(`🚀 ${cmd.shortName} FIRED!`, 'success');
        
        // Update session stats
        setSessionStats(prev => ({
          profit: prev.profit + (cmd.profit || 0),
          trades: prev.trades + 1
        }));
      } else {
        showToast(`❌ ${result.error}`, 'error');
      }
    } catch (error) {
      showToast(`❌ Failed: ${error.message}`, 'error');
    } finally {
      setTimeout(() => setExecuting(null), 500);
    }
  };

  // Toast notification
  const showToast = (message, type) => {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 25px;
      background: ${type === 'success' ? '#00ff00' : '#ff0000'};
      color: #000;
      font-weight: bold;
      border-radius: 5px;
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 2000);
  };

  // Position styles
  const positionStyles = {
    'bottom-right': { bottom: 20, right: 20 },
    'bottom-left': { bottom: 20, left: 20 },
    'top-right': { top: 20, right: 20 },
    'top-left': { top: 20, left: 20 }
  };

  const containerStyle = {
    position: 'fixed',
    ...positionStyles[position],
    zIndex: 9999,
    fontFamily: 'Consolas, Monaco, monospace'
  };

  const mainButtonStyle = {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: isExpanded ? '#00ff00' : '#000',
    border: '3px solid #00ff00',
    color: isExpanded ? '#000' : '#00ff00',
    fontSize: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(0, 255, 0, 0.5)',
    transition: 'all 0.3s ease',
    position: 'relative'
  };

  const panelStyle = {
    position: 'absolute',
    bottom: '70px',
    right: '0',
    background: '#000',
    border: '2px solid #00ff00',
    borderRadius: '10px',
    padding: '15px',
    minWidth: '250px',
    boxShadow: '0 0 30px rgba(0, 255, 0, 0.3)',
    display: isExpanded ? 'block' : 'none'
  };

  const commandButtonStyle = (isExecuting) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 15px',
    margin: '5px 0',
    background: isExecuting ? '#00ff00' : 'transparent',
    border: '1px solid #00ff00',
    color: isExecuting ? '#000' : '#00ff00',
    borderRadius: '5px',
    cursor: isExecuting ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    fontSize: '14px',
    fontWeight: 'bold'
  });

  const statsStyle = {
    borderTop: '1px solid #00ff00',
    marginTop: '10px',
    paddingTop: '10px',
    fontSize: '12px',
    color: '#00ff00',
    textAlign: 'center'
  };

  if (!hitch) return null;

  return (
    <div style={containerStyle}>
      <div style={panelStyle}>
        <h4 style={{ margin: '0 0 15px 0', color: '#00ff00', textAlign: 'center' }}>
          ⚡ QUICKFIRE COMMANDS
        </h4>
        
        {quickCommands.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
            No profitable commands yet.
            Execute some Hitch commands first!
          </div>
        ) : (
          quickCommands.map(cmd => (
            <button
              key={cmd.id}
              style={commandButtonStyle(executing === cmd.id)}
              onClick={() => fireCommand(cmd)}
              disabled={executing === cmd.id}
              onMouseEnter={(e) => {
                if (executing !== cmd.id) {
                  e.currentTarget.style.background = '#003300';
                  e.currentTarget.style.transform = 'translateX(-5px)';
                }
              }}
              onMouseLeave={(e) => {
                if (executing !== cmd.id) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.transform = 'translateX(0)';
                }
              }}
              title={cmd.command}
            >
              <span>{cmd.icon} {cmd.shortName}</span>
              <span style={{ color: '#ffff00' }}>+{cmd.profit.toFixed(1)}%</span>
            </button>
          ))
        )}
        
        <div style={statsStyle}>
          SESSION: {sessionStats.trades} fires
          {sessionStats.profit > 0 && ` • +${sessionStats.profit.toFixed(1)}%`}
        </div>
      </div>
      
      <button
        style={mainButtonStyle}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {isExpanded ? '✖' : '⚡'}
      </button>
      
      {/* Pulse animation when collapsed */}
      {!isExpanded && quickCommands.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            border: '2px solid #00ff00',
            pointerEvents: 'none',
            animation: 'pulse 2s infinite'
          }}
        />
      )}
      
      <style>
        {`
          @keyframes pulse {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
          }
          
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideOut {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  );
};

export default HitchQuickFire;
