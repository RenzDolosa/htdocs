import { createClient } from '../../public/vendor/supabase-js.esm.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseConfig.js';

/**
 * Singleton Supabase client for the whole app. Import { supabase } from
 * here rather than calling createClient() again elsewhere, so every
 * feature shares one auth session and one realtime connection.
 *
 * Loaded from a locally vendored bundle (public/vendor/supabase-js.esm.js)
 * rather than a real npm dependency — this project has no package.json/
 * bundler for the app itself, everything else is plain
 * <script type="module"> pointed at local files, so this file is checked
 * in exactly like any other local module. It used to import straight from
 * https://esm.sh/@supabase/supabase-js@2 instead: that only ever worked
 * on a machine with a route to the public internet, and silently broke
 * the *entire* app — not just Supabase features — on a LAN-only
 * deployment (e.g. served from a private 10.x address with no internet
 * egress), because a failed top-level import anywhere in the module graph
 * aborts every module that imports it, transitively, with nothing
 * rendered and no visible error unless someone opens devtools. Vendoring
 * it removes that single point of failure entirely. Regenerate this file
 * with `npm install @supabase/supabase-js esbuild` then
 * `esbuild entry.js --bundle --format=esm --platform=browser --minify
 * --outfile=public/vendor/supabase-js.esm.js` (entry.js just being
 * `export { createClient } from '@supabase/supabase-js';`) to pick up a
 * newer supabase-js version later.
 */
const isConfigured =
  typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
  typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.length > 0 && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!isConfigured) {
  console.warn('[supabase] Not configured yet — fill in js/core/supabaseConfig.js with your project URL and anon key.');
}
