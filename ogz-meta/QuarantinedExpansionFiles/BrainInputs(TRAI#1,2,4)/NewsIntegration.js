// 📁 FILE 3: core/NewsIntegration.js
// NEVER GET CAUGHT BY FED ANNOUNCEMENTS AGAIN!

const https = require('https');
const { URL } = require('url');

class NewsIntegration {
  constructor(ogzPrime, config = {}) {
    this.ogzPrime = ogzPrime;
    this.config = {
      // API configurations
      newsApiKey: process.env.NEWS_API_KEY || '',
      alphaVantageKey: process.env.ALPHA_VANTAGE_KEY || '',
      
      // News sources
      sources: [
        'bloomberg',
        'reuters',
        'cnbc',
        'wsj',
        'coindesk',
        'cointelegraph'
      ],
      
      // Keywords to monitor
      keywords: [
        'bitcoin',
        'btc',
        'crypto',
        'cryptocurrency',
        'federal reserve',
        'interest rate',
        'inflation',
        'SEC',
        'regulation',
        'hack',
        'crash',
        'bull run',
        'bear market'
      ],
      
      // Sentiment thresholds
      sentimentThresholds: {
        veryBullish: 0.8,
        bullish: 0.6,
        neutral: 0.4,
        bearish: 0.2,
        veryBearish: 0
      },
      
      // Trading adjustments
      sentimentAdjustments: {
        veryBullish: { 
          confidenceMultiplier: 1.3,
          riskMultiplier: 1.2,
          action: 'increase_longs'
        },
        bullish: {
          confidenceMultiplier: 1.1,
          riskMultiplier: 1.0,
          action: 'normal'
        },
        neutral: {
          confidenceMultiplier: 1.0,
          riskMultiplier: 1.0,
          action: 'normal'
        },
        bearish: {
          confidenceMultiplier: 0.8,
          riskMultiplier: 0.7,
          action: 'reduce_exposure'
        },
        veryBearish: {
          confidenceMultiplier: 0.5,
          riskMultiplier: 0.3,
          action: 'defensive_mode'
        }
      },
      
      // Event detection
      majorEvents: [
        { pattern: /fed.*rate/i, impact: 'high', pauseTrading: true },
        { pattern: /SEC.*bitcoin/i, impact: 'high', pauseTrading: false },
        { pattern: /hack.*exchange/i, impact: 'critical', pauseTrading: true },
        { pattern: /ban.*crypto/i, impact: 'critical', pauseTrading: true },
        { pattern: /approval.*ETF/i, impact: 'high', pauseTrading: false }
      ],
      
      updateInterval: 60000, // 1 minute
      
      ...config
    };
    
    this.state = {
      currentSentiment: 'neutral',
      sentimentScore: 0.5,
      lastUpdate: null,
      recentNews: [],
      tradingPaused: false,
      pauseReason: null
    };
    
    this.sentimentHistory = [];
  }
  
  /**
   * Start monitoring news
   */
  start() {
    console.log('📰 Starting news monitoring...');
    
    // Initial fetch
    this.fetchAndAnalyze();
    
    // Set up interval
    this.updateInterval = setInterval(() => {
      this.fetchAndAnalyze();
    }, this.config.updateInterval);
    
    console.log('✅ News integration active!');
  }
  
  /**
   * Fetch and analyze news
   */
  async fetchAndAnalyze() {
    try {
      // Fetch news from multiple sources
      const newsArticles = await this.fetchNews();
      
      // Analyze sentiment
      const sentiment = await this.analyzeSentiment(newsArticles);
      
      // Check for major events
      const events = this.detectMajorEvents(newsArticles);
      
      // Update trading parameters
      this.updateTradingParameters(sentiment, events);
      
      // Store state
      this.state.lastUpdate = new Date();
      this.state.recentNews = newsArticles.slice(0, 10);
      
    } catch (error) {
      console.error('❌ News fetch error:', error);
    }
  }
  
  /**
   * Fetch news from APIs
   */
  async fetchNews() {
    const articles = [];
    
    // NewsAPI.org
    if (this.config.newsApiKey) {
      try {
        const newsApiUrl = `https://newsapi.org/v2/everything?` +
          `q=${this.config.keywords.join(' OR ')}&` +
          `sources=${this.config.sources.join(',')}&` +
          `sortBy=publishedAt&` +
          `apiKey=${this.config.newsApiKey}`;
        
        const response = await this.makeRequest(newsApiUrl);
        const data = JSON.parse(response);
        
        if (data.articles) {
          articles.push(...data.articles.map(article => ({
            title: article.title,
            description: article.description,
            content: article.content,
            url: article.url,
            publishedAt: article.publishedAt,
            source: article.source.name
          })));
        }
      } catch (error) {
        console.error('NewsAPI error:', error);
      }
    }
    
    // Alpha Vantage News
    if (this.config.alphaVantageKey) {
      try {
        const alphaUrl = `https://www.alphavantage.co/query?` +
          `function=NEWS_SENTIMENT&` +
          `tickers=CRYPTO:BTC&` +
          `apikey=${this.config.alphaVantageKey}`;
        
        const response = await this.makeRequest(alphaUrl);
        const data = JSON.parse(response);
        
        if (data.feed) {
          articles.push(...data.feed.map(item => ({
            title: item.title,
            description: item.summary,
            content: item.summary,
            url: item.url,
            publishedAt: item.time_published,
            source: item.source,
            sentiment: item.overall_sentiment_score
          })));
        }
      } catch (error) {
        console.error('Alpha Vantage error:', error);
      }
    }
    
    return articles;
  }
  
  /**
   * Analyze sentiment from news
   */
  async analyzeSentiment(articles) {
    if (articles.length === 0) return this.state.sentimentScore;
    
    let totalScore = 0;
    let scoredArticles = 0;
    
    for (const article of articles) {
      let score = 0.5; // Neutral default
      
      // If article already has sentiment score
      if (article.sentiment) {
        score = article.sentiment;
        scoredArticles++;
      } else {
        // Simple keyword-based sentiment
        const text = `${article.title} ${article.description || ''}`.toLowerCase();
        
        // Bullish keywords
        const bullishWords = ['surge', 'rally', 'bullish', 'gain', 'rise', 'adopt', 'approve', 'positive', 'breakthrough', 'soar', 'moon'];
        const bearishWords = ['crash', 'plunge', 'bearish', 'fall', 'drop', 'ban', 'regulate', 'negative', 'hack', 'dump', 'fear'];
        
        let bullishCount = 0;
        let bearishCount = 0;
        
        bullishWords.forEach(word => {
          if (text.includes(word)) bullishCount++;
        });
        
        bearishWords.forEach(word => {
          if (text.includes(word)) bearishCount++;
        });
        
        // Calculate score
        if (bullishCount + bearishCount > 0) {
          score = bullishCount / (bullishCount + bearishCount);
          scoredArticles++;
        }
      }
      
      totalScore += score;
    }
    
    // Average sentiment
    const avgSentiment = scoredArticles > 0 ? totalScore / scoredArticles : 0.5;
    
    // Update state
    this.state.sentimentScore = avgSentiment;
    this.state.currentSentiment = this.getSentimentCategory(avgSentiment);
    
    // Add to history
    this.sentimentHistory.push({
      timestamp: Date.now(),
      score: avgSentiment,
      articleCount: articles.length
    });
    
    // Keep only last 24 hours
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.sentimentHistory = this.sentimentHistory.filter(h => h.timestamp > dayAgo);
    
    console.log(`📊 Market sentiment: ${this.state.currentSentiment} (${(avgSentiment * 100).toFixed(1)}%)`);
    
    return avgSentiment;
  }
  
  /**
   * Detect major market events
   */
  detectMajorEvents(articles) {
    const detectedEvents = [];
    
    for (const article of articles) {
      const text = `${article.title} ${article.description || ''}`;
      
      for (const event of this.config.majorEvents) {
        if (event.pattern.test(text)) {
          detectedEvents.push({
            type: event.pattern.source,
            impact: event.impact,
            pauseTrading: event.pauseTrading,
            article: article
          });
          
          console.log(`🚨 MAJOR EVENT DETECTED: ${event.pattern.source}`);
          console.log(`   Article: ${article.title}`);
          
          // Send Discord alert
          if (this.ogzPrime.config.sendDiscordMessage) {
            this.ogzPrime.config.sendDiscordMessage(
              `🚨 MAJOR MARKET EVENT!\n` +
              `Type: ${event.pattern.source}\n` +
              `Impact: ${event.impact}\n` +
              `Article: ${article.title}\n` +
              `URL: ${article.url}`
            );
          }
        }
      }
    }
    
    return detectedEvents;
  }
  
  /**
   * Update trading parameters based on news
   */
  updateTradingParameters(sentiment, events) {
    // Check for critical events
    const criticalEvent = events.find(e => e.impact === 'critical' && e.pauseTrading);
    
    if (criticalEvent) {
      // PAUSE TRADING
      if (!this.state.tradingPaused) {
        console.log('⏸️ PAUSING TRADING DUE TO CRITICAL EVENT!');
        this.state.tradingPaused = true;
        this.state.pauseReason = criticalEvent.type;
        
        // Close any open positions
        if (this.ogzPrime.tradingBrain?.isInPosition()) {
          console.log('🚨 Closing position due to critical event!');
          this.ogzPrime.executeManualSell();
        }
        
        // Pause the bot
        this.ogzPrime.pauseTrading('Critical news event detected');
      }
    } else if (this.state.tradingPaused) {
      // Resume if no critical events
      console.log('▶️ Resuming trading - critical event cleared');
      this.state.tradingPaused = false;
      this.state.pauseReason = null;
      this.ogzPrime.resumeTrading();
    }
    
    // Apply sentiment adjustments
    const sentimentCategory = this.getSentimentCategory(sentiment);
    const adjustments = this.config.sentimentAdjustments[sentimentCategory];
    
    // Update bot parameters
    if (this.ogzPrime.config) {
      // Store original values if not stored
      if (!this.originalConfig) {
        this.originalConfig = {
          minConfidenceThreshold: this.ogzPrime.config.minConfidenceThreshold,
          maxPositionSize: this.ogzPrime.config.maxPositionSize
        };
      }
      
      // Apply adjustments
      this.ogzPrime.config.minConfidenceThreshold = 
        this.originalConfig.minConfidenceThreshold * adjustments.confidenceMultiplier;
      
      this.ogzPrime.config.maxPositionSize = 
        this.originalConfig.maxPositionSize * adjustments.riskMultiplier;
      
      console.log(`📈 Trading adjustments applied: ${adjustments.action}`);
    }
  }
  
  /**
   * Get sentiment category
   */
  getSentimentCategory(score) {
    if (score >= this.config.sentimentThresholds.veryBullish) return 'veryBullish';
    if (score >= this.config.sentimentThresholds.bullish) return 'bullish';
    if (score >= this.config.sentimentThresholds.neutral) return 'neutral';
    if (score >= this.config.sentimentThresholds.bearish) return 'bearish';
    return 'veryBearish';
  }
  
  /**
   * Make HTTPS request
   */
  makeRequest(urlString) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);
      
      https.get({
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { 'User-Agent': 'OGZPrime/1.0' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }
  
  /**
   * Get current market sentiment
   */
  getMarketSentiment() {
    return {
      sentiment: this.state.currentSentiment,
      score: this.state.sentimentScore,
      tradingPaused: this.state.tradingPaused,
      pauseReason: this.state.pauseReason,
      lastUpdate: this.state.lastUpdate,
      recentNews: this.state.recentNews.slice(0, 5).map(a => ({
        title: a.title,
        source: a.source,
        time: a.publishedAt
      }))
    };
  }
  
  /**
   * Stop news monitoring
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    console.log('📰 News monitoring stopped');
  }
}

module.exports = NewsIntegration;