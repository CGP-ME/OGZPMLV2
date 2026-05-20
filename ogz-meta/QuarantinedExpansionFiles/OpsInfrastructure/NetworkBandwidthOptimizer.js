// 📁 FILE: core/NetworkBandwidthOptimizer.js

/**
 * NetworkBandwidthOptimizer - Reduces network traffic through message batching and compression
 * Queues messages and sends them in compressed batches to minimize bandwidth usage
 */
class NetworkBandwidthOptimizer {
  /**
   * Initialize network optimizer with batching configuration
   * Sets up message queue and batching parameters for optimal network usage
   */
  constructor() {
    // Queue to store messages awaiting batch transmission
    this.messageQueue = [];
    
    // Maximum number of messages per batch before auto-flush
    this.batchSize = 10;
    
    // Time interval between batch transmissions (1 second)
    this.batchInterval = 1000;
  }
  
  /**
   * Add message to queue with timestamp and trigger flush if batch size reached
   * @param {Object} message - Message object to queue for batch transmission
   */
  queueMessage(message) {
    // Add message to queue with queuing timestamp
    this.messageQueue.push({
      ...message,
      queued: Date.now() // Timestamp when message was queued
    });
    
    // Auto-flush if batch size limit reached
    if (this.messageQueue.length >= this.batchSize) {
      this.flush();
    }
  }
  
  /**
   * Start automatic batching timer for periodic message transmission
   * Creates interval timer to flush queued messages at regular intervals
   */
  startBatching() {
    // Set up timer to flush messages every batch interval
    this.batchTimer = setInterval(() => {
      // Only flush if there are queued messages
      if (this.messageQueue.length > 0) {
        this.flush();
      }
    }, this.batchInterval);
  }
  
  /**
   * Flush queued messages by creating and sending compressed batch
   * Removes messages from queue and prepares them for transmission
   */
  flush() {
    // Skip flush if no messages in queue
    if (this.messageQueue.length === 0) return;
    
    // Create batch object with messages and timestamp
    const batch = {
      type: 'batch',
      messages: this.messageQueue.splice(0, this.batchSize), // Remove messages from queue
      timestamp: Date.now() // Batch creation timestamp
    };
    
    // Send compressed batch to reduce network usage
    return this.compressAndSend(batch);
  }
  
  /**
   * Compress batch data and prepare for transmission
   * Reduces payload size by using shortened keys and removing redundant data
   * @param {Object} batch - Batch object containing messages to compress
   * @returns {Object} Compressed batch with shortened keys
   */
  compressAndSend(batch) {
    // Simple compression using shortened property names
    const compressed = {
      t: batch.timestamp, // 't' instead of 'timestamp'
      m: batch.messages.map(msg => ({ // 'm' instead of 'messages'
        d: msg.data, // 'd' instead of 'data'
        p: msg.priority || 0 // 'p' instead of 'priority', default to 0
      }))
    };
    
    return compressed;
  }
}

module.exports = NetworkBandwidthOptimizer;