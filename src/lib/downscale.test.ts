import { describe, it, expect, vi, afterEach } from 'vitest';
import { downscaleDataUrl } from './downscale';

/*
 * The Images view's icon fallback depends entirely on this returning '' rather
 * than throwing or handing back something broken — so the graceful-degradation
 * paths are what matter here. jsdom can't decode a real photo, but every
 * failure branch is reachable without one.
 */

afterEach(() => vi.restoreAllMocks());

/** Make `img.src = …` resolve or reject without a real decode. */
function stubImageLoad(outcome: 'load' | 'error', size = { width: 800, height: 600 }) {
  vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(function (
    this: HTMLImageElement,
  ) {
    if (outcome === 'load') {
      Object.defineProperty(this, 'naturalWidth', { value: size.width, configurable: true });
      Object.defineProperty(this, 'width', { value: size.width, configurable: true });
      Object.defineProperty(this, 'height', { value: size.height, configurable: true });
    }
    setTimeout(() =>
      outcome === 'load' ? this.onload?.(new Event('load')) : this.onerror?.(new Event('error')),
    );
  });
}

describe('downscaleDataUrl', () => {
  it('is empty for empty input, without touching the DOM', async () => {
    expect(await downscaleDataUrl('')).toBe('');
  });

  it('is empty when the image cannot be decoded', async () => {
    stubImageLoad('error');
    expect(await downscaleDataUrl('data:image/png;base64,zzz')).toBe('');
  });

  it('is empty when there is no 2d context, rather than throwing', async () => {
    stubImageLoad('load');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(await downscaleDataUrl('data:image/png;base64,AAAA')).toBe('');
  });

  it('shrinks the longest edge to the cap and keeps the aspect ratio', async () => {
    stubImageLoad('load', { width: 4000, height: 2000 });
    let drawnTo: { width: number; height: number } | null = null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return { drawImage: () => (drawnTo = { width: this.width, height: this.height }) } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,small');

    // A 45 MB photo must not be held at full size on an iPad.
    expect(await downscaleDataUrl('data:image/png;base64,AAAA', 400)).toBe(
      'data:image/jpeg;base64,small',
    );
    expect(drawnTo).toEqual({ width: 400, height: 200 });
  });

  it('never scales a small image up', async () => {
    stubImageLoad('load', { width: 120, height: 90 });
    let drawnTo: { width: number; height: number } | null = null;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return { drawImage: () => (drawnTo = { width: this.width, height: this.height }) } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,x');

    await downscaleDataUrl('data:image/png;base64,AAAA', 400);
    expect(drawnTo).toEqual({ width: 120, height: 90 });
  });
});
