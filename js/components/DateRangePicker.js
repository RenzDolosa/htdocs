import { el, esc } from '../utils/dom.js';

/**
 * DateRangePicker is an anchored popover — same open/close/position
 * pattern as DropdownMenu.js/ColumnConfigPanel.js — for picking a
 * start/end date range: quick presets on the left, a two-month calendar
 * on the right. Modeled directly on the reference platform's Shipping
 * Management date filter (presets list + side-by-side months + Clear/OK).
 *
 * Nothing is applied until OK is clicked — Clear only resets the working
 * selection, it doesn't close the popover or call onApply, same
 * "decide, then confirm" shape as ColumnConfigPanel's Save/Cancel. Picking
 * a preset fills the fields and calendar immediately but still waits for
 * OK, so a person can glance at the resulting range before committing to
 * it (or nudge it by clicking a day) exactly like the reference.
 *
 * Usage:
 *   openDateRangePicker({
 *     anchor: someButtonEl,
 *     initialStart: existingStartMs,   // or null
 *     initialEnd: existingEndMs,       // or null
 *     onApply: (startMs, endMs) => { ... }  // startMs = local midnight of
 *       the first day, endMs = local 23:59:59.999 of the last day — an
 *       inclusive whole-day range either way, single-day selections
 *       included.
 *   });
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isoDate(d) { const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sameDay(a, b) { return Boolean(a) && Boolean(b) && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

/** Same calendar day, `months` back — e.g. Aug 13 minus 1 = Jul 13, not
 * "the 1st of last month". Naively calling `setMonth(m - n)` on a date
 * whose day-of-month doesn't exist in the target month overflows into the
 * month *after* the intended one (Aug 31 minus 1 naively lands on Sep 2,
 * not Jul 31 or Jul 31's nearest valid day) — clamping to the target
 * month's actual last day avoids that, matching how "Last week" already
 * subtracts 6 *days* rather than jumping to the 1st of some week. */
