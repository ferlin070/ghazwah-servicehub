import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location.href to prevent jsdom navigation errors
let mockHref = 'http://localhost/';
Object.defineProperty(window, 'location', {
  value: {
    get href() { return mockHref; },
    set href(v: string) { mockHref = v; },
  },
  writable: true,
});

// Mock fetch — individual tests override with their own mockFn
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as Response),
) as unknown as typeof fetch;
