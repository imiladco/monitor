import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Returns the % of pixels that differ between two same-size PNG buffers. */
export function diffPercent(prevBuffer, nextBuffer) {
  const r = diffImage(prevBuffer, nextBuffer);
  return r ? r.percent : null;
}

/**
 * Compares two same-size PNG buffers and returns both the changed-pixel
 * percentage and a highlighted diff image (PNG buffer). Returns null when the
 * dimensions differ (a layout/viewport change, not a meaningful pixel diff).
 */
export function diffImage(prevBuffer, nextBuffer) {
  const prev = PNG.sync.read(prevBuffer);
  const next = PNG.sync.read(nextBuffer);

  if (prev.width !== next.width || prev.height !== next.height) {
    return null;
  }

  const { width, height } = prev;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(prev.data, next.data, diff.data, width, height, {
    threshold: 0.1,
  });

  return {
    percent: (changedPixels / (width * height)) * 100,
    diffBuffer: PNG.sync.write(diff),
  };
}
