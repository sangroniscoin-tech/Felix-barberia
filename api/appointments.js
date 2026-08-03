// Crear y cancelar citas.
//
// Toda la validación se hace AQUÍ, en el servidor, aunque el navegador ya
// haya validado antes: la validación del navegador es comodidad para el
// cliente, no una garantía. Cualquiera puede saltársela.
import { getSupabase, fail, methodNotAllowed } from "./_lib/supabase.js";
import {
  appointmentOut, cleanPhone, cleanEmail,
  isValidPhone, isValidEmail, isValidDateKey, isValidTime,
} from "./_lib/shape.js";
import { conflictingHold } from "./_lib/holds.js";
import { readPeople, chainTimes, newGroupId, MAX_GROUP_PEOPLE, MAX_GROUP_PEOPLE_ADMIN } from "./_lib/groups.js";
import { requireAdmin } from "./_lib/adminAuth.js";
import { motivoFueraDePlazo } from "../shared/plazo-reserva.js";
import { bookingNotice, cancellationNotice } from "./_lib/notify.js";
import { sendPush } from "./_lib/push.js";

// Hace sonar el móvil de Félix. Nunca lanza y nunca se le deja romper la
// respuesta: si el aviso falla, la cita ya está guardada, que es lo único que
// aquí no puede fallar.
//
// Aquí había también un aviso por correo contra un Apps Script. Nunca llegó a
// mandar nada, y esperar su respuesta costaba entre 1,6 y 10 segundos —medido—
// en CADA reserva. Se quitó. El script se queda cerrado y quieto; simplemente
// ya no se le llama.
//
// No se avisa de lo que hace el propio Félix desde su panel: ya lo sabe, y un
// aviso por cada cita que apunta a mano es ruido. Sólo de lo que hacen los
// clientes por la web.
async function tellShop(supabase, appointments, kind, req) {
  try {
    if (requireAdmin(req) === null) return;
    if (!appointments || appointments.length === 0) return;
    const ids = [...new Set(appointments.map((a) => a.service))];
    const { data } = await supabase.from("services").select("id,name").in("id", ids);
    const names = Object.fromEntries((data || []).map((s) => [s.id, s.name]));
    const notice = kind === "cancelled"
      ? cancellationNotice(appointments, names)
      : bookingNotice(appointments, names);
    // La dirección la pone el propio aviso: lleva al panel, al día y la hora
    // de esa cita. Ver `notify.js` — no lleva el id, y no lleva a nadie por
    // nombre.
    await sendPush({ title: notice.subject, body: notice.body, url: notice.url || "/" });
  } catch (e) {
    console.warn("[notify] aviso no enviado:", e.message);
  }
}

// Cuánta gente puede meter QUIEN ESTÁ PIDIENDO. Con un pase de administrador
// válido, cinco: es Félix apuntando lo que le piden por teléfono, y él sabe lo
// que le cabe en el día. Sin pase, o con uno caducado o inventado, tres.
//
// El pase SOLO levanta el tope. No salta la comprobación de solapamiento, ni la
// de reservas temporales, ni ninguna otra validación: aquí no abre puertas,
// solo cambia un número.
function maxPeopleFor(req) {
  return requireAdmin(req) === null ? MAX_GROUP_PEOPLE_ADMIN : MAX_GROUP_PEOPLE;
}

