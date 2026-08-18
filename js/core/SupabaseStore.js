import { EventBus } from './EventBus.js';
import { supabase } from './supabaseClient.js';

/**
 * SupabaseStore is a drop-in replacement for Store (see core/Store.js) that
 * persists to a Supabase table instead of localStorage. It keeps the exact
 * same synchronous public API — list(), get(id), create(data), update(id,
 * patch), delete(id), clear(), plus 'change' events — so every existing
 * controller/view (ManageController, InventoryAssetController, etc.) works
 * completely unchanged. They were all already built around "mutate, then
 * react to the store's 'change' event", which is what makes this swap
 * possible without touching feature code.
 *
 * How the sync API meets an async backend:
 *   - `records` is an in-memory cache, exactly like Store.records.
 *   - Reads (list/get) are synchronous, straight from that cache.
 *   - Writes (create/update/delete) mutate the cache and emit 'change'
 *     IMMEDIATELY (optimistic UI — no waiting on the network), then fire the
 *     Supabase request in the background. If that request fails, the cache
 *     is rolled back and another 'change' is emitted so the UI corrects
 *     itself, plus an 'error' event so callers can show a Toast.
 *   - Because the constructor can't be async, call `await store.init()`
 *     once at startup (see app.js) to do the initial fetch. Until that
 *     resolves, list()/get() simply return empty — controllers render once
 *     empty, then again when 'change' fires after init() completes, so
 *     there's no need to restructure controller.init() calls into awaits.
 *   - If `realtime: true` (default), the store also subscribes to Postgres
 *     changes on its table, so edits made by one browser tab/user show up
 *     for everyone else without a manual refresh. Requires the table to be
 *     added to the `supabase_realtime` publication (see supabase/schema.sql).
 */
export class SupabaseStore extends EventBus {
  /**
   * @param {string} table - Supabase table name (e.g. 'gadgets').
   * @param {(raw: object) => object} [factory] - wraps a raw row in a model instance.
   * @param {string} [orderBy] - column to sort by on initial load / refresh.
   * @param {boolean} [ascending]
   * @param {boolean} [realtime] - subscribe to live Postgres changes (default true).
   */
  constructor({ table, factory = (raw) => raw, orderBy = 'createdAt', ascending = false, realtime = true }) {
    super();
    this.table = table;
    this.factory = factory;
    this.orderBy = orderBy;
    this.ascending = ascending;
    this.realtimeEnabled = realtime;
    this.records = [];
    this.ready = false;
    this._channel = null;
  }

  /** Fetches the initial rows from Supabase. Call once at startup, before rendering. */
  async init() {
    if (!supabase) {
      console.error(`SupabaseStore(${this.table}): supabase client isn't configured — see js/core/supabaseConfig.js.`);
      this.emit('error', { type: 'init', error: new Error('Supabase not configured') });
      return this;
    }
    await this._refresh();
    this.ready = true;
    if (this.realtimeEnabled) this._subscribeRealtime();
    return this;
  }

  async _refresh() {
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .order(this.orderBy, { ascending: this.ascending });

    if (error) {
      console.error(`SupabaseStore(${this.table}): failed to load`, error);
      this.emit('error', { type: 'load', error });
      return;
    }
    this.records = (data || []).map(this.factory);
    this.emit('change', { type: 'load' });
  }

