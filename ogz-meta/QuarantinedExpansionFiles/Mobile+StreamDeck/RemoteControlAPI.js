RemoteControlAPI.js
// mobile/remoteControlAPI.js
const express = require('express');
const router = express.Router();

class RemoteControlAPI {
  constructor(ogzPrime) {
    this.ogzPrime = ogzPrime;
    this.setupRoutes();
  }

  setupRoutes() {
    // Quick actions
    router.post('/quick/:action', this.authenticate, async (req, res) => {
      const { action } = req.params;
      
      try {
        switch (action) {
          case 'pause':
            this.ogzPrime.pauseTrading('Remote control');
            res.json({ success: true, message: 'Trading paused' });
            break;
            
          case 'resume':
            this.ogzPrime.resumeTrading();
            res.json({ success: true, message: 'Trading resumed' });
            break;
            
          case 'close-all':
            if (this.ogzPrime.tradingBrain.isInPosition()) {
              this.ogzPrime.emergencyClosePosition('Remote emergency close');
              res.json({ success: true, message: 'Position closed' });
            } else {
              res.json({ success: false, message: 'No position to close' });
            }
            break;
            
          case 'screenshot':
            const screenshot = await this.captureScreenshot();
            res.json({ success: true, screenshot });
            break;
            
          default:
            res.status(400).json({ error: 'Unknown action' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Voice control
    router.post('/voice', this.authenticate, async (req, res) => {
      const { command, confidence } = req.body;
      
      if (confidence < 0.7) {
        return res.json({ 
          success: false, 
          message: 'Command confidence too low' 
        });
      }

      const result = await this.processVoiceCommand(command);
      res.json(result);
    });

    // Remote settings
    router.get('/settings', this.authenticate, (req, res) => {
      res.json({
        riskLevel: this.ogzPrime.riskManager?.config.baseRiskPercent,
        maxDrawdown: this.ogzPrime.riskManager?.config.maxDrawdownPercent,
        tradingEnabled: this.ogzPrime.isRunning,
        modules: this.getActiveModules()
      });
    });

    router.put('/settings', this.authenticate, (req, res) => {
      const { riskLevel, maxDrawdown } = req.body;
      
      if (riskLevel && this.ogzPrime.riskManager) {
        this.ogzPrime.riskManager.config.baseRiskPercent = riskLevel;
      }
      
      if (maxDrawdown && this.ogzPrime.riskManager) {
        this.ogzPrime.riskManager.config.maxDrawdownPercent = maxDrawdown;
      }

      res.json({ success: true, message: 'Settings updated' });
    });
  }

  authenticate(req, res, next) {
    // Mobile auth middleware
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    // Verify token (simplified)
    next();
  }

  async processVoiceCommand(command) {
    const lower = command.toLowerCase();
    
    if (lower.includes('buy') && lower.includes('bitcoin')) {
      this.ogzPrime.executeManualBuy();
      return { success: true, response: 'Buy order executed' };
    }
    
    if (lower.includes('sell') || lower.includes('close')) {
      this.ogzPrime.executeManualSell();
      return { success: true, response: 'Sell order executed' };
    }
    
    if (lower.includes('status') || lower.includes('balance')) {
      const balance = this.ogzPrime.tradingBrain.balance;
      return { 
        success: true, 
        response: `Balance is ${balance.toFixed(2)} dollars` 
      };
    }
    
    return { success: false, response: 'Command not understood' };
  }

  async captureScreenshot() {
    // Return base64 encoded chart image
    return 'data:image/png;base64,iVBORw0KG...'; // Placeholder
  }

  getActiveModules() {
    return Object.keys(this.ogzPrime.config)
      .filter(key => key.startsWith('enable') && this.ogzPrime.config[key])
      .map(key => key.replace('enable', ''));
  }

  getRouter() {
    return router;
  }
}

module.exports = RemoteControlAPI;