import { EventBus } from './EventBus.js';

/**
 * Store is a generic CRUD repository persisted to localStorage.
 * It knows nothing about "items" or "inventory" specifically — hand it a
 * storage key and a factory that turns plain objects into model instances,
 * and it works for any entity (items, employees, categories, etc).
 *
 * Emits 'change' events on every mutation so views can re-render reactively
 * instead of being called manually after each CRUD operation.
 */
export class Store extends EventBus {
  /**
   * @param {string} key - localStorage key this store owns.
   * @param {() => object[]} [seed] - returns initial raw records if storage is empty.
   * @param {(raw: object) => object} [factory] - wraps a raw record in a model instance.
   */
  constructor({ key, seed = () => [], factory = (raw) => raw }) {
    super();
    this.key = key;
    this.factory = factory;
    this.records = [];
    this._load(seed);
  }

  _load(seed) {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        this.records = JSON.parse(raw).map(this.factory);
        return;
      }
    } catch (err) {
      console.error(`Store(${this.key}): failed to read localStorage`, err);
    }
    this.records = seed().map(this.factory);
    this._persist();
  }

  _persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.records));
    } catch (err) {
      console.error(`Store(${this.key}): failed to write localStorage`, err);
      this.emit('error', { type: 'persist', error: err });
    }
  }

  /** Returns a defensive copy of all records. */
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
   * the record once it's actually persisted, or `null` if persisting it
   * failed (matching Store's counterpart in localStorage-land, where
   * persistence is synchronous and `ready` always resolves immediately).
   * Exists for callers that need to sequence a second write which
   * *depends* on this one having actually landed — e.g.
   * InventoryGadgetSync.js creating a Gadget with a foreign key back to
   * a just-created InventoryAsset; see that module's own doc comment for
   * why firing both inserts back-to-back without this caused the linked
   * Gadget to silently vanish. Plain create() still exists and still
   * returns synchronously for every caller that doesn't have that
   * problem — most callers don't.
   */
  createAndWait(data) {
    const record = this.factory(data);
    this.records.push(record);
    this._persist();
    this.emit('change', { type: 'create', record });
    return { record, ready: Promise.resolve(record) };
  }

  update(id, patch) {
    const record = this.get(id);
    if (!record) return null;
    Object.assign(record, patch, { updatedAt: Date.now() });
    this._persist();
    this.emit('change', { type: 'update', record });
    return record;
  }

  delete(id) {
    const record = this.get(id);
    if (!record) return false;
    this.records = this.records.filter((r) => r.id !== id);
    this._persist();
    this.emit('change', { type: 'delete', record });
    return true;
  }

  clear() {
    this.records = [];
    this._persist();
    this.emit('change', { type: 'clear' });
  }
}
