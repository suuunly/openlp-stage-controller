import { describe, it, expect } from 'vitest';
import { normalizeSlideItems, parseStyle, flattenShow } from './api';

/* Real style strings captured from FreeShow 1.6.4. */

describe('parseStyle', () => {
  it('splits a FreeShow style string into properties', () => {
    expect(parseStyle('top: 30px;left: 30px;width: 1860px;')).toEqual({
      top: '30px',
      left: '30px',
      width: '1860px',
    });
  });

  it('survives junk without throwing', () => {
    expect(parseStyle('nonsense;;: ;')).toEqual({});
    expect(parseStyle(undefined)).toEqual({});
  });
});

describe('normalizeSlideItems', () => {
  const SLIDE = {
    items: [
      {
        style:
          'top: 30px;left: 30px;width: 1860px;height: 865px;background-color: rgb(0 0 0 / 0.4);border-radius: 20px;padding: 25px;',
        align: '',
        lines: [
          {
            align: 'text-align: left;',
            text: [{ value: 'Verði ljós!', style: 'font-size: 80px;font-weight: bold;' }],
          },
        ],
      },
    ],
  };

  it('reads geometry in FreeShow’s 1920x1080 canvas pixels', () => {
    const [item] = normalizeSlideItems(SLIDE);
    expect(item).toMatchObject({ left: 30, top: 30, width: 1860, height: 865, radius: 20, padding: 25 });
  });

  it('keeps the text runs with their size, weight and alignment', () => {
    const [item] = normalizeSlideItems(SLIDE);
    expect(item.lines[0].align).toBe('left');
    expect(item.lines[0].runs[0]).toMatchObject({
      value: 'Verði ljós!',
      fontSize: 80,
      bold: true,
    });
  });

  it('accepts a colour but refuses anything exotic', () => {
    const [ok] = normalizeSlideItems(SLIDE);
    expect(ok.background).toBe('rgb(0 0 0 / 0.4)');

    // FreeShow's raw CSS must never reach the DOM unchecked.
    const [risky] = normalizeSlideItems({
      items: [
        {
          style: 'background-color: url(javascript:alert(1));width: 100px;height: 100px;',
          lines: [{ text: [{ value: 'x' }] }],
        },
      ],
    });
    expect(risky.background).toBeUndefined();
  });

  it('reads scripture’s tempItems too, and drops empty boxes', () => {
    const items = normalizeSlideItems({
      tempItems: [
        { style: 'top: 0px;', lines: [{ text: [{ value: 'Í upphavi' }] }] },
        { style: 'top: 900px;', lines: [{ text: [{ value: '' }] }] },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].lines[0].runs[0].value).toBe('Í upphavi');
  });

  it('is empty for a slide with no usable geometry, so views fall back to text', () => {
    expect(normalizeSlideItems({})).toEqual([]);
  });
});

describe('flattenShow carries geometry through', () => {
  it('attaches items to every flattened slide', () => {
    const show = flattenShow(
      {
        name: 'Welcome',
        settings: { activeLayout: 'l1' },
        slides: {
          one: {
            group: '',
            notes: '',
            items: [{ style: 'top: 10px;', lines: [{ text: [{ value: 'Welcome!' }] }] }],
          },
        },
        layouts: { l1: { slides: [{ id: 'one' }] } },
      },
      'default',
    );
    expect(show?.slides[0].items[0].lines[0].runs[0].value).toBe('Welcome!');
  });
});
