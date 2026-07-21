import { EventBus } from './EventBus.js';
import { apiGet, apiPost, apiPut, apiDelete, apiRequest } from './apiClient.js';

/**
 * ApiStore is SupabaseStore.js's drop-in replacement, talking to the PHP/
 * MySQL backend (see /api) instead of Supabase directly. Deliberately
 * kept to the exact same public surface — list(), get(id), create(data),
 * update(id, patch), delete(id), clear(), 'change'/'error' events — so
 * every controller/view built around "mutate, then react to the store's
 * 'change' event" (ManageController, InventoryAssetController, etc.)
 * needed zero changes; only js/app.js's instantiation swapped classes.
 *
 * The one real behavioral difference: Supabase's realtime subscription
 * (server pushes changes instantly) has no equivalent in a plain PHP/
 * MySQL stack without adding a whole separate piece of infrastructure
 * (WebSockets, SSE, etc.). This polls instead — refetches the table on an
 * interval when `realtime: true` (the same default SupabaseStore used).
 * Good enough for a small warehouse team; not truly instant like the
 * Supabase version was. See PHP_XAMPP_GUIDE.md if you want to swap this
 * for a push-based mechanism later.
 */
export class ApiStore extends EventBus {
  /**
   * @param {string} table - matches a file under api/resources/ (e.g. 'gadgets' -> api/resources/gadgets.php).
   * @param {(raw: object) => object} [factory]
   * @param {string} [orderBy]
   * @param {boolean} [ascending]
   * @param {boolean} [realtime] - poll for remote changes (default true).
   * @param {number} [pollIntervalMs] - how often to poll (default 5000).
   */
  constructor({ table, factory = (raw) => raw, orderBy = 'createdAt', ascending = false, realtime = true, pollIntervalMs = 5000 }) {
    super();
    this.table = table;
    this.factory = factory;
    this.orderBy = orderBy;
    this.ascending = ascending;
    this.realtimeEnabled = realtime;
    this.pollIntervalMs = pollIntervalMs;
    this.records = [];
    this.ready = false;
    this._pollTimer = null;
  }

  async init() {
    await this._refresh();
    this.ready = true;
    if (this.realtimeEnabled) this._startPolling();
    return this;
  }

  async _refresh() {
    const { data, error } = await apiGet(`/resources/${this.table}.php`, {
      orderBy: this.orderBy,
      orderDir: this.ascending ? 'ASC' : 'DESC'
    });
    if (error) {
      console.error(`ApiStore(${this.table}): failed to load`, error);
      this.emit('error', { type: 'load', error });
      return;
    }
    this.records = (data || []).map(this.factory);
    this.emit('change', { type: 'load' });
  }

  _startPolling() {
    this._pollTimer = setInterval(() => this._refresh(), this.pollIntervalMs);
  }

  /** Stops polling. Call if a store is ever torn down mid-session. */
  unsubscribe() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  list() {
    return [...this.records];
  }

  get(id) {
    return this.records.find((r) => r.id === id) || null;
  }

  create(data) {
    const record = this.factory(data);
    this.records.push(record);
    this.emit('change', { type: 'create', record });

    apiPost(`/resources/${this.table}.php`, this._toRow(record)).then(({ error }) => {
      if (error) {
        console.error(`ApiStore(${this.table}): create failed`, error);
        this.records = this.records.filter((r) => r.id !== record.id);
        this.emit('change', { type: 'create-failed', record });
        this.emit('error', { type: 'create', error, record });
      }
    });

    return record;
  }

  update(id, patch) {
    const record = this.get(id);
    if (!record) return null;
    const previous = { ...record };
    Object.assign(record, patch, { updatedAt: Date.now() });
    this.emit('change', { type: 'update', record });

    apiPut(`/resources/${this.table}.php`, id, this._toRow(record)).then(({ error }) => {
      if (error) {
        console.error(`ApiStore(${this.table}): update failed`, error);
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

    apiDelete(`/resources/${this.table}.php`, id).then(({ error }) => {
      if (error) {
        console.error(`ApiStore(${this.table}): delete failed`, error);
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

    apiRequest('DELETE', `/resources/${this.table}.php`, { params: { all: '1' } }).then(({ error }) => {
      if (error) {
        console.error(`ApiStore(${this.table}): clear failed`, error);
        this.records = previous;
        this.emit('change', { type: 'clear-failed' });
        this.emit('error', { type: 'clear', error });
      }
    });
  }

  /** Own enumerable data properties only — drops prototype methods (addLogEntry, etc.) so the payload sent to the API matches the table's columns. */
  _toRow(record) {
    return { ...record };
  }
}