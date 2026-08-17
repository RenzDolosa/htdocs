/**
 * Minimal CSV helpers — no external dependency, matching this codebase's
 * "vanilla JS, nothing to npm install" approach. Handles quoted fields
 * (commas/quotes/newlines inside quotes) on both ends.
 */

/**
 * Escapes a single value for safe placement in a CSV row.
 * @param {*} value
 * @param {boolean} [forceText] - when true, wraps the value as an Excel
 *   "text formula" cell (`="value"`) instead of a bare one. Excel's CSV
 *   importer auto-types any cell that *looks* like a number — a long
 *   digit string (serial numbers, position numbers), a MAC address or
 *   IMEI — silently reformatting it into scientific notation and
 *   dropping leading zeros the moment the file is opened, no matter how
 *   the CSV itself quoted the field (a plain quoted string is still just
 *   a string of digits to Excel's auto-detection). Wrapping it in
 *   ="value" makes the cell a formula whose *result* is that exact text,
 *   which Excel stores and displays as text, immune to that
 *   reinterpretation. Every other CSV reader — including this app's own
 *   parseCsv() — just sees ="foo" as an ordinary quoted string and
 *   ignores the formula syntax, so this is safe for round-tripping
 *   through this app's own CSV import too, not just for opening in Excel.
 */
function escapeCell(value, forceText = false) {
  const s = value == null ? '' : String(value);
  if (forceText && s !== '') {
    // Quotes within the value itself are doubled once, for the CSV
    // layer — real-world values here (serials, MAC addresses, names)
    // essentially never contain a literal `"`, so this doesn't also
    // attempt a second, Excel-formula-level escape of that same
    // character; the rare pathological value with a quote in it stays a
    // valid CSV file either way, just not a perfectly-formed formula.
    return `"=""${s.replace(/"/g, '""')}"""`;
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Reads a File as text, auto-detecting encoding rather than assuming
 * UTF-8. This matters because Excel's default "CSV" export (as opposed
 * to "CSV UTF-8") writes Windows-1252/ANSI, not UTF-8 — a single accented
 * byte like "Ñ" (0xD1) is not a valid UTF-8 sequence on its own, so a
 * naive `FileReader.readAsText(file)` (or `TextDecoder('utf-8')`) quietly
 * replaces it with U+FFFD ("�") instead of failing loudly. Decoding as
 * UTF-8 in strict ("fatal") mode first and only falling back to
 * Windows-1252 on an actual decode failure means well-formed UTF-8 files
 * are unaffected, while ANSI exports round-trip correctly instead of
 * corrupting names on import.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.onload = () => {
      try {
        resolve(decodeCsvBuffer(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/** @param {ArrayBuffer} buffer */
function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Builds a CSV string from headers + row arrays.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @param {{ plainHeaders?: string[] }} [options] - `plainHeaders`: header
 *   names to leave as plain values instead of text-forcing (see
 *   escapeCell's own doc comment) — typically date/time columns, which
 *   Excel doesn't misread as a giant number and are easier to skim as a
 *   normal cell. Every other column is text-forced by default, so a new
 *   column added later is safe without this call site having to
 *   remember to opt it in.
 */
export function toCsv(headers, rows, { plainHeaders = [] } = {}) {
  const plainSet = new Set(plainHeaders);
  const forceTextAt = headers.map((h) => !plainSet.has(h));
  const lines = [headers.map((h) => escapeCell(h)).join(',')];
  rows.forEach((row) => lines.push(row.map((value, i) => escapeCell(value, forceTextAt[i])).join(',')));
  return lines.join('\r\n');
}

/**
 * Strips the `="value"` Excel-text-formula wrapper (see toCsv/escapeCell)
 * back off, if present. Opening an exported file in Excel and re-saving
 * as CSV never needs this — CSV has no way to represent a formula at
 * all, so Excel always writes out the *computed* value ("value", not
 * ="value") the moment it saves. This only matters for a file round-
 * tripped straight back into this app's own import without ever passing
 * through Excel — parseCsv() applies it to every field unconditionally
 * so all three import call sites (ManageController, InventoryAssetController,
 * SettingsController's Warehouse Information import) get it for free.
 */
function unwrapExcelText(value) {
  const match = /^="(.*)"$/.exec(value);
  return match ? match[1] : value;
}

/**
 * Parses CSV text into an array of row arrays (strings), honoring quoted
 * fields. Trailing blank lines are ignored. Does not assume a header row —
 * callers that expect one should shift() it off themselves.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  // Normalize line endings so \r\n and \n behave identically below.
  const src = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { pushField(); continue; }
    if (ch === '\n') { pushRow(); continue; }
    field += ch;
  }

  // Flush the last field/row if the file didn't end with a newline.
  if (field !== '' || row.length > 0) pushRow();

  return rows
    .filter((r) => !(r.length === 1 && r[0].trim() === ''))
    .map((r) => r.map(unwrapExcelText));
}

/**
 * Downloads a CSV string as a file via a throwaway anchor click.
 *
 * Prepended with a UTF-8 byte-order-mark (U+FEFF): without it, Excel has
 * no reliable way to tell a UTF-8 file apart from the legacy ANSI/
 * Windows-1252 codepage it defaults to for local .csv files (unlike a
 * server response, the Blob's `charset=utf-8` MIME type here is not
 * consulted for that — it only matters for actual HTTP responses). Any
 * non-ASCII byte this app writes — the em dash/arrow in Recent Activity's
 * own log messages, the middot separator, a person's name with an
 * accent — gets misread one byte at a time as Windows-1252 without the
 * BOM, which is exactly the "â€"" / "â†'" mangling this fixes. Every
 * reader that matters still works correctly with it present: modern
 * Excel, Google Sheets, and this app's own readCsvFile() (TextDecoder
 * strips a leading BOM by default, so re-importing an export round-trips
 * cleanly).
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}