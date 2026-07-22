import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Returns the % of pixels that differ between two same-size PNG buffers. */
export function diffPercent(prevBuffer, nextBuffer) {
  const prev = PNG.sync.read(prevBuffer);
  const next = PNG.sync.read(nextBuffer);

  if (prev.width !== next.width || prev.height !== next.height) {
    return null; // viewport/layout dimensions changed, not a meaningful pixel diff
  }

  const { width, height } = prev;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(prev.data, next.data, diff.data, width, height, {
    threshold: 0.1,
  });

  return (changedPixels / (width * height)) * 100;
}
