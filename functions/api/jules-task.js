/**
 * @file functions/api/jules-task.js
 * @description API endpoint for Jules Task data.
 */

export async function onRequestGet(context) {
  const mockData = {
    taskName: "Jules Task",
    lastRun: new Date().toISOString(),
    status: "Completed",
    summary: "Successfully processed 100 items.",
  };

  return new Response(JSON.stringify(mockData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}
