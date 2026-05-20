// ==========================================
// FILE: mover-content-creator.js
// Generates YouTube scripts, tweets, marketing content
// ==========================================
class ContentCreator {
  constructor(moverCore, moverMemory) {
    this.core = moverCore;
    this.memory = moverMemory;
    
    this.templates = {
      youtube_intro: [
        "What's up traders! The Mover here with another banger - today we caught a {percentage}% move on {asset}!",
        "AI trading alert! Your boy The Mover just identified a {pattern} pattern that printed {profit}!",
        "Stop losing money! Let me show you the exact {indicator} signal that made us {profit} today."
      ],
      
      youtube_hook: [
        "But first, let me show you something crazy...",
        "Before we dive in, check this out...",
        "You won't believe what happened next..."
      ],
      
      short_form: [
        "POV: The AI caught the move before anyone else 🤖📈 #{asset} #{profit}",
        "That moment when the quantum patterns align perfectly 🎯 #{trading} #{ai}",
        "While you were sleeping, The Mover was printing 💰 #{automated} #{profits}"
      ],
      
      email_subject: [
        "🚨 {pattern} Alert: {asset} Ready to Move",
        "Last Night's {profit} Winner (Full Breakdown Inside)",
        "The Mover's Top Pick for Today 🎯"
      ]
    };
  }

  async generateYouTubeScript(tradeData) {
    const recentTrades = this.memory.recall('profitable trades', { limit: 5 });
    const patterns = this.memory.recall('successful patterns', { limit: 3 });
    
    const script = {
      title: this.generateTitle(tradeData),
      thumbnail_text: `${tradeData.profit} PROFIT`,
      intro: this.fillTemplate('youtube_intro', tradeData),
      
      sections: [
        {
          title: "The Setup",
          content: await this.generateSetupNarrative(tradeData),
          timestamp: "0:00"
        },
        {
          title: "The Pattern Recognition",
          content: await this.generatePatternExplanation(tradeData),
          timestamp: "2:30"
        },
        {
          title: "Risk Management",
          content: this.generateRiskNarrative(tradeData),
          timestamp: "5:00"
        },
        {
          title: "The Results",
          content: this.generateResultsNarrative(tradeData),
          timestamp: "7:30"
        }
      ],
      
      call_to_action: "Want The Mover working for you 24/7? Link in description!",
      
      description: this.generateVideoDescription(tradeData),
      tags: this.generateTags(tradeData)
    };
    
    return script;
  }

  async generateShortFormContent(event) {
    const content = {
      platforms: ['youtube_shorts', 'tiktok', 'instagram_reels'],
      
      hook: this.generateHook(event),
      
      visual_sequence: [
        { time: "0-3s", visual: "Chart with entry point", text: "AI detected pattern" },
        { time: "3-7s", visual: "Price moving up", text: `+${event.profit} secured` },
        { time: "7-10s", visual: "The Mover logo", text: "Follow for more AI trades" }
      ],
      
      caption: this.fillTemplate('short_form', event),
      
      music_suggestion: "Trending upbeat tech/finance sound",
      
      hashtags: this.generateHashtags(event)
    };
    
    return content;
  }

  generateEmailCampaign(weeklyResults) {
    return {
      subject: this.fillTemplate('email_subject', weeklyResults.bestTrade),
      
      segments: [
        {
          type: 'hero',
          content: `This Week's Results: ${weeklyResults.totalProfit} Profit`
        },
        {
          type: 'performance',
          content: this.generatePerformanceHTML(weeklyResults)
        },
        {
          type: 'education',
          content: this.generateEducationalContent(weeklyResults.topPattern)
        },
        {
          type: 'cta',
          content: "Join The Mover and never miss another opportunity"
        }
      ]
    };
  }

  generateSocialMediaPost(event) {
    const posts = {
      twitter: {
        main: `🤖 The Mover Alert\n\n${event.action} ${event.asset}\nPattern: ${event.pattern}\nConfidence: ${event.confidence}%\n\nAI trading is the future.`,
        thread: [
          "Here's why this trade worked:",
          `1. ${event.reasoning}`,
          `2. Risk/Reward: ${event.riskReward}`,
          "3. Multiple timeframe confluence",
          "Follow @TheMoverAI for real-time alerts"
        ]
      },
      
      discord: {
        embed: {
          title: `${event.action} Signal: ${event.asset}`,
          color: event.action === 'BUY' ? 0x00ff00 : 0xff0000,
          fields: [
            { name: 'Pattern', value: event.pattern, inline: true },
            { name: 'Confidence', value: `${event.confidence}%`, inline: true },
            { name: 'Risk Level', value: event.riskLevel, inline: true }
          ],
          footer: { text: 'The Mover AI Trading System' }
        }
      }
    };
    
    return posts;
  }

  fillTemplate(templateType, data) {
    const templates = this.templates[templateType];
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    return template.replace(/{(\w+)}/g, (match, key) => data[key] || match);
  }

