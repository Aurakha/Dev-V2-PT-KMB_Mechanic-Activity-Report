/**
 * ============================================================================
 * Logger.gs - Structured Logging System
 * ============================================================================
 * 
 * Advanced logging dengan:
 * - Log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - Structured context (function name, parameters, duration)
 * - Auto-truncation untuk log message besar
 * - Visual formatting untuk readability
 * - Performance timer utility
 * 
 * Usage:
 *   Log.info('functionName', 'message', {context});
 *   Log.error('functionName', 'message', {error, stack});
 *   var timer = Log.startTimer('functionName');
 *   timer.end();
 * 
 * Dependencies: Constants.gs (LOG_LEVELS)
 * ============================================================================
 */

// ============================================================================
// LOGGER OBJECT (singleton pattern)
// ============================================================================

var Log = {
  
  /**
   * Log DEBUG message
   * @param {string} source - Function/component name
   * @param {string} message - Log message
   * @param {Object} context - Additional context (optional)
   */
  debug: function(source, message, context) {
    this._log(LOG_LEVELS.DEBUG, source, message, context);
  },
  
  /**
   * Log INFO message
   * @param {string} source
   * @param {string} message
   * @param {Object} context
   */
  info: function(source, message, context) {
    this._log(LOG_LEVELS.INFO, source, message, context);
  },
  
  /**
   * Log WARN message
   * @param {string} source
   * @param {string} message
   * @param {Object} context
   */
  warn: function(source, message, context) {
    this._log(LOG_LEVELS.WARN, source, message, context);
  },
  
  /**
   * Log ERROR message
   * @param {string} source
   * @param {string} message
   * @param {Object} context - Should include {error, stack} jika available
   */
  error: function(source, message, context) {
    this._log(LOG_LEVELS.ERROR, source, message, context);
  },
  
  /**
   * Log CRITICAL message
   * @param {string} source
   * @param {string} message
   * @param {Object} context
   */
  critical: function(source, message, context) {
    this._log(LOG_LEVELS.CRITICAL, source, message, context);
  },
  
  /**
   * Internal log function
   * @private
   */
  _log: function(level, source, message, context) {
    // Check log level priority
    var currentPriority = LOG_LEVEL_PRIORITY[CURRENT_LOG_LEVEL] || 0;
    var messagePriority = LOG_LEVEL_PRIORITY[level] || 0;
    
    if (messagePriority < currentPriority) {
      return; // Skip if below current log level
    }
    
    // Format timestamp
    var timestamp = this._formatTimestamp(new Date());
    
    // Format level dengan emoji
    var levelEmoji = this._getLevelEmoji(level);
    var levelLabel = level.padEnd(8);
    
    // Format source
    var sourceLabel = '[' + (source || 'Unknown') + ']';
    
    // Format message
    var formattedMessage = message || '';
    
    // Format context
    var contextStr = '';
    if (context && typeof context === 'object') {
      try {
        contextStr = ' ' + this._formatContext(context);
      } catch (e) {
        contextStr = ' [context serialization error]';
      }
    }
    
    // Build full log line
    var logLine = timestamp + ' ' + levelEmoji + ' ' + levelLabel + ' ' + sourceLabel + ' ' + formattedMessage + contextStr;
    
    // Truncate jika terlalu panjang (Apps Script limit ~50000 chars per log)
    if (logLine.length > 5000) {
      logLine = logLine.substring(0, 5000) + '... [truncated]';
    }
    
    // Output to Apps Script Logger
    Logger.log(logLine);
  },
  
  /**
   * Format timestamp
   * @private
   */
  _formatTimestamp: function(date) {
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    var seconds = String(date.getSeconds()).padStart(2, '0');
    var ms = String(date.getMilliseconds()).padStart(3, '0');
    return hours + ':' + minutes + ':' + seconds + '.' + ms;
  },
  
  /**
   * Get emoji for log level
   * @private
   */
  _getLevelEmoji: function(level) {
    var emojis = {
      'DEBUG': '🔍',
      'INFO': 'ℹ️',
      'WARN': '⚠️',
      'ERROR': '❌',
      'CRITICAL': '🚨'
    };
    return emojis[level] || '📝';
  },
  
  /**
   * Format context object to readable string
   * @private
   */
  _formatContext: function(context) {
    if (!context) return '';
    
    var parts = [];
    
    for (var key in context) {
      if (context.hasOwnProperty(key)) {
        var value = context[key];
        
        // Handle different value types
        if (value === null || value === undefined) {
          parts.push(key + '=null');
        } else if (value instanceof Date) {
          parts.push(key + '=' + value.toISOString());
        } else if (typeof value === 'object') {
          try {
            var json = JSON.stringify(value);
            if (json.length > 500) {
              json = json.substring(0, 500) + '...';
            }
            parts.push(key + '=' + json);
          } catch (e) {
            parts.push(key + '=[circular]');
          }
        } else if (typeof value === 'string' && value.length > 200) {
          parts.push(key + '="' + value.substring(0, 200) + '..."');
        } else {
          parts.push(key + '=' + value);
        }
      }
    }
    
    return '{' + parts.join(', ') + '}';
  },
  
  /**
   * Start performance timer
   * @param {string} source - Function/component name
   * @return {Object} Timer object dengan end() method
   */
  startTimer: function(source) {
    var startTime = new Date().getTime();
    var self = this;
    
    return {
      source: source,
      startTime: startTime,
      
      /**
       * End timer dan log duration
       * @param {string} message - Optional message
       * @param {Object} context - Optional context
       */
      end: function(message, context) {
        var endTime = new Date().getTime();
        var duration = endTime - startTime;
        
        var fullContext = context || {};
        fullContext.duration_ms = duration;
        
        // Warn if slow operation
        if (duration > PERFORMANCE.WARN_SLOW_OPERATION_MS) {
          self.warn(source, 'Slow operation: ' + (message || 'completed'), fullContext);
        } else {
          self.info(source, message || 'completed', fullContext);
        }
        
        return duration;
      },
      
      /**
       * Get elapsed time without ending timer
       * @return {number} Elapsed ms
       */
      elapsed: function() {
        return new Date().getTime() - this.startTime;
      }
    };
  },
  
  /**
   * Log a separator line untuk visual clarity
   * @param {string} label - Optional label
   */
  separator: function(label) {
    var line = '═══════════════════════════════════════════════════════════════';
    Logger.log(line);
    if (label) {
      Logger.log('  ' + label);
      Logger.log(line);
    }
  },
  
  /**
   * Log function entry (start of function)
   * @param {string} source - Function name
   * @param {Object} params - Function parameters
   * @return {Object} Timer object
   */
  enter: function(source, params) {
    this.debug(source, '→ ENTRY', params ? {params: params} : null);
    return this.startTimer(source);
  },
  
  /**
   * Log function exit
   * @param {Object} timer - Timer from enter()
   * @param {string} message - Optional message
   * @param {*} result - Optional result
   */
  exit: function(timer, message, result) {
    var context = {};
    
    if (result !== undefined) {
      context.result = result;
    }
    
    if (timer && timer.end) {
      timer.end('← EXIT ' + (message || ''), context);
    }
  },
  
  /**
   * Log catched error dengan full context
   * @param {string} source
   * @param {Error} error - JavaScript Error object
   * @param {Object} additionalContext
   */
  exception: function(source, error, additionalContext) {
    var context = additionalContext || {};
    
    if (error) {
      context.errorName = error.name || 'Error';
      context.errorMessage = error.message || 'Unknown error';
      
      if (error.stack) {
        // Truncate stack trace
        var stack = error.stack;
        if (stack.length > 1000) {
          stack = stack.substring(0, 1000) + '...';
        }
        context.stack = stack;
      }
    }
    
    this.error(source, 'Exception caught', context);
  },
  
  /**
   * Set log level (filter logs below this level)
   * @param {string} level - One of LOG_LEVELS
   */
  setLevel: function(level) {
    if (LOG_LEVEL_PRIORITY[level] !== undefined) {
      CURRENT_LOG_LEVEL = level;
      this.info('Logger', 'Log level set to ' + level);
    } else {
      this.warn('Logger', 'Invalid log level: ' + level);
    }
  },
  
  /**
   * Log section header (untuk grouping related logs)
   * @param {string} title
   */
  section: function(title) {
    Logger.log('');
    Logger.log('▶ ' + title);
    Logger.log('─'.repeat(60));
  }
};

