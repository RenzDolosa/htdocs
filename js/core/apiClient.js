import { API_BASE_URL } from './apiConfig.js';
import { supabase } from './supabaseClient.js';

/**
 * Every request carries whichever identity this browser currently has:
 *   - `credentials: 'include'` sends the PHP session cookie, if any — an
 *     Employee's whole identity (see api/auth/employee_login.php).
 *   - `Authorization: Bearer <token>`, if a Supabase session exists — an
 *     Administrator's identity, verified server-side by api/lib/auth.php
 *     asking Supabase itself who the token belongs to.
 * api/lib/auth.php's require_any() accepts either, so a single request
 * never needs to know in advance which kind of session is active.
 */
async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

/**
 * @returns {Promise<{ data: any, error: { message: string, status: number }|null }>}
 */
export async function apiRequest(method, path, { params = null, body = null } = {}) {
  let url = `${API_BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const qsString = qs.toString();
    if (qsString) url += `?${qsString}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: await authHeaders(),
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    return { data: null, error: { message: `Could not reach the API at ${API_BASE_URL} — is XAMPP (Apache) running? (${networkError.message})`, status: 0 } };
  }

  let payload = null;
  try { payload = await response.json(); } catch (e) { /* empty body, e.g. 204 */ }

  if (!response.ok) {
    return { data: null, error: { message: payload?.error || `Request failed (${response.status}).`, status: response.status } };
  }
  return { data: payload, error: null };
}

export const apiGet = (path, params) => apiRequest('GET', path, { params });
export const apiPost = (path, body) => apiRequest('POST', path, { body });
export const apiPut = (path, id, body) => apiRequest('PUT', path, { params: { id }, body });
export const apiDelete = (path, id) => apiRequest('DELETE', path, { params: { id } });