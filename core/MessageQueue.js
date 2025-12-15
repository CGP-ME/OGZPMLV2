/**
 * MessageQueue.js - WebSocket Message Queue for Ordered Processing
 * 
 * CHANGE 2025-12-11: Fixes WebSocket race condition where messages
 * were processed out of order causing duplicate/missed trades.
 * 
 * Problem:
 * - WebSocket messages arrive asynchronously
 * - Direct processing without queue allows concurrent execution
 * - Message B can finish before Message A, causing stale data
 * 
 * Solution:
 * - Queue all incoming messages with sequence numbers
 * - Process sequentially with minimum gap between messages
 * - Ensures price data never processed out of order
 */

class MessageQueue {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.sequenceNum = 0;
    this.processedCount = 0;
    this.droppedCount = 0;
    this.lastProcessedTime = 0;
    
    this.config = {
      maxQueueSize: options.maxQueueSize || 100,
      minProcessingGapMs: options.minProcessingGapMs || 5,
      staleThresholdMs: options.staleThresholdMs || 5000,
      onProcess: options.onProcess || null,
      onError: options.onError || console.error
    };
  }

  async add(message) {
    const now = Date.now();
    
    const queuedMessage = {
      data: message,
      receivedAt: now,
      sequence: ++this.sequenceNum
    };

    if (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift();
      this.droppedCount++;
      console.warn(`⚠️ MessageQueue: Dropped stale message #${dropped.sequence} (queue full)`);
    }

    this.queue.push(queuedMessage);

    if (!this.processing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      const now = Date.now();

      const age = now - msg.receivedAt;
      if (age > this.config.staleThresholdMs) {
        this.droppedCount++;
        console.warn(`⚠️ MessageQueue: Dropped stale message #${msg.sequence} (age: ${age}ms)`);
        continue;
      }

      try {
        if (this.config.onProcess) {
          await this.config.onProcess(msg.data);
        }
        this.processedCount++;
        this.lastProcessedTime = now;

        const timeSinceStart = now - msg.receivedAt;
        const gap = Math.max(0, this.config.minProcessingGapMs - timeSinceStart);
        if (gap > 0) {
          await new Promise(resolve => setTimeout(resolve, gap));
        }
      } catch (error) {
        this.config.onError('MessageQueue processing error:', error);
      }
    }

    this.processing = false;
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      totalReceived: this.sequenceNum,
      totalProcessed: this.processedCount,
      totalDropped: this.droppedCount,
      lastProcessedTime: this.lastProcessedTime
    };
  }

  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    return cleared;
  }

  get length() {
    return this.queue.length;
  }

  get isProcessing() {
    return this.processing;
  }
}

module.exports = MessageQueue;
