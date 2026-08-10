import { describe, it, expect } from 'vitest';
import {
  buildLiveItem,
  parseReference,
  wireReference,
  buildScriptureItem,
  classifyItem,
  cleanTitle,
  extractSlideText,
  flattenShow,
  formatReference,
  normalizeBible,
  normalizeBibles,
  normalizeOutput,
  normalizeProjects,
  normalizeShowIndex,
} from './api';

/*
 * Every fixture below is a real payload captured from FreeShow on 2026-08-10,
 * trimmed for length. See the Usable fragment *FreeShow RemoteShow protocol
 * (port 5510) — VERIFIED LIVE*.
 */

const SHOWS = {
  e67cdfc268e: { name: 'Unnamed', category: null, quickAccess: {} },
  default: { name: 'Welcome', category: 'presentation', quickAccess: {} },
};

const PROJECTS = [
  {
    id: 'default',
    name: 'Example',
    created: 1640995200000,
    parent: 'default',
    shows: [
      { id: 'default', index: 0 },
      { id: 'section', type: 'section', name: 'Example', notes: 'Write notes here', index: 1 },
    ],
  },
];

const line = (value: string) => ({ align: '', text: [{ value, style: '' }] });

const SHOW_DETAIL = {
  name: 'Welcome',
  category: 'presentation',
  settings: { activeLayout: 'default', template: 'header' },
  slides: {
    one: { group: 'V1', color: null, notes: 'Greet the visitors', items: [{ lines: [line('Welcome!')] }], children: ['1ba4a9bd5f4'] },
    '1ba4a9bd5f4': { group: null, color: null, notes: '', items: [{ lines: [line('Bread bed')] }] },
  },
  layouts: { default: { slides: [{ id: 'one' }] } },
};

describe('normalizeShowIndex', () => {
  it('indexes names and categories by show id', () => {
    const index = normalizeShowIndex(SHOWS);
    expect(index.get('default')).toEqual({ name: 'Welcome', category: 'presentation' });
    expect(index.get('e67cdfc268e')?.category).toBeNull();
  });
});

describe('normalizeProjects', () => {
  it('resolves item names from the show index', () => {
    // Project entries are bare {id, index} — the name only exists in SHOWS.
    const projects = normalizeProjects(PROJECTS, normalizeShowIndex(SHOWS));
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Example');
    expect(projects[0].items[0]).toMatchObject({
      id: 'default',
      title: 'Welcome',
      kind: 'presentation',
    });
  });

  it('keeps section items and their notes', () => {
    const projects = normalizeProjects(PROJECTS, normalizeShowIndex(SHOWS));
    expect(projects[0].items[1]).toMatchObject({
      kind: 'section',
      title: 'Example',
      notes: 'Write notes here',
    });
  });

  it('accepts an id-keyed map as well as an array', () => {
    const projects = normalizeProjects({ p1: { name: 'Sunday', shows: [] } }, new Map());
    expect(projects[0]).toMatchObject({ id: 'p1', name: 'Sunday', items: [] });
  });
});

describe('classifyItem', () => {
  it('trusts FreeShow’s own category first', () => {
    expect(classifyItem({ id: 'x' }, { category: 'song' })).toBe('song');
    expect(classifyItem({ id: 'x' }, { category: 'presentation' })).toBe('presentation');
  });

  it('uses the item type for media and sections', () => {
    expect(classifyItem({ type: 'section' })).toBe('section');
    expect(classifyItem({ type: 'image' })).toBe('image');
    expect(classifyItem({ type: 'pdf' })).toBe('presentation');
  });

  it('falls back to the filename, then to song', () => {
    expect(classifyItem({ name: 'backdrop.JPG' }, { category: null })).toBe('image');
    // Uncategorised shows land in the Songs view rather than vanishing.
    expect(classifyItem({ id: 'x' }, { category: null })).toBe('song');
  });
});

describe('cleanTitle', () => {
  it('strips paths and extensions', () => {
    expect(cleanTitle('media/backdrop.png')).toBe('backdrop');
    expect(cleanTitle('Amazing Grace')).toBe('Amazing Grace');
  });
});

