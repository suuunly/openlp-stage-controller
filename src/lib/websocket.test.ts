import { describe, it, expect } from 'vitest';
import { parseMessage } from './websocket';

describe('parseMessage', () => {
  it('parses a known event inside a results envelope', () => {
    const ev = parseMessage(JSON.stringify({ results: { type: 'slidecontroller_changed', slide: 3 } }));
    expect(ev).toEqual({ type: 'slidecontroller_changed', data: { type: 'slidecontroller_changed', slide: 3 } });
  });

  it('parses a top-level typed event', () => {
    const ev = parseMessage(JSON.stringify({ type: 'blank_changed', display: 'blank' }));
    expect(ev?.type).toBe('blank_changed');
    expect(ev?.data.display).toBe('blank');
  });

  it('returns null for unknown event types and non-JSON', () => {
    expect(parseMessage(JSON.stringify({ type: 'something_else' }))).toBeNull();
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(42 as unknown)).toBeNull();
  });
});
