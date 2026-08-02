// Copy to lib/supabaseServer.ts, verbatim.
//
// This is the only file in the project that reads credentials, and its exact
// shape is the security guarantee — do not paraphrase it. Three properties
// carry that guarantee, and dropping any one of them leaks the service_role
// key into the browser bundle:
//
//   1. `import "server-only"` — the build FAILS if a client component ever
//      imports this module. That is a compiler check, not a convention.
//   2. No `NEXT_PUBLIC_` prefix on either variable. Next.js inlines anything
//      with that prefix into the client bundle.
//   3. The client is created lazily, so `next build` needs no environment
//      variables — which is what lets CI verify the bundle with no secrets.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are missing from the server environment.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
