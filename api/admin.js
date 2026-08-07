// Escrituras del panel de administración: catálogo, horario y bloqueos.
//
// Semántica de reemplazo completo, igual que hoy: el panel manda la lista
// entera y sustituye a la anterior. Son conjuntos pequeños con un solo
// usuario, así que no compensa complicarlo — y mantenerlo igual hace que el
// cambio a Supabase no toque la lógica del panel.
//
// Este endpoint EXIGE identificarse. Antes no pedía nada: quien encontrase la
// dirección podía cambiar precios, servicios, horarios, festivos y vacaciones
// sin pasar por el panel siquiera. La comprobación se hace arriba del todo,
// antes de leer el cuerpo, para que nada de lo que mande un desconocido llegue
// a interpretarse.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import { cleanName } from "./_lib/shape.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { CLAVE_ULTIMA_COPIA } from "./_lib/meta.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const denied = requireAdmin(req);
  if (denied) return res.status(denied.status).json(denied.body);

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const { collection, items } = body;
  // "lastBackup" no manda ninguna lista: no es una colección que se reemplace,
  // es una marca de tiempo, y la pone el servidor. "waitlistEntry" tampoco:
  // toca UNA fila por su id, que es justo lo contrario de reemplazar la lista.
  // Todo lo demás sí llega con su lista entera y sin ella no hay nada que
  // guardar.
  const SIN_LISTA = ["lastBackup", "waitlistEntry"];
  if (!SIN_LISTA.includes(collection) && !Array.isArray(items) && typeof items !== "object") {
    return res.status(400).json({ ok: false, reason: "invalid_input", message: "Falta la lista." });
  }

  try {
    const supabase = getSupabase();

    switch (collection) {
      case "services": {
        const rows = items.map((s, i) => ({
          id: String(s.id),
          name: cleanName(s.name) || "Sin nombre",
          description: typeof s.desc === "string" ? s.desc.trim() : "",
          duration_minutes: clampInt(s.duration, 5, 480, 30),
          price: clampNum(s.price, 0, 100000, 0),
          sort_order: i,
          active: true,
        }));
        await replaceCatalogue(supabase, "services", rows);
        break;
      }

      case "barbers": {
        const rows = items.map((b) => ({
          id: String(b.id),
          name: cleanName(b.name) || "Sin nombre",
          photo_url: b.photo || null,
          active: true,
        }));
        await replaceCatalogue(supabase, "barbers", rows);
        break;
      }

      case "schedule": {
        // { "0": [], "1": [["09:30","13:30"], ...], ... }
        const rows = [];
        for (const [day, ranges] of Object.entries(items || {})) {
          for (const [start, end] of ranges || []) {
            if (start < end) rows.push({ weekday: Number(day), start_time: start, end_time: end });
          }
        }
        await wipe(supabase, "schedule_ranges");
        if (rows.length) await insert(supabase, "schedule_ranges", rows);
        break;
      }

      case "blockedDays": {
        await wipe(supabase, "blocked_days");
        const rows = items.map((d) => ({ block_date: d }));
        if (rows.length) await insert(supabase, "blocked_days", rows);
        break;
      }

      case "blockedRanges": {
        await wipe(supabase, "blocked_ranges");
        const rows = items
          .filter((r) => r.start < r.end)
          .map((r) => ({ block_date: r.dateKey, start_time: r.start, end_time: r.end, label: r.label || "" }));
        if (rows.length) await insert(supabase, "blocked_ranges", rows);
        break;
      }

      case "festivos": {
        await wipe(supabase, "festivos");
        const rows = items.map((d) => ({ festivo_date: d }));
        if (rows.length) await insert(supabase, "festivos", rows);
        break;
      }

      case "vacationRanges": {
        await wipe(supabase, "vacation_ranges");
        const rows = items
          .filter((r) => r.start <= r.end)
          .map((r) => ({ start_date: r.start, end_date: r.end, label: r.label || "" }));
        if (rows.length) await insert(supabase, "vacation_ranges", rows);
        break;
      }

      // La lista de espera se toca de UNA EN UNA, por su id, y nunca entera.
      //
      // Antes era una colección más: se borraba la tabla y se reescribía con lo
      // que tuviera el navegador. Eso regeneraba los `id` y los `created_at` de
      // TODOS, así que quitar a una persona con la X le cambiaba a las demás la
      // antigüedad —que es lo que decide a quién se llama primero— y con ella
      // la marca de avisado. Quitar a uno no puede reescribir a los otros seis.
      //
      // Dos acciones y ninguna más: dejar constancia de que se le ha escrito
      // por un hueco, y sacar a alguien de la lista. Ninguna de las dos toca
      // nombre, teléfono, franja ni "cualquier día": lo que dijo el cliente al
      // apuntarse sólo lo escribe el propio cliente, por `/api/waitlist`.
      case "waitlistEntry": {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ ok: false, reason: "invalid_input", message: "Falta la entrada de la lista." });
        }

        if (body.action === "remove") {
          const { error } = await supabase.from("waitlist").delete().eq("id", id);
          if (error) throw new Error(error.message);
          break;
        }

        if (body.action === "notified") {
          // El hueco por el que se le avisó, 'YYYY-MM-DD HH:MM'. Se valida
          // aquí aunque el panel lo componga: cualquiera con el pase puede
          // llamar a esta ruta a mano, y una cadena rara no tiene por qué
          // acabar en la columna. Lo que no encaje se guarda como null — la
          // marca sigue puesta, sin hueco al lado.
          const slot = typeof body.slot === "string" && /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(body.slot)
            ? body.slot
            : null;
          // La hora la pone el reloj del SERVIDOR y no llega en la petición,
          // por lo mismo que la fecha de la última copia: si viniera de fuera,
          // "avisado el martes" lo decidiría quien llama.
          const { error } = await supabase
            .from("waitlist")
            .update({ notified_at: new Date().toISOString(), notified_slot: slot })
            .eq("id", id);
          if (error) throw new Error(error.message);
          break;
        }

        return res.status(400).json({ ok: false, reason: "invalid_input", message: "No sé qué hacer con esa entrada." });
      }

      // Cuándo se descargó la última copia. Es lo ÚNICO que escribe la
      // exportación, y por eso va aquí y no en la ruta que la sirve: bajarse
      // una copia no puede tocar ni una cita, ni un precio, ni un cierre.
      //
      // La fecha la pone el reloj del servidor y NO llega en la petición. Si
      // viniera de fuera, cualquiera con el pase podría dejar escrito que la
      // copia se hizo hoy sin haberla hecho, que es justamente el aviso que
      // esta fecha existe para dar.
      case "lastBackup": {
        const { error } = await supabase
          .from("app_meta")
          .upsert({ key: CLAVE_ULTIMA_COPIA, value: new Date().toISOString() }, { onConflict: "key" });
        if (error) throw new Error(error.message);
        break;
      }

      default:
        return res.status(400).json({ ok: false, reason: "unknown_collection", message: `No sé qué es "${collection}".` });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
}

