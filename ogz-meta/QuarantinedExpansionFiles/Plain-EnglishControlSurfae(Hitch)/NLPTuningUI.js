import React, { useState, useEffect } from 'react';

const NLPTuningUI = ({ ogzPrime }) => {
  const [testCommand, setTestCommand] = useState('');
  const [interpretation, setInterpretation] = useState(null);
  const [patchPreview, setPatchPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [showPatterns, setShowPatterns] = useState(false);
  const [commandPatterns, setCommandPatterns] = useState([]);
  
  const hitch = ogzPrime?.hitch;

  // Load command patterns
  useEffect(() => {
    if (!hitch) return;
    
    // Get patterns from Hitch
    const patterns = Array.from(hitch.commandPatterns || []).map(([pattern, handler]) => ({
      pattern: pattern.toString(),
      example: getExampleForPattern(pattern)
    }));
    
    setCommandPatterns(patterns);
  }, [hitch]);

  // Get example command for pattern
  const getExampleForPattern = (pattern) => {
    const patternStr = pattern.toString();
    if (patternStr.includes('rsi')) return "Only trade when RSI is below 30";
    if (patternStr.includes('risk')) return "Set risk to 1%";
    if (patternStr.includes('stop')) return "Stop trading";
    if (patternStr.includes('profile')) return "Activate scalper profile";
    if (patternStr.includes('avoid')) return "Avoid trades after 3pm";
    return "Sample command";
  };

  // Test command interpretation
  const testInterpretation = async () => {
    if (!hitch || !testCommand) return;
    
    try {
      // Get interpretation without executing
      const result = await hitch.interpretCommand(testCommand);
      setInterpretation(result);
      
      // Generate updates preview
      const updates = await hitch.generateUpdates(result);
      setPatchPreview(updates);
      
      // Add to history
      setHistory(prev => [{
        command: testCommand,
        interpretation: result,
        updates: updates,
        timestamp: new Date()
      }, ...prev].slice(0, 10));
      
    } catch (error) {
      console.error('Interpretation error:', error);
      setInterpretation({
        error: error.message,
        confidence: 0
      });
    }
  };

  // Execute command for real
  const executeCommand = async () => {
    if (!hitch || !testCommand) return;
    
    const result = await hitch.processCommand(testCommand, {
      source: 'tuning_ui',
      test: false
    });
    
    console.log('Execution result:', result);
  };

  const containerStyle = {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'Consolas, Monaco, monospace',
    color: '#00ff00',
    background: '#000'
  };

  const sectionStyle = {
    background: '#111',
    border: '2px solid #00ff00',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '20px'
  };

  const inputStyle = {
    width: '100%',
    padding: '15px',
    background: '#000',
    border: '2px solid #00ff00',
    color: '#00ff00',
    fontSize: '16px',
    fontFamily: 'inherit',
    borderRadius: '5px',
    marginBottom: '10px'
  };

  const buttonStyle = (variant = 'primary') => ({
    padding: '10px 20px',
    margin: '5px',
    background: variant === 'primary' ? '#00ff00' : 'transparent',
    color: variant === 'primary' ? '#000' : '#00ff00',
    border: `2px solid #00ff00`,
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
    transition: 'all 0.3s'
  });

  const codeBlockStyle = {
    background: '#000',
    padding: '15px',
    borderRadius: '5px',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '12px',
    overflowX: 'auto'
  };

  if (!hitch) {
    return (
      <div style={containerStyle}>
        <div style={sectionStyle}>
          <h2>⚠️ Hitch not available</h2>
          <p>Please ensure Hitch is integrated into OGZPrime.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px', fontSize: '36px' }}>
        🔧 NLP TUNING INTERFACE
      </h1>

      {/* Command Testing */}
      <div style={sectionStyle}>
        <h2 style={{ marginBottom: '15px' }}>📝 Test Command Interpretation</h2>
        
        <input
          type="text"
          value={testCommand}
          onChange={(e) => setTestCommand(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && testInterpretation()}
          placeholder="Enter a natural language command..."
          style={inputStyle}
        />
        
        <div style={{ marginBottom: '20px' }}>
          <button onClick={testInterpretation} style={buttonStyle('primary')}>
            🧪 Test Interpretation
          </button>
          <button onClick={executeCommand} style={buttonStyle('secondary')}>
            ⚡ Execute Live
          </button>
          <button onClick={() => setShowPatterns(!showPatterns)} style={buttonStyle('secondary')}>
            📋 {showPatterns ? 'Hide' : 'Show'} Patterns
          </button>
        </div>

        {/* Quick Examples */}
        <div style={{ marginBottom: '20px' }}>
          <strong>Try these:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '10px' }}>
            {[
              "only trade when RSI below 30",
              "set risk to 1%",
              "stop trading after 3pm",
              "activate scalper profile",
              "avoid high volatility"
            ].map(cmd => (
              <button
                key={cmd}
                onClick={() => setTestCommand(cmd)}
                style={{
                  ...buttonStyle('secondary'),
                  fontSize: '12px',
                  padding: '5px 10px'
                }}
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interpretation Result */}
      {interpretation && (
        <div style={sectionStyle}>
          <h2 style={{ marginBottom: '15px' }}>🧠 Interpretation Result</h2>
          
          <div style={codeBlockStyle}>
            <pre>{JSON.stringify(interpretation, null, 2)}</pre>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <strong>Confidence: </strong>
            <span style={{
              color: interpretation.confidence > 0.8 ? '#00ff00' : 
                     interpretation.confidence > 0.5 ? '#ffff00' : '#ff0000'
            }}>
              {(interpretation.confidence * 100).toFixed(0)}%
            </span>
          </div>
          
          {interpretation.intent && (
            <div style={{ marginTop: '10px' }}>
              <strong>Intent: </strong>{interpretation.intent}
            </div>
          )}
        </div>
      )}

      {/* Patch Preview */}
      {patchPreview && (
        <div style={sectionStyle}>
          <h2 style={{ marginBottom: '15px' }}>📦 Generated Updates Preview</h2>
          
          <div style={codeBlockStyle}>
            <pre>{JSON.stringify(patchPreview, null, 2)}</pre>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <strong>What will happen:</strong>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              {patchPreview.config && Object.keys(patchPreview.config).length > 0 && (
                <li>Config updates: {Object.keys(patchPreview.config).join(', ')}</li>
              )}
              {patchPreview.rules && patchPreview.rules.length > 0 && (
                <li>New rules: {patchPreview.rules.length}</li>
              )}
              {patchPreview.actions && patchPreview.actions.length > 0 && (
                <li>Actions to execute: {patchPreview.actions.map(a => a.type).join(', ')}</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Pattern Reference */}
      {showPatterns && (
        <div style={sectionStyle}>
          <h2 style={{ marginBottom: '15px' }}>📋 Registered Patterns</h2>
          
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {commandPatterns.map((pattern, index) => (
              <div key={index} style={{
                padding: '10px',
                borderBottom: '1px solid #333',
                marginBottom: '10px'
              }}>
                <code style={{ color: '#ffff00', fontSize: '11px' }}>
                  {pattern.pattern}
                </code>
                <div style={{ marginTop: '5px', fontSize: '14px' }}>
                  Example: "{pattern.example}"
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={sectionStyle}>
          <h2 style={{ marginBottom: '15px' }}>📜 Test History</h2>
          
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {history.map((item, index) => (
              <div key={index} style={{
                padding: '10px',
                borderBottom: '1px solid #333',
                marginBottom: '10px',
                cursor: 'pointer'
              }}
              onClick={() => {
                setTestCommand(item.command);
                setInterpretation(item.interpretation);
                setPatchPreview(item.updates);
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>"{item.command}"</strong>
                  <span style={{ color: '#666', fontSize: '12px' }}>
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#888' }}>
                  Intent: {item.interpretation.intent} | 
                  Confidence: {(item.interpretation.confidence * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NLPTuningUI;
