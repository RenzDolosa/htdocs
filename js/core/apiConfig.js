/**
 * Base URL of the PHP/XAMPP backend (see /api at the project root).
 *
 * Default assumes the whole project — this index.html, js/, and api/ —
 * sits together under XAMPP's htdocs, e.g.
 * C:\xampp\htdocs\gadget-tracker\{index.html, js/, api/}, served as
 * http://localhost/gadget-tracker/. Adjust the path below to match
 * wherever you actually copied the folder. If you serve the frontend
 * from somewhere else entirely (a separate dev server/port), use that
 * server's full origin here instead, and update api/config.php's
 * ALLOWED_ORIGIN to match it exactly — CORS with cookies can't use "*".
 */
export const API_BASE_URL = 'http://localhost/gadget-tracker/api';