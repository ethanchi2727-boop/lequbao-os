import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './outbox.js';

describe('outbox retry policy', () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [5, 16_000],
    [11, 900_000],
    [99, 900_000],
  ])('applies capped exponential backoff for attempt %i', (attempt, expected) => {
    expect(retryDelayMs(attempt)).toBe(expected);
  });

  it('normalizes invalid attempt numbers', () => {
    expect(retryDelayMs(-1)).toBe(1_000);
    expect(retryDelayMs(1.9)).toBe(1_000);
  });
});
