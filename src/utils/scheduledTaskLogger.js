/**
 * @file src/utils/scheduledTaskLogger.js
 * @description Enhanced logging utility for scheduled tasks in Cloudflare Workers.
 * Provides structured logging, performance metrics, error tracking, and execution context.
 */

/**
 * Enhanced logger for scheduled tasks with performance tracking and structured output
 */
export class ScheduledTaskLogger {
  constructor(taskName, scheduledTime = null) {
    this.taskName = taskName;
    this.scheduledTime = scheduledTime;
    this.startTime = Date.now();
    this.executionId = this.generateExecutionId();
    this.metrics = {
      apiCalls: 0,
      dbOperations: 0,
      kvOperations: 0,
      errorsEncountered: 0,
      dataProcessed: 0
    };
    this.context = {};
    this.events = [];
    
    this.logTaskStart();
  }

  /**
   * Generates a unique execution ID for tracking this specific task run
   * @returns {string} Unique execution identifier
   */
  generateExecutionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${this.taskName}-${timestamp}-${random}`;
  }

  /**
   * Adds contextual information about the task execution environment
   * @param {string} key - Context key
   * @param {any} value - Context value
   */
  addContext(key, value) {
    this.context[key] = value;
  }

  /**
   * Records the start of the scheduled task
   */
  logTaskStart() {
    const scheduledTimeStr = this.scheduledTime ? new Date(this.scheduledTime).toISOString() : 'N/A';
    const startTimeStr = new Date(this.startTime).toISOString();
    
    console.log(`[${this.taskName}] TASK_START`, {
      executionId: this.executionId,
      scheduledTime: scheduledTimeStr,
      actualStartTime: startTimeStr,
      startDelay: this.scheduledTime ? this.startTime - this.scheduledTime : null
    });

    this.events.push({
      type: 'TASK_START',
      timestamp: this.startTime,
      scheduledTime: this.scheduledTime,
      delay: this.scheduledTime ? this.startTime - this.scheduledTime : null
    });
  }

  /**
   * Logs an API call with performance metrics
   * @param {string} apiUrl - The API URL being called
   * @param {number} startTime - Start timestamp of the API call
   * @param {number} endTime - End timestamp of the API call
   * @param {number} statusCode - HTTP status code of the response
   * @param {number} responseSize - Size of the response in bytes (optional)
   * @param {string} method - HTTP method (default: GET)
   */
  logApiCall(apiUrl, startTime, endTime, statusCode, responseSize = null, method = 'GET') {
    this.metrics.apiCalls++;
    const duration = endTime - startTime;
    
    const logData = {
      executionId: this.executionId,
      apiUrl,
      method,
      duration,
      statusCode,
      responseSize,
      callNumber: this.metrics.apiCalls
    };

    console.log(`[${this.taskName}] API_CALL`, logData);
    
    this.events.push({
      type: 'API_CALL',
      timestamp: startTime,
      ...logData
    });
  }

  /**
   * Logs database operations with performance metrics
   * @param {string} operation - Type of DB operation (SELECT, INSERT, UPDATE, etc.)
   * @param {string} table - Database table name
   * @param {number} recordsAffected - Number of records affected
   * @param {number} duration - Operation duration in milliseconds
   * @param {boolean} success - Whether the operation was successful
   * @param {string} error - Error message if operation failed
   */
  logDbOperation(operation, table, recordsAffected, duration, success = true, error = null) {
    this.metrics.dbOperations++;
    if (!success) this.metrics.errorsEncountered++;
    
    const logData = {
      executionId: this.executionId,
      operation,
      table,
      recordsAffected,
      duration,
      success,
      error,
      operationNumber: this.metrics.dbOperations
    };

    console.log(`[${this.taskName}] DB_OPERATION`, logData);
    
    this.events.push({
      type: 'DB_OPERATION',
      timestamp: Date.now(),
      ...logData
    });
  }

  /**
   * Logs KV storage operations
   * @param {string} operation - Type of KV operation (GET, PUT, DELETE)
   * @param {string} key - KV key
   * @param {number} dataSize - Size of data in bytes (for PUT operations)
   * @param {number} duration - Operation duration in milliseconds
   * @param {boolean} success - Whether the operation was successful
   * @param {string} error - Error message if operation failed
   */
  logKvOperation(operation, key, dataSize = null, duration, success = true, error = null) {
    this.metrics.kvOperations++;
    if (!success) this.metrics.errorsEncountered++;
    
    const logData = {
      executionId: this.executionId,
      operation,
      key,
      dataSize,
      duration,
      success,
      error,
      operationNumber: this.metrics.kvOperations
    };

    console.log(`[${this.taskName}] KV_OPERATION`, logData);
    
    this.events.push({
      type: 'KV_OPERATION',
      timestamp: Date.now(),
      ...logData
    });
  }

  /**
   * Logs data processing metrics
   * @param {string} processType - Type of processing (parse, filter, transform, etc.)
   * @param {number} inputCount - Number of input items
   * @param {number} outputCount - Number of output items
   * @param {number} duration - Processing duration in milliseconds
   * @param {object} details - Additional processing details
   */
  logDataProcessing(processType, inputCount, outputCount, duration, details = {}) {
    this.metrics.dataProcessed += outputCount;
    
    const logData = {
      executionId: this.executionId,
      processType,
      inputCount,
      outputCount,
      duration,
      details
    };

    console.log(`[${this.taskName}] DATA_PROCESSING`, logData);
    
    this.events.push({
      type: 'DATA_PROCESSING',
      timestamp: Date.now(),
      ...logData
    });
  }

  /**
   * Logs errors with context and stack traces
   * @param {string} errorType - Type/category of error
   * @param {Error|string} error - Error object or message
   * @param {object} errorContext - Additional context about the error
   * @param {boolean} fatal - Whether this error is fatal to the task
   */
  logError(errorType, error, errorContext = {}, fatal = false) {
    this.metrics.errorsEncountered++;
    
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : null;
    
    const logData = {
      executionId: this.executionId,
      errorType,
      errorMessage,
      errorStack,
      errorContext,
      fatal,
      errorNumber: this.metrics.errorsEncountered
    };

    console.error(`[${this.taskName}] ERROR`, logData);
    
    this.events.push({
      type: 'ERROR',
      timestamp: Date.now(),
      ...logData
    });
  }

  /**
   * Logs important milestones during task execution
   * @param {string} milestone - Milestone name/description
   * @param {object} data - Additional milestone data
   */
  logMilestone(milestone, data = {}) {
    const logData = {
      executionId: this.executionId,
      milestone,
      data,
      elapsedTime: Date.now() - this.startTime
    };

    console.log(`[${this.taskName}] MILESTONE`, logData);
    
    this.events.push({
      type: 'MILESTONE',
      timestamp: Date.now(),
      ...logData
    });
  }

  /**
   * Records the completion of the scheduled task with full metrics
   * @param {boolean} success - Whether the task completed successfully
   * @param {object} finalResults - Final results/summary of the task
   */
  logTaskCompletion(success = true, finalResults = {}) {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    
    const completionData = {
      executionId: this.executionId,
      success,
      totalDuration,
      metrics: this.metrics,
      context: this.context,
      finalResults,
      totalEvents: this.events.length
    };

    const logLevel = success ? 'log' : 'error';
    console[logLevel](`[${this.taskName}] TASK_COMPLETE`, completionData);
    
    this.events.push({
      type: 'TASK_COMPLETE',
      timestamp: endTime,
      ...completionData
    });

    // Log summary metrics
    this.logExecutionSummary();
  }

  /**
   * Logs a comprehensive execution summary
   */
  logExecutionSummary() {
    const summary = {
      executionId: this.executionId,
      taskName: this.taskName,
      totalDuration: Date.now() - this.startTime,
      schedulingAccuracy: this.scheduledTime ? (this.startTime - this.scheduledTime) : null,
      performanceMetrics: {
        apiCallsPerSecond: this.metrics.apiCalls / ((Date.now() - this.startTime) / 1000),
        dbOperationsPerSecond: this.metrics.dbOperations / ((Date.now() - this.startTime) / 1000),
        kvOperationsPerSecond: this.metrics.kvOperations / ((Date.now() - this.startTime) / 1000),
        dataProcessingRate: this.metrics.dataProcessed / ((Date.now() - this.startTime) / 1000),
        errorRate: this.metrics.errorsEncountered / (this.metrics.apiCalls + this.metrics.dbOperations + this.metrics.kvOperations || 1)
      },
      resourceUtilization: this.metrics,
      eventTimeline: this.events.map(event => ({
        type: event.type,
        timestamp: event.timestamp,
        relativeTime: event.timestamp - this.startTime
      }))
    };

    console.log(`[${this.taskName}] EXECUTION_SUMMARY`, summary);
  }

  /**
   * Creates a timer function for measuring operation duration
   * @param {string} operationName - Name of the operation being timed
   * @returns {function} Timer function that logs the duration when called
   */
  createTimer(operationName) {
    const startTime = Date.now();
    return (additionalData = {}) => {
      const duration = Date.now() - startTime;
      console.log(`[${this.taskName}] TIMER`, {
        executionId: this.executionId,
        operationName,
        duration,
        ...additionalData
      });
      return duration;
    };
  }
}

/**
 * Helper function to create a new scheduled task logger
 * @param {string} taskName - Name of the scheduled task
 * @param {number} scheduledTime - Scheduled execution time (timestamp)
 * @returns {ScheduledTaskLogger} New logger instance
 */
export function createScheduledTaskLogger(taskName, scheduledTime = null) {
  return new ScheduledTaskLogger(taskName, scheduledTime);
}

/**
 * Decorator function to wrap functions with enhanced logging
 * @param {string} functionName - Name of the function being wrapped
 * @param {ScheduledTaskLogger} logger - Logger instance
 * @returns {function} Decorator function
 */
export function withLogging(functionName, logger) {
  return function(originalFunction) {
    return async function(...args) {
      const timer = logger.createTimer(functionName);
      try {
        logger.logMilestone(`Starting ${functionName}`, { args: args.length });
        const result = await originalFunction.apply(this, args);
        timer({ success: true, resultType: typeof result });
        logger.logMilestone(`Completed ${functionName}`, { success: true });
        return result;
      } catch (error) {
        timer({ success: false, error: error.message });
        logger.logError(`${functionName}_ERROR`, error, { args }, false);
        throw error;
      }
    };
  };
}