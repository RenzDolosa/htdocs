/**
 * Processes `items` a small chunk at a time, yielding back to the browser
 * (via requestAnimationFrame) between chunks instead of running the whole
 * loop in one synchronous block. Two things that buys us for CSV import:
 *
 *   1. The tab stays responsive on a large file instead of freezing for
 *      however long the full parse-and-create loop takes.
 *   2. `onProgress` actually gets a chance to paint between calls — fired
 *      once per synchronous loop (as it would be with a plain forEach)
 *      the browser just coalesces every update into the single repaint
 *      that happens after the whole thing finishes, so a "progress bar"
 *      driven that way only ever visibly jumps straight to 100%.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => void} fn - run once per item, in order.
 * @param {object} [opts]
 * @param {number} [opts.chunkSize] - items processed per animation frame.
 * @param {(done: number, total: number) => void} [opts.onProgress] - called after every chunk.
 * @returns {Promise<void>} resolves once every item has been processed.
 */
export function processInChunks(items, fn, { chunkSize = 25, onProgress } = {}) {
  return new Promise((resolve) => {
    const total = items.length;
    let index = 0;

    if (total === 0) {
      onProgress?.(0, 0);
      resolve();
      return;
    }

    function step() {
      const end = Math.min(index + chunkSize, total);
      for (; index < end; index++) {
        fn(items[index], index);
      }
      onProgress?.(index, total);
      if (index < total) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(step);
  });
}
