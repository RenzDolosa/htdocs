import { qsa } from '../utils/dom.js';
import { pageList } from '../utils/pagination.js';

/**
 * Renders the standard grid-footer-right pagination controls — page-size
 * select, prev/next arrows, numbered page buttons, and the "Go to" box —
 * shared by every paginated table in the app. Feature views (ManageView,
 * InventoryAssetView, UserAccountView, ...) call this from their own
 * renderFooter() instead of each re-implementing the same page-button/
 * goto-input wiring, which used to drift slightly out of sync between
 * copies. Anything left-of-pagination in a footer (a "Checked N" bulk-
 * selection count, a plain result count, ...) is feature-specific and
 * stays in each view — this only owns the paging controls themselves.
 *
 * @param {object} refs - { pageSizeSelect, prevPageBtn, nextPageBtn, pageNumbers, gotoPageInput, gotoPageBtn }
 * @param {object} info - { page, pageSize, totalPages }
 * @param {object} handlers - { onPageSizeChange(size), onPrevPage(), onNextPage(), onPageClick(page), onGotoPage(page) }
 */
export function renderPagination(refs, info, handlers) {
  const { page, pageSize, totalPages } = info;

  refs.pageSizeSelect.value = String(pageSize);
  refs.pageSizeSelect.onchange = (e) => handlers.onPageSizeChange(Number(e.target.value));

  refs.prevPageBtn.disabled = page <= 1;
  refs.prevPageBtn.onclick = () => handlers.onPrevPage();
  refs.nextPageBtn.disabled = page >= totalPages;
  refs.nextPageBtn.onclick = () => handlers.onNextPage();

  refs.pageNumbers.innerHTML = pageList(page, totalPages).map((entry) =>
    entry === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button tabindex="-1" type="button" class="page-btn${entry === page ? ' active' : ''}" data-page="${entry}">${entry}</button>`
  ).join('');
  qsa('.page-btn', refs.pageNumbers).forEach((btn) => {
    btn.addEventListener('click', () => handlers.onPageClick(Number(btn.getAttribute('data-page'))));
  });

  refs.gotoPageInput.max = String(totalPages);
  refs.gotoPageInput.value = String(page);
  refs.gotoPageBtn.onclick = () => {
    const target = Number(refs.gotoPageInput.value);
    if (!target || target < 1 || target > totalPages) return;
    handlers.onGotoPage(target);
  };
}
