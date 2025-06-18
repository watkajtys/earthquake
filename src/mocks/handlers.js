// src/mocks/handlers.js
import { http, HttpResponse } from 'msw';

const d1ApiBasePath = '/api/get-earthquakes';

export const handlers = [
  http.get(`${d1ApiBasePath}`, ({ request }) => {
    const url = new URL(request.url);
    const timeWindow = url.searchParams.get('timeWindow');
    const now = Date.now();
    console.log(`[MSW] Intercepted D1 API call for timeWindow: ${timeWindow}`);

    if (timeWindow === 'day') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-day-generic', properties: { place: 'MSW D1 Day', mag: 1.0, time: now, code: 'msw_day1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    if (timeWindow === 'week') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-week-generic', properties: { place: 'MSW D1 Week', mag: 1.1, time: now - (2 * 24 * 3600 * 1000), code: 'msw_wk1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    if (timeWindow === 'month') {
      return HttpResponse.json( // Return features array directly
        [{ id: 'msw-d1-month-generic', properties: { place: 'MSW D1 Month', mag: 1.2, time: now - (15 * 24 * 3600 * 1000), code: 'msw_mo1' }, geometry: {} }],
        { status: 200, headers: { 'X-Data-Source': 'D1' } }
      );
    }
    // Fallback for unhandled timeWindows or other GETs to this base path
    console.error(`[MSW] Unhandled D1 timeWindow in generic handler: ${timeWindow}`);
    return HttpResponse.json({ error: `Unhandled D1 timeWindow: ${timeWindow}` }, { status: 400 });
  }),
  // Add more handlers here if other non-D1 endpoints need mocking by MSW.
];
