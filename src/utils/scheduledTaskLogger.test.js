/**
 * @file src/utils/scheduledTaskLogger.test.js
 * @description Tests for the enhanced scheduled task logger
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduledTaskLogger, createScheduledTaskLogger } from './scheduledTaskLogger.js';

describe('ScheduledTaskLogger', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('ScheduledTaskLogger initialization', () => {
    it('should initialize with task name and scheduled time', () => {
      const scheduledTime = Date.now();
      const logger = new ScheduledTaskLogger('test-task', scheduledTime);

      expect(logger.taskName).toBe('test-task');
      expect(logger.scheduledTime).toBe(scheduledTime);
      expect(logger.executionId).toMatch(/^test-task-/);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] TASK_START',
        expect.objectContaining({
          executionId: expect.any(String),
          scheduledTime: new Date(scheduledTime).toISOString(),
          actualStartTime: expect.any(String)
        })
      );
    });

    it('should initialize without scheduled time', () => {
      const logger = new ScheduledTaskLogger('test-task');

      expect(logger.taskName).toBe('test-task');
      expect(logger.scheduledTime).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] TASK_START',
        expect.objectContaining({
          executionId: expect.any(String),
          scheduledTime: 'N/A',
          startDelay: null
        })
      );
    });
  });

  describe('Logging methods', () => {
    let logger;

    beforeEach(() => {
      logger = new ScheduledTaskLogger('test-task');
      consoleLogSpy.mockClear(); // Clear the task start log
    });

    it('should log API calls with metrics', () => {
      const startTime = Date.now();
      const endTime = startTime + 1000;

      logger.logApiCall('https://api.example.com', startTime, endTime, 200, 1024, 'GET');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] API_CALL',
        expect.objectContaining({
          apiUrl: 'https://api.example.com',
          method: 'GET',
          duration: 1000,
          statusCode: 200,
          responseSize: 1024,
          callNumber: 1
        })
      );
      expect(logger.metrics.apiCalls).toBe(1);
    });

    it('should log database operations', () => {
      logger.logDbOperation('INSERT', 'EarthquakeEvents', 5, 250, true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] DB_OPERATION',
        expect.objectContaining({
          operation: 'INSERT',
          table: 'EarthquakeEvents',
          recordsAffected: 5,
          duration: 250,
          success: true,
          operationNumber: 1
        })
      );
      expect(logger.metrics.dbOperations).toBe(1);
    });

    it('should log KV operations', () => {
      logger.logKvOperation('PUT', 'test-key', 2048, 150, true);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] KV_OPERATION',
        expect.objectContaining({
          operation: 'PUT',
          key: 'test-key',
          dataSize: 2048,
          duration: 150,
          success: true,
          operationNumber: 1
        })
      );
      expect(logger.metrics.kvOperations).toBe(1);
    });

    it('should log data processing with details', () => {
      logger.logDataProcessing('feature-comparison', 100, 25, 300, { newFeatures: 10, updatedFeatures: 15 });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] DATA_PROCESSING',
        expect.objectContaining({
          processType: 'feature-comparison',
          inputCount: 100,
          outputCount: 25,
          duration: 300,
          details: { newFeatures: 10, updatedFeatures: 15 }
        })
      );
      expect(logger.metrics.dataProcessed).toBe(25);
    });

    it('should log errors with context', () => {
      const error = new Error('Test error');
      logger.logError('API_ERROR', error, { apiUrl: 'https://api.example.com' }, false);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[test-task] ERROR',
        expect.objectContaining({
          errorType: 'API_ERROR',
          errorMessage: 'Test error',
          errorStack: expect.stringContaining('Error: Test error'),
          errorContext: { apiUrl: 'https://api.example.com' },
          fatal: false,
          errorNumber: 1
        })
      );
      expect(logger.metrics.errorsEncountered).toBe(1);
    });

    it('should log milestones', () => {
      logger.logMilestone('Data processing completed', { recordsProcessed: 100 });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] MILESTONE',
        expect.objectContaining({
          milestone: 'Data processing completed',
          data: { recordsProcessed: 100 },
          elapsedTime: expect.any(Number)
        })
      );
    });
  });

  describe('Task completion', () => {
    it('should log successful task completion with metrics', () => {
      const logger = new ScheduledTaskLogger('test-task');
      consoleLogSpy.mockClear();

      // Add some metrics
      logger.logApiCall('https://api.example.com', Date.now(), Date.now() + 100, 200);
      logger.logDbOperation('INSERT', 'test_table', 1, 50, true);

      logger.logTaskCompletion(true, { message: 'Task completed successfully' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] TASK_COMPLETE',
        expect.objectContaining({
          success: true,
          totalDuration: expect.any(Number),
          metrics: expect.objectContaining({
            apiCalls: 1,
            dbOperations: 1
          }),
          finalResults: { message: 'Task completed successfully' }
        })
      );

      // Should also log execution summary
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] EXECUTION_SUMMARY',
        expect.objectContaining({
          taskName: 'test-task',
          totalDuration: expect.any(Number),
          performanceMetrics: expect.any(Object),
          resourceUtilization: expect.any(Object)
        })
      );
    });

    it('should log failed task completion', () => {
      const logger = new ScheduledTaskLogger('test-task');
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();

      logger.logTaskCompletion(false, { error: 'Task failed' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[test-task] TASK_COMPLETE',
        expect.objectContaining({
          success: false,
          finalResults: { error: 'Task failed' }
        })
      );
    });
  });

  describe('Timer functionality', () => {
    it('should create and use timers correctly', () => {
      const logger = new ScheduledTaskLogger('test-task');
      consoleLogSpy.mockClear();

      const timer = logger.createTimer('test-operation');
      
      // Simulate some delay
      const result = timer({ testData: 'value' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[test-task] TIMER',
        expect.objectContaining({
          operationName: 'test-operation',
          duration: expect.any(Number),
          testData: 'value'
        })
      );
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createScheduledTaskLogger helper', () => {
    it('should create a logger instance', () => {
      const logger = createScheduledTaskLogger('helper-test');
      
      expect(logger).toBeInstanceOf(ScheduledTaskLogger);
      expect(logger.taskName).toBe('helper-test');
    });
  });
});