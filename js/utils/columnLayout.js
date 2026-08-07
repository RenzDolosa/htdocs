/**
 * Applies a ColumnConfig's order/visibility/width/"fixed" state to an
 * already-rendered table — moving existing `<th>`/`<td data-col="...">`
 * nodes into position, not regenerating their content. This is
 * deliberate: Manage's and Inventory Assets' row templates are rich
 * (pills, badges, password-reveal, pending-transfer notes, per-cell
 * catalog-validation styling...) and re-deriving all of that from a
 * column key would mean duplicating every cell's rendering logic here
 * too. Moving the DOM nodes that ManageView/InventoryAssetView already
 * built gets the same visible result — reordered, resized, hidden,
 * pinned columns — without a second copy of that logic to keep in sync.
 *
 * Every configurable `<th>`/`<td>` needs a `data-col="key"` attribute
 * matching a ColumnConfig entry's `key`. The leading row-number/select
 * columns and the trailing Actions column are NOT tagged with data-col
 * (they're not configurable — see ColumnConfig's own doc comment) and
 * are left exactly where they are; every configured column is inserted
 * directly before whichever cell has `data-col="actions"` in that row,
 * in `columns` order, so the sequence ends up: [[fixed leading cells]],
 * ...configured columns in order..., [[actions cell]].
 *
 * @param {HTMLTableRowElement} headerRow - the <tr> inside <thead>.
 * @param {HTMLTableRowElement[]|NodeList} bodyRows - every <tr> inside <tbody>.
 * @param {Array<{key:string,width:number,fixed:boolean,visible:boolean}>} columns
 */
export function applyColumnLayout(headerRow, bodyRows, columns) {
  const allRows = [headerRow, ...Array.from(bodyRows || [])].filter(Boolean);

  // Cumulative left offset for sticky ("fixed") columns: starts right
  // after the two always-sticky leading columns (row number + select,
  // 34px each — see css/components.css's own .sn-col/.checkbox-col rules,
  // which this continues rather than duplicates).
  let stickyOffset = 68;
  const fixedKeys = columns.filter((c) => c.visible !== false && c.fixed).map((c) => c.key);
  const lastFixedKey = fixedKeys[fixedKeys.length - 1];

  allRows.forEach((row) => {
    const actionsCell = row.querySelector('[data-col="actions"]');
    let offset = 68;

    columns.forEach((col) => {
      const cell = row.querySelector(`[data-col="${cssEscape(col.key)}"]`);
      if (!cell) return;

      // Always reposition (even hidden columns) so the DOM order stays
      // consistent with `columns` — a column re-shown later doesn't need
      // a special case to end up back in the right place.
      if (actionsCell) row.insertBefore(cell, actionsCell);
      else row.appendChild(cell);

      const visible = col.visible !== false;
      cell.style.display = visible ? '' : 'none';
      if (!visible) return;

      const width = Math.max(40, Number(col.width) || 120);
      cell.style.width = `${width}px`;
      cell.style.minWidth = `${width}px`;
      cell.style.maxWidth = `${width}px`;

      cell.classList.toggle('col-fixed', Boolean(col.fixed));
      cell.classList.toggle('col-fixed-boundary', col.fixed && col.key === lastFixedKey);
      if (col.fixed) {
        cell.style.position = 'sticky';
        cell.style.left = `${offset}px`;
        offset += width;
      } else {
        cell.style.position = '';
        cell.style.left = '';
      }
    });
  });
}

/** Minimal CSS.escape fallback — column keys are always plain camelCase
 * identifiers in practice, but this avoids a broken attribute selector
 * turning into a silent "column not found" if one ever isn't. */
function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
