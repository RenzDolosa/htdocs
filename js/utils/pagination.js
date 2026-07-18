/**
 * Builds a compact page-number list: 1, the current page's immediate
 * neighbors, and the last page, with '…' filling any gaps. Used by every
 * paginated grid footer in the app.
 */
export function pageList(current, total) {
  const delta = 1;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
  }
  const withDots = [];
  let last = null;
  range.forEach((i) => {
    if (last !== null) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last > 2) withDots.push('…');
    }
    withDots.push(i);
    last = i;
  });
  return withDots;
}
