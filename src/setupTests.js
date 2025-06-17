/* globals global */
// src/setupTests.js
// src/setupTests.js
import '@testing-library/jest-dom';
import { vi } from 'vitest'; // Import vi

// Polyfill for requestIdleCallback
if (typeof window !== 'undefined') {
  window.requestIdleCallback = window.requestIdleCallback ||
    function (cb) {
      var start = Date.now();
      return setTimeout(function () {
        cb({
          didTimeout: false,
          timeRemaining: function () {
            return Math.max(0, 50 - (Date.now() - start));
          }
        });
      }, 1);
    };

  window.cancelIdleCallback = window.cancelIdleCallback ||
    function (id) {
      clearTimeout(id);
    };
}

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
