/**
 * Manages one table's column configuration — visibility, width, "fixed"
 * (pinned/sticky) state, and display order — persisted to localStorage
 * under `storageKey`. Deliberately a plain client-side display
 * preference rather than something synced through Supabase: which
 * columns you personally like visible and how wide isn't warehouse data
 * anyone else needs to see, it's just how *your* browser shows the grid.
 *
 * `defaultColumns` is the full, ordered list of configurable columns for
 * this table: `{ key, label, width, fixed }[]`. The very first column a
 * table renders (the row-number/select column) is NOT part of this list —
 * it's always present and never configurable, same as Actions at the end
 * (see ColumnConfigPanel's own doc comment for why those two are handled
 * separately rather than as regular rows here).
 */
export class ColumnConfig {
  constructor(storageKey, defaultColumns) {
    this.storageKey = storageKey;
    this.defaultColumns = defaultColumns.map((c) => ({ visible: true, fixed: false, ...c }));
    this.columns = this._load();
  }

  /**
   * Reads the saved config and reconciles it against defaultColumns —
   * this is what keeps a stored config from previous a app version safe
   * to load after columns were added, renamed, or removed in later code:
   * a saved column whose key no longer exists is dropped, and a default
   * column with no saved entry (new since the person last saved) is
   * appended at the end in its default state, rather than either
   * crashing or silently vanishing.
   */
  _load() {
    let saved = null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    if (!Array.isArray(saved) || saved.length === 0) {
      return this.defaultColumns.map((c) => ({ ...c }));
    }

    const defaultsByKey = new Map(this.defaultColumns.map((c) => [c.key, c]));
    const savedKeys = new Set();
    const merged = [];
    saved.forEach((entry) => {
      const def = defaultsByKey.get(entry?.key);
      if (!def) return; // column no longer exists — drop it
      savedKeys.add(def.key);
      merged.push({
        key: def.key,
        label: def.label, // label always comes from code, not storage — a later rename should show up immediately
        width: Number.isFinite(entry.width) ? entry.width : def.width,
        fixed: Boolean(entry.fixed),
        visible: entry.visible !== false
      });
    });
    // Anything in defaultColumns that wasn't in the saved list is new
    // since this person last saved — append it, visible, in its default
    // state, rather than leaving it undiscoverable.
    this.defaultColumns.forEach((def) => {
      if (!savedKeys.has(def.key)) merged.push({ ...def });
    });
    return merged;
  }

  /** Current column list, in display order. Callers should treat this as read-only — use save() to persist changes. */
  get() {
    return this.columns;
  }

  save(columns) {
    this.columns = columns.map((c) => ({ key: c.key, label: c.label, width: c.width, fixed: Boolean(c.fixed), visible: c.visible !== false }));
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.columns));
    } catch {
      // Storage full or unavailable (private browsing, etc.) — the config
      // still applies for this session via this.columns, it just won't
      // persist across reloads. Not worth surfacing as an error for a
      // display preference.
    }
    return this.columns;
  }

  reset() {
    this.columns = this.defaultColumns.map((c) => ({ ...c }));
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // See save()'s own comment.
    }
    return this.columns;
  }
}
