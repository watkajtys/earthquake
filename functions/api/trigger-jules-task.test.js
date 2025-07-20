import { vi, describe, it, expect, beforeEach } from 'vitest';
import { onRequestPost } from './trigger-jules-task.js';

describe('trigger-jules-task', () => {
  let mockContext;

  beforeEach(() => {
    mockContext = {
      env: {
        JULES_TASK: {
          fetch: vi.fn(),
        },
      },
    };
  });

  it('should trigger the julesTask and return a successful response', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    mockContext.env.JULES_TASK.fetch.mockResolvedValue(mockResponse);

    const response = await onRequestPost(mockContext);
    const data = await response.json();

    expect(mockContext.env.JULES_TASK.fetch).toHaveBeenCalledWith('http://localhost/jules-task');
    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
  });

  it('should return an error response if the task trigger fails', async () => {
    const mockError = new Error('Task failed');
    mockContext.env.JULES_TASK.fetch.mockRejectedValue(mockError);

    const response = await onRequestPost(mockContext);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      error: 'Internal server error',
      message: 'Failed to trigger julesTask',
      details: mockError.message,
    });
  });
});
