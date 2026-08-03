// Lo que comprueba el mandato cero. Consulta app_meta, que no guarda datos
// del negocio, así que sobrevive a cualquier cambio de esquema. No repuntar.
import { getSupabase, methodNotAllowed } from "./_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(503).json({ ok: false, reason: "not_configured" });
  }

  const { data, error } = await supabase
    .from("app_meta")
    .select("value")
    .eq("key", "schema_version")
    .single();

  if (error || !data) {
    return res.status(503).json({ ok: false, reason: "database_unreachable" });
  }

  // Cuántos móviles están apuntados a los avisos. Un cero aquí significa que
  // nadie se entera de que alguien ha reservado — que es la avería que importa
  // y la que, si no se dice, no se ve por ningún lado. Es un recuento: no trae
  // ni un dato de la tabla.
  const { count } = await supabase
    .from("push_subscriptions")
    .select("endpoint", { count: "exact", head: true });

  return res.status(200).json({
    ok: true,
    schema_version: data.value,
    avisos: count ?? 0,
  });
}
