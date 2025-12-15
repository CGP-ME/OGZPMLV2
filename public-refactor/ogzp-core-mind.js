// Prevent double loading of core mind
if (window.OGZP_CORE_MIND_LOADED) {
  console.log('[OGZP] Core Mind already loaded, skipping duplicate initialization');
  return;
}
window.OGZP_CORE_MIND_LOADED = true;

console.log('[OGZP] Core Mind Activated - Mode: Sassy');

// Commentary verbosity control
window.OGZP_COMMENTARY_VERBOSITY = window.OGZP_COMMENTARY_VERBOSITY || 'balanced'; // 'text', 'text+voice', 'voice', 'silent'

const consoleBox = document.getElementById('ogzp-console') || document.body;

// Centralized ogzpSay function with verbosity control
if (!window.ogzpSay) {
  window.ogzpSay = function(msg, options = {}) {
    const verbosity = options.verbosity || window.OGZP_COMMENTARY_VERBOSITY;
    const type = options.type || 'info'; // 'info', 'trade', 'alert'
    
    // Gate output by verbosity level
    if (verbosity === 'silent') return;
    
    // Console output (always for debugging)
    console.log(`[OGZP] ${msg}`);
    
    // DOM output
    if (verbosity === 'text' || verbosity === 'text+voice' || verbosity === 'balanced') {
      const div = document.createElement('div');
      div.className = `ogzp-message ogzp-${type}`;
      div.textContent = `[OGZP] ${msg}`;
      consoleBox.appendChild(div);
      
      // Keep console clean - remove old messages
      const messages = consoleBox.querySelectorAll('.ogzp-message');
      if (messages.length > 50) {
        messages[0].remove();
      }
    }
    
    // Voice output (future ElevenLabs integration point)
    if (verbosity === 'voice' || verbosity === 'text+voice') {
      // TODO: Add ElevenLabs TTS here
      console.log(`[OGZP Voice] Would speak: "${msg}"`);
    }
  };
}

// Initial commentary with controlled verbosity
ogzpSay('Analyzing trade memory... Pattern match detected.', { type: 'trade' });
ogzpSay('Confidence above threshold. Position: Long.', { type: 'trade' });
ogzpSay('Risk allocation acceptable. Proceeding.', { type: 'info' });