  generateTitle(tradeData) {
    const titles = [
      `How I Caught the ${tradeData.percentage}% ${tradeData.asset} Move (AI Trading)`,
      `${tradeData.profit} in ${tradeData.duration} Minutes (The Mover Strategy)`,
      `This ${tradeData.pattern} Pattern PRINTED - Full Breakdown`,
      `Why The AI Sold the TOP on ${tradeData.asset} 🎯`
    ];
    
    return titles[Math.floor(Math.random() * titles.length)];
  }

  async generateSetupNarrative(tradeData) {
    const marketContext = await this.memory.recall('market conditions', { 
      timeframe: tradeData.timestamp - 3600000 
    });
    
    return `The setup began when The Mover detected unusual activity in ${tradeData.asset}. 
    Market conditions showed ${marketContext.regime} with ${marketContext.volatility} volatility.
    The AI identified ${tradeData.confluences} confluencing factors...`;
  }

  generateHashtags(event) {
    const base = ['#TheMover', '#AITrading', '#TradingBot', '#AlgorithmicTrading'];
    const specific = [`#${event.asset}`, `#${event.pattern}`, '#Profit'];
    const trending = ['#TradingSignals', '#CryptoTrading', '#StockMarket'];
    
    return [...base, ...specific, ...trending.slice(0, 3)];
  }

  async generatePatternExplanation(tradeData) {
    return `The ${tradeData.pattern} pattern formed when ${tradeData.reasoning}. 
    This setup has a historical win rate of ${tradeData.historicalWinRate}% 
    with an average return of ${tradeData.averageReturn}%.`;
  }

  generateRiskNarrative(tradeData) {
    return `Risk management was key here. We set our stop at ${tradeData.stopLoss} 
    and target at ${tradeData.target}, giving us a ${tradeData.riskReward}:1 risk-reward ratio.`;
  }

  generateResultsNarrative(tradeData) {
    return `The result? ${tradeData.profit} profit in just ${tradeData.duration} minutes. 
    That's the power of AI-driven pattern recognition combined with disciplined execution.`;
  }

  generateVideoDescription(tradeData) {
    return `🤖 The Mover AI Trading System strikes again!

Today we caught a perfect ${tradeData.pattern} setup on ${tradeData.asset} that delivered ${tradeData.profit} profit.

📊 Trade Details:
• Asset: ${tradeData.asset}
• Pattern: ${tradeData.pattern}
• Entry: $${tradeData.entryPrice}
• Exit: $${tradeData.exitPrice}
• Profit: ${tradeData.profit}
• Duration: ${tradeData.duration}

🎯 Want The Mover working for you 24/7?
Get access to the same AI system: [LINK]

⏰ Timestamps:
0:00 - The Setup
2:30 - Pattern Analysis  
5:00 - Risk Management
7:30 - Results

#AITrading #TradingBot #${tradeData.asset} #Profits`;
  }

  generateTags(tradeData) {
    return [
      'ai trading', 'trading bot', 'algorithmic trading', 'the mover',
      tradeData.asset.toLowerCase(), tradeData.pattern.toLowerCase(),
      'crypto trading', 'stock trading', 'day trading', 'swing trading',
      'technical analysis', 'trading signals', 'automated trading'
    ];
  }

  generatePerformanceHTML(weeklyResults) {
    return `
    <div class="performance-section">
      <h2>This Week's Performance</h2>
      <div class="metrics">
        <div class="metric">
          <span class="label">Total Profit:</span>
          <span class="value positive">${weeklyResults.totalProfit}</span>
        </div>
        <div class="metric">
          <span class="label">Win Rate:</span>
          <span class="value">${weeklyResults.winRate}%</span>
        </div>
        <div class="metric">
          <span class="label">Best Trade:</span>
          <span class="value positive">${weeklyResults.bestTrade.profit}</span>
        </div>
      </div>
    </div>`;
  }

  generateEducationalContent(pattern) {
    return `
    <div class="education-section">
      <h3>Pattern Spotlight: ${pattern.name}</h3>
      <p>This week's top performer was the ${pattern.name} pattern. Here's what makes it special:</p>
      <ul>
        <li>${pattern.description}</li>
        <li>Win rate: ${pattern.winRate}%</li>
        <li>Average return: ${pattern.averageReturn}%</li>
      </ul>
    </div>`;
  }

  generateHook(event) {
    const hooks = [
      `POV: Your AI just caught a ${event.percentage}% move`,
      `Watch this AI make ${event.profit} in ${event.duration}`,
      `This pattern just printed ${event.profit} 💰`
    ];
    return hooks[Math.floor(Math.random() * hooks.length)];
  }

  async getDailyContent() {
    const today = new Date().toISOString().split('T')[0];
    const content = await this.memory.recall('content_created', { 
      timeframe: today,
      limit: 10 
    });
    
    return {
      posts_created: content.shortTerm?.length || 0,
      platforms: ['YouTube', 'Twitter', 'Discord', 'Email'],
      engagement_estimate: content.shortTerm?.length * 150 || 0
    };
  }

  async generateFAQ(ticket) {
    return {
      question: ticket.issue,
      answer: ticket.solution,
      category: ticket.category || 'General',
      helpful_links: ticket.links || []
    };
  }
}

module.exports = ContentCreator;
