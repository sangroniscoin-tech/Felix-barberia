// Copy to app/api/health/route.ts, verbatim.
//
// The one endpoint that proves the whole chain: browser → lambda → database.
// `/next` calls it before every merge and again after every deploy, so its
// response shape is a contract, not a detail.
//
// It queries `app_meta`, a one-row table created during setup for exactly this
// purpose. Anchoring the check to a table that never changes means health keeps
// working through every future schema change — never repoint it at a domain
// table that a later feature might rename or drop.
//
// The two failure reasons stay distinct because they need different fixes:
// `not_configured` means a variable is missing in Vercel; `database_unreachable`
// means the key is wrong or the migration never applied. "It failed" is not a
// useful thing to tell someone.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        ok: false,
        reason: "not_configured",
        detail:
          "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY are missing from the project's Environment Variables in Vercel.",
      },
      { status: 503 },
    );
  }

  const { error } = await getSupabase()
    .from("app_meta")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "database_unreachable", detail: error.message },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