function bad(res, message, field) {
  return res.status(400).json({ ok: false, reason: "invalid_input", field, message });
}

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return fail(res, e);
  }

  // ---------- Crear una cita, o un grupo de hasta tres ----------
  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    const phone = cleanPhone(body.phone);
    const email = cleanEmail(body.email);
    const dateKey = body.dateKey;
    const time = body.time;
    const barberId = body.barberId || "felix";
    // Opcional: la reserva temporal que esta persona tiene sobre esta hora.
    // El panel de Félix crea la cita SIN holdId, que es justo lo que hace que
    // le afecten las reservas temporales de quien está reservando por la web.
    const holdId = typeof body.holdId === "string" && body.holdId ? body.holdId : null;

    // Una persona o varias. Un solo teléfono y un solo correo para toda la
    // reserva: los de quien reserva. Un nombre por persona.
    const parsed = readPeople(body, maxPeopleFor(req));
    if (parsed.error) return bad(res, parsed.error.message, parsed.error.field);
    const people = parsed.people;
    const grouped = people.length > 1;

    for (let i = 0; i < people.length; i++) {
      if (!people[i].name) {
        return bad(res, grouped ? `Falta el nombre de la persona ${i + 1}.` : "Falta el nombre.", "name");
      }
    }
    if (!isValidPhone(phone)) {
      return bad(res, "El teléfono no parece válido. Escribe al menos 9 dígitos, sin espacios ni letras.", "phone");
    }
    if (!isValidEmail(email)) return bad(res, "Ese correo no parece válido.", "email");
    if (!isValidDateKey(dateKey)) return bad(res, "Falta el día de la cita.", "dateKey");
    if (!isValidTime(time)) return bad(res, "Falta la hora de la cita.", "time");

    // El plazo, antes de tocar la base de datos. La página solo ofrece los días
    // que caben, pero eso es comodidad: cualquiera puede llamar a esta ruta a
    // mano, y así es como se podía guardar una cita para 2029 o para el año
    // pasado.
    //
    // Con un pase de administrador válido no se aplica, exactamente igual que
    // el tope de personas: Félix apunta desde su panel lo que le piden por
    // teléfono para dentro de tres meses, y también lo que se le olvidó anotar
    // la semana pasada. Un pase ausente, caducado o inventado cae al límite
    // público — el pase mueve un número y no salta ninguna comprobación.
    if (requireAdmin(req) !== null) {
      const fueraDePlazo = motivoFueraDePlazo(dateKey);
      if (fueraDePlazo) return bad(res, fueraDePlazo, "dateKey");
    }

    try {
      // La duración y el precio se toman de los servicios en el servidor, no de
      // lo que mande el navegador: si no, cualquiera podría reservar 5 minutos
      // a 0 €. Y las horas de cada persona se encadenan aquí por lo mismo.
      const wanted = [...new Set(people.map((p) => p.service))];
      const { data: svcRows, error: svcErr } = await supabase
        .from("services").select("*").in("id", wanted).eq("active", true);
      if (svcErr) throw new Error(svcErr.message);

      const byId = new Map((svcRows || []).map((s) => [s.id, s]));
      for (const p of people) {
        if (!byId.has(p.service)) return bad(res, "Ese servicio no existe.", "service");
      }
      const chosen = people.map((p) => byId.get(p.service));

      const { data: barber } = await supabase
        .from("barbers").select("id").eq("id", barberId).eq("active", true).single();
      if (!barber) return bad(res, "Ese barbero no existe.", "barberId");

      const chain = chainTimes(time, chosen.map((s) => s.duration_minutes));
      if (chain.error) return bad(res, chain.error.message, "time");
      const { starts, totalMinutes } = chain;

      // ¿Hay alguien rellenando sus datos sobre estas horas ahora mismo? Se
      // mira el TRAMO ENTERO del grupo, no solo el de la primera persona. La
      // reserva temporal propia (la del holdId recibido) no cuenta: si contase,
      // nadie podría confirmar la cita que acaba de reservarse la hora.
      const held = await conflictingHold(supabase, {
        barberId: barber.id,
        dateKey,
        time,
        durationMinutes: totalMinutes,
        exceptId: holdId,
      });
      if (held) {
        return res.status(409).json({
          ok: false,
          reason: "slot_held",
          message: grouped
            ? "Alguien está reservando una de esas horas ahora mismo. Se libera en unos minutos."
            : "Alguien está reservando esa hora ahora mismo. Se libera en unos minutos.",
        });
      }

      // Un grupo deja su marca; una cita suelta va con las dos columnas a NULL,
      // que es lo que son casi todas las que hay.
      const groupId = grouped ? newGroupId() : null;
      const stamp = Date.now();
      const rows = people.map((p, i) => ({
        id: `c${stamp}${i}${Math.floor(Math.random() * 1000)}`,
        appointment_date: dateKey,
        start_time: starts[i],
        service_id: chosen[i].id,
        barber_id: barber.id,
        customer_name: p.name,
        customer_phone: phone,
        customer_email: email,
        duration_minutes: chosen[i].duration_minutes,
        price: chosen[i].price,
        status: "booked",
        source: "web",
        raw_name: p.rawName,
        raw_phone: body.phone != null ? String(body.phone) : null,
        raw_email: body.email ?? null,
        group_id: groupId,
        group_position: grouped ? i + 1 : null,
      }));

      // TODAS las filas en un solo insert: o entran todas o no entra ninguna.
      // Si la restricción de solapamiento rechaza una, Postgres tira la
      // sentencia entera. Insertarlas de una en una dejaría media reserva
      // hecha, y a alguien plantado en la puerta creyendo que venían dos.
      const { data, error } = await supabase.from("appointments").insert(rows).select();

      if (error) {
        // 23P01 = lo rechazó la restricción de solapamiento: alguien cogió el
        // hueco primero. No es un fallo nuestro, es la garantía funcionando.
        if (error.code === "23P01") {
          return res.status(409).json({
            ok: false,
            reason: "slot_taken",
            message: grouped
              ? "Justo han cogido una de esas horas y ya no cabéis seguidos. No se ha guardado ninguna cita: elige otro rato, por favor."
              : "Justo han cogido esa hora. Elige otra, por favor.",
          });
        }
        throw new Error(error.message);
      }

      // La cita ya existe: la reserva temporal ha cumplido su función y sobra.
      if (holdId) {
        try {
          await supabase.from("slot_holds").delete().eq("id", holdId);
        } catch {
          // Si no se borra, caduca sola en unos minutos. La cita está guardada,
          // que es lo único que no puede fallar aquí.
        }
      }

      const out = (data || []).map(appointmentOut).sort((a, b) => a.time.localeCompare(b.time));
      await tellShop(supabase, out, "booked", req);
      // `appointment` en singular sigue siendo la primera: es lo que espera
      // todo lo que ya llamaba a esta ruta antes de que existieran los grupos.
      return res.status(201).json({ ok: true, appointment: out[0], appointments: out });
    } catch (e) {
      return fail(res, e);
    }
  }

  // ---------- Cancelar una cita ----------
  // No se borra la fila: se marca como cancelada, para que quede el rastro
  // de que existió. Una cita borrada no se puede explicar tres meses después.
  if (req.method === "DELETE" || req.method === "PATCH") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

    // Con groupId se anula la reserva entera de una vez: todas las citas de ese
    // grupo que sigan en pie. Con id se anula una sola persona y las demás se
    // quedan con su hora — a nadie se le adelanta la suya.
    const groupId = body.groupId || (req.query && req.query.groupId);
    if (groupId) {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("group_id", groupId)
          .eq("status", "booked")
          .select();
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) {
          return res.status(404).json({ ok: false, reason: "not_found", message: "Esa reserva ya no existe." });
        }
        const cancelled = data.map(appointmentOut);
        await tellShop(supabase, cancelled, "cancelled", req);
        return res.status(200).json({ ok: true, appointments: cancelled });
      } catch (e) {
        return fail(res, e);
      }
    }

    const id = body.id || (req.query && req.query.id);
    if (!id) return bad(res, "Falta el identificador de la cita.", "id");

    const allowed = ["booked", "no_show", "cancelled"];
    const status = allowed.includes(body.status) ? body.status : "cancelled";

    try {
      // La hora de la cancelación se apunta sólo al cancelar. Este mismo PATCH
      // sirve para marcar "no se presentó" y para quitar la marca, y ahí no hay
      // ninguna cancelación que fechar; y una cita que vuelve a "booked" tiene
      // que perder la fecha, o arrastraría la de una cancelación deshecha.
      const cambios = status === "cancelled"
        ? { status, cancelled_at: new Date().toISOString() }
        : { status, cancelled_at: null };
      const { data, error } = await supabase
        .from("appointments").update(cambios).eq("id", id).select().single();
      if (error || !data) {
        return res.status(404).json({ ok: false, reason: "not_found", message: "Esa cita ya no existe." });
      }
      const appt = appointmentOut(data);
      // Sólo una cancelación se avisa. Este mismo PATCH sirve para marcar
      // "no se presentó" y para quitar esa marca, y de eso no hay nada que
      // contar por correo: lo acaba de hacer Félix mirando la pantalla.
      if (status === "cancelled") await tellShop(supabase, [appt], "cancelled", req);
      return res.status(200).json({ ok: true, appointment: appt });
    } catch (e) {
      return fail(res, e);
    }
  }

  return methodNotAllowed(res, ["POST", "PATCH", "DELETE"]);
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
