/**
 * @file functions/api/trigger-jules-task.js
 * @description API endpoint to trigger the julesTask.
 */

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const response = await env.JULES_TASK.fetch('http://localhost/jules-task');
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[trigger-jules-task] Error triggering task:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'Failed to trigger julesTask',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
