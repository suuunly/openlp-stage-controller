import { describe, it, expect } from 'vitest';
import { normalizeLiveItem, stripHtml } from './api';

describe('stripHtml', () => {
  it('converts <br> and block tags to newlines and strips the rest', () => {
    const html = '<p>Amazing grace<br>how sweet</p><p>the sound</p>';
    expect(stripHtml(html)).toBe('Amazing grace\nhow sweet\nthe sound');
  });

  it('decodes common entities', () => {
    expect(stripHtml('Bless &amp; keep &#39;us&#39;')).toBe("Bless & keep 'us'");
  });
});

describe('normalizeLiveItem', () => {
  it('returns null for empty input', () => {
    expect(normalizeLiveItem(null)).toBeNull();
    expect(normalizeLiveItem({ results: {} })).toBeNull();
    expect(normalizeLiveItem({ results: [] })).toBeNull();
  });

  it('normalizes the object shape inside a results envelope', () => {
    const li = normalizeLiveItem({
      results: {
        item: 'song-1',
        name: 'Amazing Grace',
        slide: 2,
        total: 8,
        html: '<p>line one<br>line two</p>',
        tag: 'V2',
      },
    });
    expect(li).toEqual({
      id: 'song-1',
      plugin: null,
      name: 'Amazing Grace',
      slide: 2,
      total: 8,
      text: 'line one\nline two',
      tag: 'V2',
    });
  });

  it('normalizes the array-of-slides shape and finds the selected slide', () => {
    const li = normalizeLiveItem([
      { title: 'How Great', html: 'first', selected: false, item: 'song-2' },
      { title: 'How Great', html: 'second', selected: true, item: 'song-2' },
    ]);
    expect(li?.id).toBe('song-2');
    expect(li?.slide).toBe(1);
    expect(li?.total).toBe(2);
    expect(li?.text).toBe('second');
    expect(li?.name).toBe('How Great');
  });
});
