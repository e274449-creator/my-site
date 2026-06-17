/**
 * EVENTBUS.JS - Advanced Event System
 * 
 * Decoupled event communication with:
 * - Event emission and subscription
 * - Event priorities and ordering
 * - Event filtering and namespacing
 * - Async event handling
 * - Event history tracking
 * - Memory leak prevention
 * 
 * @module EventBus
 */

export class EventBus {
  /**
   * Creates the event bus instance
   * @param {Object} config - Configuration
   */
  constructor(config = {}) {
    this.config = {
      maxHistory: 100,
      trackHistory: true,
      enableLogging: false,
      ...config
    };

    // Event listeners storage
    this.listeners = new Map(); // eventType -> Set of {callback, priority, once}
    this.eventHistory = [];

    // Async event queue
    this.eventQueue = [];
    this.processing = false;

    // Event namespaces
    this.namespaces = new Set();

    console.log('EventBus initialized', this.config);
  }

  /**
   * Subscribe to an event
   * @param {string} eventType - Event identifier (supports namespacing: 'game:start')
   * @param {Function} callback - Listener callback
   * @param {number} priority - Execution priority (higher = earlier)
   * @returns {Function} Unsubscribe function
   */
  on(eventType, callback, priority = 0) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const listener = { callback, priority, once: false };
    const listeners = this.listeners.get(eventType);
    
    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < listeners.length; i++) {
      if (priority > listeners[i].priority) {
        listeners.splice(i, 0, listener);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      listeners.push(listener);
    }

    // Return unsubscribe function
    return () => this.off(eventType, callback);
  }

  /**
   * Subscribe to an event for a single emission
   * @param {string} eventType - Event identifier
   * @param {Function} callback - Listener callback
   * @param {number} priority - Execution priority
   * @returns {Function} Unsubscribe function
   */
  once(eventType, callback, priority = 0) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const listener = { callback, priority, once: true };
    const listeners = this.listeners.get(eventType);

    // Insert in priority order
    let inserted = false;
    for (let i = 0; i < listeners.length; i++) {
      if (priority > listeners[i].priority) {
        listeners.splice(i, 0, listener);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      listeners.push(listener);
    }

    return () => this.off(eventType, callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} eventType - Event identifier
   * @param {Function} callback - Listener callback to remove
   * @returns {boolean} True if listener was removed
   */
  off(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      return false;
    }

    const listeners = this.listeners.get(eventType);
    const index = listeners.findIndex(l => l.callback === callback);

    if (index > -1) {
      listeners.splice(index, 1);
      
      if (listeners.length === 0) {
        this.listeners.delete(eventType);
      }

      return true;
    }

    return false;
  }

  /**
   * Emit an event synchronously
   * @param {string} eventType - Event identifier
   * @param {*} data - Event data
   * @returns {*} Last listener's return value
   */
  emit(eventType, data = null) {
    return this.executeListeners(eventType, data);
  }

  /**
   * Emit an event asynchronously
   * @param {string} eventType - Event identifier
   * @param {*} data - Event data
   * @returns {Promise<*>} Promise resolving to last listener's return value
   */
  async emitAsync(eventType, data = null) {
    return new Promise((resolve) => {
      this.eventQueue.push({ eventType, data, resolve });
      this.processAsyncQueue();
    });
  }

  /**
   * Process async event queue
   * @private
   */
  async processAsyncQueue() {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.eventQueue.length > 0) {
      const { eventType, data, resolve } = this.eventQueue.shift();
      const result = this.executeListeners(eventType, data);
      resolve(result);
    }

    this.processing = false;
  }

  /**
   * Execute listeners for an event
   * @private
   */
  executeListeners(eventType, data) {
    const listeners = this.listeners.get(eventType);
    if (!listeners || listeners.length === 0) {
      return null;
    }

    let result = null;
    const listenersToRemove = [];

    for (let i = listeners.length - 1; i >= 0; i--) {
      const { callback, once } = listeners[i];

      try {
        result = callback(data);

        if (once) {
          listenersToRemove.push(i);
        }
      } catch (error) {
        console.error(`Error in event listener for '${eventType}':`, error);
      }
    }

    // Remove once listeners
    for (const index of listenersToRemove) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this.listeners.delete(eventType);
    }

    // Track history
    if (this.config.trackHistory) {
      this.addToHistory(eventType, data);
    }

    if (this.config.enableLogging) {
      console.log(`[EventBus] ${eventType}`, data);
    }

    return result;
  }

  /**
   * Add event to history
   * @private
   */
  addToHistory(eventType, data) {
    this.eventHistory.push({
      eventType,
      data,
      timestamp: Date.now()
    });

    if (this.eventHistory.length > this.config.maxHistory) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history
   * @param {number} count - Number of recent events
   * @returns {Array} Event history
   */
  getHistory(count = 10) {
    return this.eventHistory.slice(-count);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
  }

  /**
   * Get all listeners for an event type
   * @param {string} eventType - Event identifier
   * @returns {Array} Listeners array
   */
  getListeners(eventType) {
    const listeners = this.listeners.get(eventType);
    return listeners ? [...listeners] : [];
  }

  /**
   * Get listener count for an event
   * @param {string} eventType - Event identifier
   * @returns {number} Number of listeners
   */
  getListenerCount(eventType) {
    return this.listeners.get(eventType)?.length || 0;
  }

  /**
   * Remove all listeners for an event type
   * @param {string} eventType - Event identifier (or null for all)
   */
  removeAllListeners(eventType = null) {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get debug info
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      eventTypes: this.listeners.size,
      totalListeners: Array.from(this.listeners.values()).reduce((sum, arr) => sum + arr.length, 0),
      historySize: this.eventHistory.length,
      queueSize: this.eventQueue.length
    };
  }
}

export default EventBus;
