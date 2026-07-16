/** Generates a reasonably unique client-side id (no server, no UUID lib needed). */
export function generateId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}