describe('extractSlideText', () => {
  it('reads items ▸ lines ▸ text ▸ value', () => {
    const slide = { items: [{ lines: [line('Amazing grace'), line('how sweet')] }] };
    expect(extractSlideText(slide)).toBe('Amazing grace\nhow sweet');
  });

  it('reads tempItems, which is what scripture uses', () => {
    expect(extractSlideText({ tempItems: [{ lines: [line('Verði ljós!')] }] })).toBe(
      'Verði ljós!',
    );
  });

  it('returns empty string for nothing usable', () => {
    expect(extractSlideText(null)).toBe('');
    expect(extractSlideText({ items: [] })).toBe('');
  });
});

describe('flattenShow', () => {
  it('interleaves parent slides and their children, in layout order', () => {
    // The layout lists only "one"; "Bread bed" is its child. FreeShow counts
    // both, and OUT_DATA.slide.index indexes the flattened sequence.
    const show = flattenShow(SHOW_DETAIL, 'default');
    expect(show?.slides.map((s) => s.text)).toEqual(['Welcome!', 'Bread bed']);
    expect(show?.slides.map((s) => s.index)).toEqual([0, 1]);
  });

  it('carries per-slide groups and notes', () => {
    const show = flattenShow(SHOW_DETAIL, 'default');
    expect(show?.slides[0]).toMatchObject({ group: 'V1', notes: 'Greet the visitors' });
    expect(show?.slides[1].notes).toBe('');
  });

  it('honours settings.activeLayout over whichever layout is first', () => {
    const twoLayouts = {
      ...SHOW_DETAIL,
      settings: { activeLayout: 'alt' },
      layouts: {
        default: { slides: [{ id: 'one' }] },
        alt: { slides: [{ id: '1ba4a9bd5f4' }] },
      },
    };
    expect(flattenShow(twoLayouts, 'default')?.slides.map((s) => s.text)).toEqual([
      'Bread bed',
    ]);
  });

  it('returns null for an empty payload', () => {
    expect(flattenShow({}, 'x')).toBeNull();
  });
});

describe('normalizeOutput', () => {
  it('reads a show position', () => {
    expect(normalizeOutput({ slide: { id: 'default', layout: 'default', index: 1, line: 0 } })).toEqual({
      showId: 'default',
      layoutId: 'default',
      index: 1,
      temporary: false,
    });
  });

  it('flags scripture as temporary rather than treating "temp" as a show id', () => {
    const out = normalizeOutput({ slide: { id: 'temp', tempItems: [] } });
    expect(out.temporary).toBe(true);
    expect(out.showId).toBeNull();
  });
});

describe('buildLiveItem', () => {
  const show = flattenShow(SHOW_DETAIL, 'default')!;

  it('joins position and show into what the views need', () => {
    const live = buildLiveItem(
      { showId: 'default', layoutId: 'default', index: 0, temporary: false },
      show,
    );
    expect(live).toMatchObject({
      id: 'default',
      name: 'Welcome',
      slide: 0,
      total: 2,
      text: 'Welcome!',
      nextText: 'Bread bed',
      notes: 'Greet the visitors',
      group: 'V1',
    });
  });

  it('has no next text on the last slide', () => {
    const live = buildLiveItem(
      { showId: 'default', layoutId: 'default', index: 1, temporary: false },
      show,
    );
    expect(live?.nextText).toBe('');
  });

  it('reports the position even before the show definition arrives', () => {
    const live = buildLiveItem(
      { showId: 'other', layoutId: null, index: 3, temporary: false },
      show,
    );
    expect(live).toMatchObject({ id: 'other', slide: 3, text: '' });
  });

  it('is null while scripture is live', () => {
    expect(
      buildLiveItem({ showId: null, layoutId: null, index: 0, temporary: true }, show),
    ).toBeNull();
  });
});

