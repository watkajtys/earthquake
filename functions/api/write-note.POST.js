// functions/api/write-note.POST.js

import { writeNoteToD1 } from '../utils/writeUtils.js';

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { note } = await request.json();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Missing note in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await writeNoteToD1(env.DB, note);

    if (result.success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