// Para el catálogo no se borra y se reinserta: las citas apuntan a los
// servicios y a los barberos, así que borrarlos rompería esas referencias.
// Se actualiza lo que llega y se desactiva lo que ya no viene.
async function replaceCatalogue(supabase, table, rows) {
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw new Error(error.message);
  }
  const keep = rows.map((r) => r.id);
  const q = supabase.from(table).update({ active: false });
  const { error: offErr } = keep.length ? await q.not("id", "in", `(${keep.map((k) => `"${k}"`).join(",")})`) : await q.neq("id", "");
  if (offErr) throw new Error(offErr.message);
}

// Supabase exige un filtro en todo delete, para que nadie vacíe una tabla sin
// querer. Cada tabla necesita el suyo según cuál sea su clave, así que se dice
// explícitamente en vez de adivinarlo por el mensaje de error.
const WIPE_FILTER = {
  schedule_ranges: (q) => q.gt("id", 0),
  blocked_ranges:  (q) => q.gt("id", 0),
  vacation_ranges: (q) => q.gt("id", 0),
  blocked_days:    (q) => q.gte("block_date", "1900-01-01"),
  festivos:        (q) => q.gte("festivo_date", "1900-01-01"),
};

async function wipe(supabase, table) {
  const filter = WIPE_FILTER[table];
  if (!filter) throw new Error(`No hay filtro de borrado definido para "${table}".`);
  const { error } = await filter(supabase.from(table).delete());
  if (error) throw new Error(error.message);
}

async function insert(supabase, table, rows) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(error.message);
}

function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function clampNum(v, min, max, dflt) {
  const n = Number(v);
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