describe('buildScriptureItem', () => {
  const SCRIPTURE_OUT = {
    slide: {
      id: 'temp',
      tempItems: [{ lines: [line("Gud segði: 'Verði ljós!' Og ljós varð.")] }],
      nextSlides: [[{ lines: [line('Gud sá, at ljósið var gott;')] }]],
      customDynamicValues: {
        scripture_name: 'Victor',
        scripture_book: '1 Mósebók',
        scripture_chapter: '1',
        scripture_reference_full: '1 Mósebók 1:3',
      },
    },
  };

  it('reads the reference and verse text FreeShow inlines into the output', () => {
    const item = buildScriptureItem(SCRIPTURE_OUT);
    expect(item).toMatchObject({
      id: null,
      name: 'Victor',
      scriptureRef: '1 Mósebók 1:3',
      text: "Gud segði: 'Verði ljós!' Og ljós varð.",
      nextText: 'Gud sá, at ljósið var gott;',
    });
  });

  it('is null when a show is live', () => {
    expect(buildScriptureItem({ slide: { id: 'default', index: 0 } })).toBeNull();
  });
});

describe('scripture browsing', () => {
  const SCRIPTURE = {
    kjv: { name: 'King James (Authorised) Version', api: true },
    '6ef117816db': { name: 'Victor', api: false },
  };

  it('separates local bibles from online ones', () => {
    const bibles = normalizeBibles(SCRIPTURE);
    expect(bibles).toContainEqual({ id: '6ef117816db', name: 'Victor', online: false });
    expect(bibles.find((b) => b.id === 'kjv')?.online).toBe(true);
  });

  it('normalises the Faroese bible tree, verse text included', () => {
    const bible = normalizeBible({
      id: '6ef117816db',
      bible: {
        name: 'Victor',
        metadata: { title: 'Victor', language: 'fo' },
        books: [
          {
            number: 1,
            name: '1 Mósebók',
            id: 'GEN',
            chapters: [
              { number: 1, verses: [{ number: 1, text: 'Í upphavi skapti Gud himmal og jørð.' }] },
            ],
          },
        ],
      },
    });
    expect(bible?.language).toBe('fo');
    expect(bible?.books[0]).toMatchObject({ name: '1 Mósebók', key: 'GEN' });
    expect(bible?.books[0].chapters[0].verses[0].text).toMatch(/^Í upphavi/);
  });

  it('returns null when there is no bible in the payload', () => {
    expect(normalizeBible({ id: 'x' })).toBeNull();
  });
});

describe('references', () => {
  const VICTOR = {
    id: '6ef117816db',
    name: 'Victor',
    language: 'fo',
    books: [
      { number: 1, name: '1 Mósebók', key: 'GEN', chapters: [] },
      { number: 43, name: 'Jóhannes', key: 'JHN', chapters: [] },
    ],
  };

  it('formats a human-readable reference for the UI', () => {
    expect(formatReference('Jóhannes', 3, 16)).toBe('Jóhannes 3:16');
    expect(formatReference('1 Mósebók', 1)).toBe('1 Mósebók 1');
  });

  it('builds the numeric form start_scripture actually wants', () => {
    // Sending "1 Mósebók 1:3" shows the right book but silently lands on 1:1 —
    // FreeShow only honours book.chapter.verse as numbers.
    expect(wireReference(1, 1, 3)).toBe('1.1.3');
  });

  it('resolves a typed reference against the loaded bible', () => {
    expect(parseReference('1 Mósebók 1:3', VICTOR)).toEqual({
      wire: '1.1.3',
      display: '1 Mósebók 1:3',
    });
  });

  it('accepts an abbreviated Faroese book name', () => {
    expect(parseReference('Jóh 3:16', VICTOR)?.wire).toBe('43.3.16');
  });

  it('defaults to verse 1 when only a chapter is given', () => {
    expect(parseReference('Jóhannes 3', VICTOR)?.wire).toBe('43.3.1');
  });

  it('returns null for an unknown book, which drives the error state', () => {
    expect(parseReference('Nonsense 3:16', VICTOR)).toBeNull();
    expect(parseReference('gibberish', VICTOR)).toBeNull();
    expect(parseReference('Jóh 3:16', null)).toBeNull();
  });
});