// ============================================================================
// POLYFILL: padStart (for older Apps Script V8)
// ============================================================================

if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(padString || ' ');
    
    if (this.length >= targetLength) {
      return String(this);
    }
    
    targetLength = targetLength - this.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return padString.slice(0, targetLength) + String(this);
  };
}

if (!String.prototype.padEnd) {
  String.prototype.padEnd = function(targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(padString || ' ');
    
    if (this.length >= targetLength) {
      return String(this);
    }
    
    targetLength = targetLength - this.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return String(this) + padString.slice(0, targetLength);
  };
}

if (!String.prototype.repeat) {
  String.prototype.repeat = function(count) {
    if (count < 0) throw new RangeError('Invalid count');
    var result = '';
    var str = String(this);
    while (count > 0) {
      if (count & 1) result += str;
      count >>= 1;
      if (count) str += str;
    }
    return result;
  };
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test Logger functions
 * Run this to verify Logger.gs works
 */
function testLogger() {
  Log.separator('Testing Logger.gs');
  
  // Test different log levels
  Log.debug('testLogger', 'This is DEBUG message', {param1: 'value1'});
  Log.info('testLogger', 'This is INFO message', {count: 42});
  Log.warn('testLogger', 'This is WARN message');
  Log.error('testLogger', 'This is ERROR message', {error_code: 'TEST_001'});
  Log.critical('testLogger', 'This is CRITICAL message');
  
  // Test timer
  Log.section('Testing Performance Timer');
  var timer = Log.startTimer('testLogger.performanceTest');
  Utilities.sleep(100); // Sleep 100ms
  timer.end('Test operation completed');
  
  // Test enter/exit
  Log.section('Testing Function Entry/Exit');
  var t2 = Log.enter('testFunction', {input: 'test'});
  Utilities.sleep(50);
  Log.exit(t2, 'success', {output: 'done'});
  
  // Test exception
  Log.section('Testing Exception Logging');
  try {
    throw new Error('Test error for logging');
  } catch (e) {
    Log.exception('testLogger', e, {operation: 'test'});
  }
  
  // Test context with various types
  Log.section('Testing Context Formatting');
  Log.info('testLogger', 'Various context types', {
    string: 'hello',
    number: 123,
    boolean: true,
    null_value: null,
    date: new Date(),
    object: {nested: 'value'},
    array: [1, 2, 3]
  });
  
  Log.info('testLogger', '🎉 Logger tests complete');
}