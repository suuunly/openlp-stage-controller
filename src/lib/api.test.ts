import { describe, it, expect, vi } from 'vitest';
import {
  actionUrl,
  classifyItem,
  extractSlideText,
  isSendOnly,
  normalizeLiveItem,
  normalizeProjects,
  nextSlide,
  readOutputActive,
  resetTransportState,
  sendAction,
  stripHtml,
  unwrap,
} from './api';

const CONN = { host: '10.0.0.5', port: '5506' };

describe('actionUrl', () => {
  it('builds an action-based GET, not a path', () => {
    expect(actionUrl('next_slide', undefined, CONN)).toBe(
      'http://10.0.0.5:5506/?action=next_slide',
    );
  });

  it('serialises data into the `data` query param', () => {
    const url = new URL(actionUrl('index_select_slide', { index: 3 }, CONN));
    expect(url.searchParams.get('action')).toBe('index_select_slide');
    expect(JSON.parse(url.searchParams.get('data') ?? '')).toEqual({ index: 3 });
  });

  it('drops undefined optional fields rather than sending nulls', () => {
    const url = new URL(
      actionUrl('index_select_slide', { index: 0, showId: undefined }, CONN),
    );
    expect(JSON.parse(url.searchParams.get('data') ?? '')).toEqual({ index: 0 });
  });
});

describe('sendAction', () => {
  it('parses a JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '{"a":1}' }),
    );
    await expect(sendAction('get_output', undefined, CONN)).resolves.toEqual({ a: 1 });
  });

  it('throws for a query the browser will not let us read', async () => {
    await expect(sendAction('get_output', undefined, CONN)).rejects.toThrow(
      /Cannot reach FreeShow/,
    );
  });

  it('replays a blocked command opaquely so controls still work', async () => {
    resetTransportState();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ type: 'opaque' });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendAction('next_slide', undefined, CONN)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ mode: 'no-cors' });
    expect(isSendOnly()).toBe(true);
    resetTransportState();
  });

  it('gives up when even the opaque replay fails', async () => {
    resetTransportState();
    await expect(nextSlide()).rejects.toThrow(/Cannot reach FreeShow/);
    expect(isSendOnly()).toBe(false);
  });
});

describe('unwrap', () => {
  it('peels transport envelopes', () => {
    expect(unwrap({ action: 'get_slide', data: { name: 'x' } })).toEqual({ name: 'x' });
    expect(unwrap({ results: [1, 2] })).toEqual([1, 2]);
  });

  it('leaves a payload that merely has a `data` field alone', () => {
    const payload = { name: 'Slide', data: 'keep me' };
    expect(unwrap(payload)).toBe(payload);
  });
});

describe('classifyItem', () => {
  it('uses the explicit type first', () => {
    expect(classifyItem({ type: 'image' })).toBe('image');
    expect(classifyItem({ type: 'section' })).toBe('section');
    expect(classifyItem({ type: 'pdf' })).toBe('presentation');
  });

  it('falls back to the category, then the filename', () => {
    expect(classifyItem({ category: 'song' })).toBe('song');
    expect(classifyItem({ name: 'backdrop.JPG' })).toBe('image');
    expect(classifyItem({ name: 'sermon.pptx' })).toBe('presentation');
  });

  it('treats a bare show as a song — a service is mostly songs', () => {
    expect(classifyItem({ type: 'show', name: 'Amazing Grace' })).toBe('song');
  });
});

describe('normalizeProjects', () => {
  it('normalises an array of projects with their items', () => {
    const projects = normalizeProjects({
      data: [
        {
          id: 'p1',
          name: 'Sunday',
          shows: [
            { id: 's1', name: 'Amazing Grace', type: 'show' },
            { id: 'i1', name: 'assets/backdrop.png', type: 'image' },
          ],
        },
      ],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Sunday');
    expect(projects[0].items.map((i) => i.kind)).toEqual(['song', 'image']);
    // Filename-ish titles lose their path and extension.
    expect(projects[0].items[1].title).toBe('backdrop');
  });

  it('accepts an id-keyed map', () => {
    const projects = normalizeProjects({ p9: { name: 'Evening', shows: [] } });
    expect(projects).toEqual([
      { id: 'p9', name: 'Evening', items: [], active: false },
    ]);
  });

  it('accepts a single project object', () => {
    const projects = normalizeProjects({ id: 'p1', name: 'Sunday', shows: [] });
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('p1');
  });
});

describe('stripHtml', () => {
  it('converts <br> and block tags to newlines and strips the rest', () => {
    const html = '<p>Amazing grace<br>how sweet</p><p>the sound</p>';
    expect(stripHtml(html)).toBe('Amazing grace\nhow sweet\nthe sound');
  });

  it('decodes common entities', () => {
    expect(stripHtml('Bless &amp; keep &#39;us&#39;')).toBe("Bless & keep 'us'");
  });
});

describe('extractSlideText', () => {
  it('reads FreeShow’s nested items ▸ lines ▸ text ▸ value shape', () => {
    const slide = {
      items: [
        {
          lines: [
            { text: [{ value: 'Amazing grace, ' }, { value: 'how sweet' }] },
            { text: [{ value: 'the sound' }] },
          ],
        },
      ],
    };
    expect(extractSlideText(slide)).toBe('Amazing grace, how sweet\nthe sound');
  });

  it('falls back to a plain string or an html field', () => {
    expect(extractSlideText('just text')).toBe('just text');
    expect(extractSlideText({ html: '<p>hi<br>there</p>' })).toBe('hi\nthere');
  });

  it('returns empty string for nothing usable', () => {
    expect(extractSlideText(null)).toBe('');
    expect(extractSlideText({ items: [] })).toBe('');
  });
});

describe('normalizeLiveItem', () => {
  it('returns null for empty input', () => {
    expect(normalizeLiveItem(null)).toBeNull();
    expect(normalizeLiveItem({ data: {} })).toBeNull();
    expect(normalizeLiveItem({ data: [] })).toBeNull();
  });

  it('normalises a slide payload with an index', () => {
    const li = normalizeLiveItem({
      data: {
        showId: 'show-1',
        name: 'Amazing Grace',
        index: 2,
        total: 8,
        group: 'V2',
        slide: { items: [{ lines: [{ text: [{ value: 'line one' }] }] }] },
      },
    });
    expect(li).toEqual({
      id: 'show-1',
      kind: null,
      name: 'Amazing Grace',
      slide: 2,
      total: 8,
      text: 'line one',
      tag: 'V2',
    });
  });

  it('treats a numeric `slide` as the index, not the slide body', () => {
    const li = normalizeLiveItem({ showId: 's', name: 'X', slide: 4, total: 6 });
    expect(li?.slide).toBe(4);
  });

  it('normalises an array of slides and finds the selected one', () => {
    const li = normalizeLiveItem([
      { name: 'How Great', text: 'first', selected: false, showId: 'show-2' },
      { name: 'How Great', text: 'second', selected: true, showId: 'show-2' },
    ]);
    expect(li?.id).toBe('show-2');
    expect(li?.slide).toBe(1);
    expect(li?.total).toBe(2);
    expect(li?.text).toBe('second');
  });
});

describe('readOutputActive', () => {
  it('reads a boolean when the payload has one, otherwise null', () => {
    expect(readOutputActive({ enabled: false })).toBe(false);
    expect(readOutputActive({ blank: true })).toBe(false);
    expect(readOutputActive({ something: 1 })).toBeNull();
  });
});