  _subscribeRealtime() {
    this._channel = supabase
      .channel(`public:${this.table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: this.table }, () => {
        // Simplicity over cleverness: re-fetch the whole table on any remote
        // change rather than patching the cache row-by-row from the payload.
        this._refresh();
      })
      .subscribe();
  }

  /** Stops the realtime subscription. Call if a store is ever torn down mid-session. */
  unsubscribe() {
    if (this._channel) supabase.removeChannel(this._channel);
    this._channel = null;
  }

  list() {
    return [...this.records];
  }

  get(id) {
    return this.records.find((r) => r.id === id) || null;
  }

  create(data) {
    const { record } = this.createAndWait(data);
    return record;
  }

  /**
   * Same as create(), but also returns `ready` — a Promise resolving to
   * the record once its insert has actually committed on Supabase, or
   * `null` if the insert failed (in which case the optimistic local copy
   * has already been rolled back by the time `ready` resolves, same as
   * plain create()'s existing rollback behavior).
   *
   * Exists for callers sequencing a *second* write that has a foreign
   * key back to this one — e.g. InventoryGadgetSync.js's
   * createGadgetFromInventoryAsset(), which creates a Gadget whose
   * `inventoryAssetId` references this row. Both create() calls used to
   * fire their inserts back-to-back with no ordering guarantee between
   * two independent HTTP requests; when the Gadget's insert reached
   * Postgres before the InventoryAsset's had committed, the FK
   * constraint (`gadgets."inventoryAssetId" references
   * inventory_assets(id)`, see schema.sql) rejected it — and because
   * that failure is indistinguishable from any other create() failure,
   * the optimistic Gadget just silently rolled back off the local list a
   * moment after appearing, with nothing in the UI explaining why it was
   * never actually there. Awaiting `ready` here before firing the
   * dependent insert closes that race instead of hoping the two happen
   * to land in the right order.
   */
  createAndWait(data) {
    const record = this.factory(data);
    this.records.push(record);
    this.emit('change', { type: 'create', record });

    const ready = supabase.from(this.table).insert(this._toRow(record)).then(({ error }) => {
      if (error) {
        console.error(`SupabaseStore(${this.table}): create failed`, error);
        this.records = this.records.filter((r) => r.id !== record.id);
        this.emit('change', { type: 'create-failed', record });
        this.emit('error', { type: 'create', error, record });
        return null;
      }
      return record;
    });

    return { record, ready };
  }

  update(id, patch) {
    const record = this.get(id);
    if (!record) return null;
    const previous = { ...record };
    Object.assign(record, patch);
    // Not every table tracks updatedAt — WarehouseLocation doesn't (see
    // its model: no `this.updatedAt` in the constructor, matching
    // warehouse_locations having no such column). Stamping it
    // unconditionally here used to send `updatedAt` on every update
    // regardless of the target table, which PostgREST rejects outright
    // ("Could not find the 'updatedAt' column ... in the schema cache")
    // — silently failing *every* update to that table. Only touch it
    // when the record already carries the field, so this stays generic
    // across all tables instead of hardcoding table names here.
    if ('updatedAt' in record) record.updatedAt = Date.now();
    this.emit('change', { type: 'update', record });

    supabase.from(this.table).update(this._toRow(record)).eq('id', id).then(({ error }) => {
      if (error) {
        console.error(`SupabaseStore(${this.table}): update failed`, error);
        Object.assign(record, previous);
        this.emit('change', { type: 'update-failed', record });
        this.emit('error', { type: 'update', error, record });
      }
    });

    return record;
  }

  delete(id) {
    const record = this.get(id);
    if (!record) return false;
    this.records = this.records.filter((r) => r.id !== id);
    this.emit('change', { type: 'delete', record });

    supabase.from(this.table).delete().eq('id', id).then(({ error }) => {
      if (error) {
        console.error(`SupabaseStore(${this.table}): delete failed`, error);
        this.records.push(record);
        this.emit('change', { type: 'delete-failed', record });
        this.emit('error', { type: 'delete', error, record });
      }
    });

    return true;
  }

  clear() {
    const previous = this.records;
    this.records = [];
    this.emit('change', { type: 'clear' });

    supabase.from(this.table).delete().not('id', 'is', null).then(({ error }) => {
      if (error) {
        console.error(`SupabaseStore(${this.table}): clear failed`, error);
        this.records = previous;
        this.emit('change', { type: 'clear-failed' });
        this.emit('error', { type: 'clear', error });
      }
    });
  }

  /** Own enumerable data properties only — drops prototype methods (addLogEntry, etc.) so the row sent to Supabase matches the table's columns. */
  _toRow(record) {
    return { ...record };
  }
}
