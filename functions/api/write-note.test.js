// functions/api/write-note.test.js

import { onRequestPost } from './write-note.POST.js';

describe('write-note.POST', () => {
  it('should return 400 if note is missing', async () => {
    const request = new Request('http://localhost/api/write-note', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const context = { request, env: {} };
    const response = await onRequestPost(context);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('Missing note in request body.');
  });

  it('should return 500 if database is not available', async () => {
    const request = new Request('http://localhost/api/write-note', {
      method: 'POST',
      body: JSON.stringify({ note: 'Test note' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const context = { request, env: {} };
    const response = await onRequestPost(context);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Database binding not available.');
  });

  it('should return 200 on successful write', async () => {
    const request = new Request('http://localhost/api/write-note', {
      method: 'POST',
      body: JSON.stringify({ note: 'Test note' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const mockDb = {
      prepare: jest.fn().mockReturnThis(),
      bind: jest.fn().mockReturnThis(),
      run: jest.fn().mockResolvedValue({}),
    };

    const context = { request, env: { DB: mockDb } };
    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(mockDb.prepare).toHaveBeenCalledWith('INSERT INTO notes (timestamp, note) VALUES (?, ?)');
    expect(mockDb.bind).toHaveBeenCalledWith(expect.any(Number), 'Test note');
    expect(mockDb.run).toHaveBeenCalled();
  });
});
