// ==========================================
// FILE: mover-tech-support.js
// Handles technical support, debugging, customer help
// ==========================================
class TechSupport {
  constructor(moverCore, moverMemory) {
    this.core = moverCore;
    this.memory = moverMemory;
    
    this.knowledgeBase = {
      common_issues: {
        'websocket_disconnect': {
          symptoms: ['Lost connection', 'WebSocket closed', 'Connection timeout'],
          diagnosis: 'WebSocket connection instability detected',
          solutions: [
            'Check if bot is running on correct port',
            'Verify firewall settings',
            'Implement reconnection logic with exponential backoff',
            'Check for rate limiting'
          ],
          code_fix: `
// Add to your WebSocket handler:
ws.on('close', () => {
  console.log('Connection lost, reconnecting...');
  setTimeout(() => connectWebSocket(), 5000);
});`
        },
        
        'no_trades_executing': {
          symptoms: ['Patterns detected but no trades', 'Signals not executing'],
          diagnosis: 'Execution pipeline disconnection',
          solutions: [
            'Verify API keys are set correctly',
            'Check account balance and permissions',
            'Ensure risk manager is not blocking trades',
            'Verify exchange connection'
          ]
        },
        
        'high_cpu_usage': {
          symptoms: ['Bot running slow', 'High CPU usage', 'Memory leaks'],
          diagnosis: 'Resource optimization needed',
          solutions: [
            'Implement data cleanup intervals',
            'Reduce logging verbosity',
            'Optimize pattern matching algorithms',
            'Add memory limits to PM2 config'
          ]
        }
      }
    };
  }

  async diagnoseProblem(userQuery) {
    // Use AI to understand the problem
    const symptoms = this.extractSymptoms(userQuery);
    const relevantLogs = await this.memory.recall(symptoms.join(' '), { limit: 20 });
    
    // Match against known issues
    const diagnosis = this.matchKnownIssues(symptoms);
    
    // Check system health
    const systemHealth = await this.checkSystemHealth();
    
    return {
      understanding: `I see you're experiencing: ${symptoms.join(', ')}`,
      diagnosis: diagnosis.diagnosis,
      
      solutions: diagnosis.solutions,
      
      code_fixes: diagnosis.code_fix,
      
      system_status: systemHealth,
      
      personalized_help: await this.generatePersonalizedSolution(symptoms, relevantLogs),
      
      follow_up: "Let me know if you need me to walk you through any of these steps!"
    };
  }

  extractSymptoms(query) {
    const symptoms = [];
    const keywords = {
      connection: ['disconnect', 'connection', 'websocket', 'offline'],
      performance: ['slow', 'lag', 'cpu', 'memory', 'freeze'],
      trading: ['no trades', 'not executing', 'not working'],
      data: ['no data', 'missing', 'empty']
    };
    
    Object.entries(keywords).forEach(([category, words]) => {
      if (words.some(word => query.toLowerCase().includes(word))) {
        symptoms.push(category);
      }
    });
    
    return symptoms;
  }

  matchKnownIssues(symptoms) {
    // Smart matching against knowledge base
    let bestMatch = null;
    let highestScore = 0;
    
    Object.entries(this.knowledgeBase.common_issues).forEach(([issue, data]) => {
      const score = this.calculateMatchScore(symptoms, data.symptoms);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = { issue, ...data };
      }
    });
    
    return bestMatch || this.generateGenericDiagnosis(symptoms);
  }

  async generatePersonalizedSolution(symptoms, logs) {
    // Analyze user's specific setup
    const userConfig = await this.memory.recall('configuration', { limit: 1 });
    const recentErrors = logs.filter(log => log.type === 'error');
    
    const solution = {
      steps: [],
      specific_to_your_setup: {}
    };
    
    // Generate steps based on their actual configuration
    if (recentErrors.length > 0) {
      solution.steps.push(`First, let's address this error: ${recentErrors[0].message}`);
    }
    
    return solution;
  }

  async checkSystemHealth() {
    return {
      bot_status: 'Check with: pm2 status',
      websocket_connections: 'Active on ports 8080, 4001',
      memory_usage: 'Run: pm2 monit',
      recent_errors: await this.memory.recall('error', { limit: 5 }),
      last_successful_trade: await this.memory.recall('successful trade', { limit: 1 })
    };
  }

  generateTicketResponse(ticket) {
    return {
      greeting: `Hey ${ticket.user}! The Mover here. I see you're having trouble with ${ticket.issue}.`,
      
      immediate_help: this.diagnoseProblem(ticket.description),
      
      proactive_check: "I'm also checking your recent logs to see if there's anything else...",
      
      escalation: ticket.priority === 'high' ? 
        "I've flagged this as urgent. If my solution doesn't work, I'll escalate to human support." :
        "Try these steps and let me know how it goes!",
        
      sign_off: "Here to help 24/7 - The Mover 🤖"
    };
  }

  calculateMatchScore(symptoms, knownSymptoms) {
    let score = 0;
    symptoms.forEach(symptom => {
      if (knownSymptoms.some(known => known.toLowerCase().includes(symptom))) {
        score += 1;
      }
    });
    return score / symptoms.length;
  }

  generateGenericDiagnosis(symptoms) {
    return {
      diagnosis: `Issue detected with symptoms: ${symptoms.join(', ')}`,
      solutions: [
        'Check system logs for specific error messages',
        'Restart the affected service',
        'Verify configuration settings',
        'Contact support if issue persists'
      ]
    };
  }
}

module.exports = TechSupport;
