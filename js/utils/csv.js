/**
 * Minimal CSV helpers — no external dependency, matching this codebase's
 * "vanilla JS, nothing to npm install" approach. Handles quoted fields
 * (commas/quotes/newlines inside quotes) on both ends.
 */

/** Escapes a single value for safe placement in a CSV row. */
function escapeCell(value) {
  const s = value == null ? '' : String(value);
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
 */
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(',')));
  return lines.join('\r\n');
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

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * Downloads a CSV string as a file via a throwaway anchor click.
 * @param {string} csv
 * @param {string} filename
 */
export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}