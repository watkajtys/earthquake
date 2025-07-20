import { vi, describe, it, expect, beforeEach } from 'vitest';
import julesTask from './jules-task.js';
import { createScheduledTaskLogger } from '../../src/utils/scheduledTaskLogger.js';

// Mock the logger to prevent actual logging and allow for assertions
vi.mock('../../src/utils/scheduledTaskLogger', () => ({
  createScheduledTaskLogger: vi.fn(() => ({
    logMilestone: vi.fn(),
    logTaskCompletion: vi.fn(),
  })),
}));

describe('julesTask', () => {
  let mockLogger;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Re-initialize the mocked logger for each test to ensure isolation
    mockLogger = {
      logMilestone: vi.fn(),
      logTaskCompletion: vi.fn(),
    };
    createScheduledTaskLogger.mockReturnValue(mockLogger);
  });

  it('should be an object with a scheduled function', () => {
    expect(julesTask).toBeTypeOf('object');
    expect(julesTask.scheduled).toBeTypeOf('function');
  });

  it('should run the scheduled task without errors', async () => {
    const mockController = { scheduledTime: new Date().getTime() };
    const mockEnv = {}; // Mock environment variables if needed
    const mockCtx = { waitUntil: vi.fn() }; // Mock context if needed

    // Execute the scheduled function
    await julesTask.scheduled(mockController, mockEnv, mockCtx);

    // Verify that the logger was created with the correct task name
    expect(createScheduledTaskLogger).toHaveBeenCalledWith('julesTask', mockController.scheduledTime);

    // Verify that the milestone logs were called correctly
    expect(mockLogger.logMilestone).toHaveBeenCalledWith('julesTask started');
    expect(mockLogger.logMilestone).toHaveBeenCalledWith('julesTask finished');

    // Verify that the task completion was logged with a success status
    expect(mockLogger.logTaskCompletion).toHaveBeenCalledWith(true);
  });
});
