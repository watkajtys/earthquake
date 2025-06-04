// src/setupTests.js
// src/setupTests.js
import '@testing-library/jest-dom';
import { vi } from 'vitest'; // Import vi

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

import { expect } from 'vitest';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);
