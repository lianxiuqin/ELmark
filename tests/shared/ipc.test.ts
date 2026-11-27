import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/ipc';

describe('IPC_CHANNELS', () => {
  it('defines unique non-empty channel names for all required operations', () => {
    const values = Object.values(IPC_CHANNELS);
    expect(values.length).toBeGreaterThanOrEqual(18);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
