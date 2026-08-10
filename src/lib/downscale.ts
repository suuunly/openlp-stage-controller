/** Longest edge of the cached preview, in CSS pixels. */
const MAX_EDGE = 400;
/** Re-encoded as JPEG: these are photos, and a data URL far smaller than PNG. */
const FORMAT = 'image/jpeg';
/** Enough for a 400px card; below ~0.6 artefacts show on flat backgrounds. */
const QUALITY = 0.7;

/**
 * Shrink a full-size data URL to a small one, and let the original go.
 *
 * `API:get_thumbnail` is misnamed — it returns the full-resolution image, up to
 * 45 MB of base64 for a single photo. Holding several of those on an iPad is
 * how you run a device out of memory mid-service, so the big string is used
 * once and dropped; only the small one is kept.
 *
 * Resolves to '' if the image can't be decoded, so callers fall back to the
 * icon rather than showing a broken frame.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxEdge = MAX_EDGE,
): Promise<string> {
  if (!dataUrl) return '';
  try {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(FORMAT, QUALITY);
  } catch {
    return '';
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode failed'));
    image.src = src;
  });
}