function subtractMonths(date, months) {
  const day = date.getDate();
  const d = new Date(date);
  d.setDate(1); // parked on the 1st while the month rolls back, so the overflow above can't happen mid-adjustment
  d.setMonth(d.getMonth() - months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

/** The three presets shown in the reference image, in the same order. Each
 * returns [start, end] as plain Dates (any time-of-day — the picker only
 * ever reads the calendar-day part of them). All three are trailing
 * windows ending today — "Last month" is "the past 30-ish days", not
 * "the previous calendar month" — same shape as "Last week" so the three
 * presets read consistently rather than one of them jumping to the 1st. */
export const DATE_RANGE_PRESETS = [
  {
    label: 'Last week',
    range: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return [start, end];
    }
  },
  {
    label: 'Last month',
    range: () => {
      const end = new Date();
      return [subtractMonths(end, 1), end];
    }
  },
  {
    label: 'Last three months',
    range: () => {
      const end = new Date();
      return [subtractMonths(end, 3), end];
    }
  }
];

/** Module-level singleton, same rule as DropdownMenu/ColumnConfigPanel:
 * opening a second picker always closes whichever one is already open. */
let activePicker = null;

export class DateRangePicker {
  constructor({ anchor, initialStart = null, initialEnd = null, presets = DATE_RANGE_PRESETS, onApply } = {}) {
    this.anchor = anchor;
    this.presets = presets;
    this.onApply = onApply;
    this.rangeStart = initialStart ? startOfDay(new Date(initialStart)) : null;
    this.rangeEnd = initialEnd ? startOfDay(new Date(initialEnd)) : null;

    // Left calendar always shows the month right before the right one —
    // synced rather than independently scrollable, since a report range
    // rarely needs to compare two unrelated months side by side the way a
    // general-purpose calendar app might.
    const anchorMonth = this.rangeEnd || this.rangeStart || new Date();
    this.viewMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() - 1, 1);

    this._handleDocClick = this._handleDocClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    this._build();
  }

  _build() {
    this.panelEl = el(`
      <div class="date-range-picker" role="dialog" aria-label="Select date range">
        <div class="drp-body">
          <div class="drp-presets"></div>
          <div class="drp-main">
            <div class="drp-fields">
              <div class="drp-field">
                <label>Start date</label>
                <input type="text" data-role="drp-start" readonly placeholder="Select date">
              </div>
              <span class="drp-fields-sep">–</span>
              <div class="drp-field">
                <label>End date</label>
                <input type="text" data-role="drp-end" readonly placeholder="Select date">
              </div>
            </div>
            <div class="drp-months"></div>
          </div>
        </div>
        <div class="drp-footer">
          <button tabindex="-1" type="button" class="link-btn" data-action="clear">Clear</button>
          <button tabindex="-1" type="button" class="btn btn-accent btn-sm" data-action="apply">OK</button>
        </div>
      </div>
    `);

    const presetsEl = this.panelEl.querySelector('.drp-presets');
    presetsEl.innerHTML = this.presets.map((p, i) => `<button tabindex="-1" type="button" class="drp-preset" data-preset-index="${i}">${esc(p.label)}</button>`).join('');
    presetsEl.querySelectorAll('[data-preset-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [start, end] = this.presets[Number(btn.dataset.presetIndex)].range();
        this.rangeStart = startOfDay(start);
        this.rangeEnd = startOfDay(end);
        this.viewMonth = new Date(this.rangeEnd.getFullYear(), this.rangeEnd.getMonth() - 1, 1);
        this._renderAll();
      });
    });

    this.monthsEl = this.panelEl.querySelector('.drp-months');
    this.startInput = this.panelEl.querySelector('[data-role="drp-start"]');
    this.endInput = this.panelEl.querySelector('[data-role="drp-end"]');

    this.panelEl.querySelector('[data-action="clear"]').addEventListener('click', () => {
      this.rangeStart = null;
      this.rangeEnd = null;
      this._renderAll();
    });
    this.panelEl.querySelector('[data-action="apply"]').addEventListener('click', () => {
      if (!this.rangeStart) { this.close(); return; }
      const start = startOfDay(this.rangeStart).getTime();
      const end = endOfDay(this.rangeEnd || this.rangeStart).getTime();
      this.close();
      this.onApply?.(start, end);
    });

    this._renderAll();
  }

  _renderAll() {
    this.startInput.value = this.rangeStart ? isoDate(this.rangeStart) : '';
    this.endInput.value = this.rangeEnd ? isoDate(this.rangeEnd) : (this.rangeStart ? isoDate(this.rangeStart) : '');
    this._renderMonths();
  }

  _renderMonths() {
    const left = this.viewMonth;
    const right = new Date(left.getFullYear(), left.getMonth() + 1, 1);
    this.monthsEl.innerHTML = `
      <div class="drp-month">
        <div class="drp-month-head">
          <button tabindex="-1" type="button" class="drp-nav" data-nav="-12" title="Previous year">«</button>
          <button tabindex="-1" type="button" class="drp-nav" data-nav="-1" title="Previous month">‹</button>
          <span class="drp-month-title">${MONTH_NAMES[left.getMonth()]} ${left.getFullYear()}</span>
        </div>
        <div class="drp-grid">${this._monthGridHTML(left)}</div>
      </div>
      <div class="drp-month">
        <div class="drp-month-head">
          <span class="drp-month-title">${MONTH_NAMES[right.getMonth()]} ${right.getFullYear()}</span>
          <button tabindex="-1" type="button" class="drp-nav" data-nav="1" title="Next month">›</button>
          <button tabindex="-1" type="button" class="drp-nav" data-nav="12" title="Next year">»</button>
        </div>
        <div class="drp-grid">${this._monthGridHTML(right)}</div>
      </div>
    `;

    this.monthsEl.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + Number(btn.dataset.nav), 1);
        this._renderMonths();
      });
    });
    this.monthsEl.querySelectorAll('[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const [y, m, d] = cell.dataset.date.split('-').map(Number);
        this._selectDay(new Date(y, m - 1, d));
      });
    });
  }

  _monthGridHTML(monthDate) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const startOffset = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfDay(new Date());

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

    const head = `<div class="drp-weekdays">${WEEKDAY_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>`;
    const body = rows.map((row) => `<div class="drp-week">${row.map((day) => {
      if (!day) return '<span class="drp-day drp-day-empty"></span>';
      const classes = ['drp-day'];
      if (sameDay(day, today)) classes.push('is-today');
      if (this.rangeStart && sameDay(day, this.rangeStart)) classes.push('is-range-start');
      if (this.rangeEnd && sameDay(day, this.rangeEnd)) classes.push('is-range-end');
      if (this.rangeStart && this.rangeEnd && day > this.rangeStart && day < this.rangeEnd) classes.push('is-in-range');
      return `<button tabindex="-1" type="button" class="${classes.join(' ')}" data-date="${isoDate(day)}">${day.getDate()}</button>`;
    }).join('')}</div>`).join('');

    return head + body;
  }

  /** First click starts a fresh range; second click closes it (swapping
   * if the person clicked backwards); a third click starts over — same
   * click-click-click cadence as the reference's own calendar. */
  _selectDay(day) {
    if (!this.rangeStart || this.rangeEnd) {
      this.rangeStart = day;
      this.rangeEnd = null;
    } else if (day < this.rangeStart) {
      this.rangeEnd = this.rangeStart;
      this.rangeStart = day;
    } else {
      this.rangeEnd = day;
    }
    this._renderAll();
  }

  open() {
    if (activePicker && activePicker !== this) activePicker.close();
    activePicker = this;

    document.body.appendChild(this.panelEl);
    this._position();
    requestAnimationFrame(() => this.panelEl.classList.add('open'));
    setTimeout(() => {
      document.addEventListener('click', this._handleDocClick);
      document.addEventListener('keydown', this._handleKeydown);
    }, 0);
  }

  _position() {
    const rect = this.anchor.getBoundingClientRect();
    const panelRect = this.panelEl.getBoundingClientRect();
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelRect.height + 12 && rect.top > panelRect.height + 12;
    const top = openUpward ? rect.top - panelRect.height - 6 : rect.bottom + 6;
    this.panelEl.style.left = `${left + window.scrollX}px`;
    this.panelEl.style.top = `${top + window.scrollY}px`;
  }

  close() {
    if (activePicker === this) activePicker = null;
    document.removeEventListener('click', this._handleDocClick);
    document.removeEventListener('keydown', this._handleKeydown);
    this.panelEl.remove();
  }

  _handleDocClick(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    if (!path.includes(this.panelEl) && !path.includes(this.anchor)) this.close();
  }

  _handleKeydown(e) {
    if (e.key === 'Escape') this.close();
  }
}

/** Convenience wrapper: builds and opens a picker, with the same
 * click-the-same-anchor-again-to-close toggle DropdownMenu's own wrapper
 * has. */
export function openDateRangePicker(opts) {
  if (activePicker && activePicker.anchor === opts.anchor) {
    activePicker.close();
    return null;
  }
  const picker = new DateRangePicker(opts);
  picker.open();
  return picker;
}
