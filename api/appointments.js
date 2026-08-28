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
import { haLlegadoAlTopeDeCitas, respuestaTope } from "./_lib/ritmo.js";
import { bookingNotice, cancellationNotice } from "./_lib/notify.js";
import { cuantosEsperanPor } from "./_lib/espera.js";
import { sendPush } from "./_lib/push.js";
import { waitUntil } from "@vercel/functions";

// Hace sonar el móvil de Félix. Nunca lanza y nunca se le deja romper la
// respuesta: si el aviso falla, la cita ya está guardada, que es lo único que
// aquí no puede fallar.
//
// SE LLAMA POR `waitUntil`, NUNCA CON `await`. Dentro hay cuatro viajes —los
// nombres de los servicios, las suscripciones, las claves VAPID y el envío a
// los servidores de Google— y el cliente los estaba esperando todos antes de
// ver su confirmación, con la cita ya guardada. No es trabajo suyo.
//
// `waitUntil` es lo que hace eso seguro y no un simple quitar el `await`: en
// una función de Vercel, en cuanto se contesta, la función se puede congelar.
// Soltar la promesa a secas detrás del `res` haría que el aviso a veces no
// saliera, y fallaría de forma intermitente e invisible — que es peor avería
// que la lentitud que arregla. `waitUntil` contesta ya Y mantiene viva la
// función hasta que el envío termina.
//
// El botón de "probar aviso" del panel (`api/push.js`) SÍ espera, y debe
// seguir esperando: su única razón de existir es decirle a Félix si llegó.
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
    // Una cancelación deja un hueco libre, y ese hueco puede servirle a alguien
    // de la lista de espera. Se cuenta UNA vez, por DÍA y por la hora en que
    // empieza el hueco: una reserva de tres personas son tres filas del mismo
    // día seguidas, y no son tres huecos que contar por separado.
    //
    // `cuantosEsperanPor` nunca lanza y devuelve 0 si algo falla, así que un
    // problema contando nunca deja a Félix sin el aviso de siempre.
    let esperando = 0;
    if (kind === "cancelled") {
      const primera = appointments.slice().sort((a, b) => String(a.time).localeCompare(String(b.time)))[0];
      esperando = await cuantosEsperanPor(supabase, { dia: primera.dateKey, hora: primera.time });
    }
    const notice = kind === "cancelled"
      ? cancellationNotice(appointments, names, esperando)
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

// ¿La cita que ocupa el hueco es de esta misma persona?
//
// Cuando la restricción de solapamiento rechaza el insert, ni el servidor ni
// el navegador miraban DE QUIÉN era la cita que estorbaba: los dos daban por
// hecho que era de un tercero y lo decían. Muchas veces ese "tercero" era el
// propio cliente medio minuto antes — la respuesta del primer intento no le
// llegó al móvil y volvió a darle al botón. Se le acusaba a alguien inventado
// de quitarle un hueco que ya era suyo, y se iba creyendo que no tenía cita.
//
// Aquí se mira antes de acusar a nadie. Devuelve las filas de la reserva que
// YA existe cuando coincide exactamente con lo que se estaba pidiendo, o null.
// Ante cualquier duda —otro teléfono, otro servicio, otro número de personas,
// un fallo al preguntar— devuelve null y se contesta el mensaje de siempre:
// equivocarse hacia el mensaje de hoy no rompe nada, equivocarse hacia la
// confirmación le enseñaría a alguien una cita que no es la suya.
//
// Esto NO afloja la garantía: sigue siendo la restricción de exclusión de
// Postgres la que rechaza. Lo único que cambia es qué se contesta después.
async function reservaYaGuardada(supabase, { phone, dateKey, barberId, starts, serviceIds }) {
  const grouped = starts.length > 1;

  // La cita que ocupa la PRIMERA hora del tramo que se pedía. Una cancelada no
  // cuenta: el hueco volvió a estar libre y esto sería una reserva nueva.
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("customer_phone", phone)
    .eq("appointment_date", dateKey)
    .eq("barber_id", barberId)
    .eq("start_time", starts[0])
    .neq("status", "cancelled");
  if (error) throw new Error(error.message);
  // Exactamente una. La restricción de exclusión no deja dos sin cancelar a la
  // misma hora con el mismo barbero, así que otra cosa es algo que no entiendo
  // y no es sobre lo que se contesta una confirmación.
  if (!data || data.length !== 1) return null;
  const anchor = data[0];

  // Una sola persona. Tiene que ser una cita suelta y del mismo servicio: si
  // lo que hay guardado es un grupo, o es otro servicio, no es esta reserva.
  if (!grouped) {
    if (anchor.group_id != null) return null;
    if (anchor.service_id !== serviceIds[0]) return null;
    return [anchor];
  }

  // Un grupo se busca entero por su `group_id`: devolver sólo la fila que
  // chocó dejaría al cliente viendo la confirmación de una persona cuando
  // reservó tres.
  if (anchor.group_id == null) return null;
  const { data: rows, error: gErr } = await supabase
    .from("appointments")
    .select("*")
    .eq("group_id", anchor.group_id)
    .neq("status", "cancelled");
  if (gErr) throw new Error(gErr.message);
  if (!rows) return null;

  const ordered = rows.slice().sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  // Distinto número de personas, distintas horas, distintos servicios: no es
  // la misma reserva llegando dos veces.
  if (ordered.length !== starts.length) return null;
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    if (r.customer_phone !== phone) return null;
    if (String(r.appointment_date) !== String(dateKey)) return null;
    if (r.barber_id !== barberId) return null;
    if (String(r.start_time).slice(0, 5) !== starts[i]) return null;
    if (r.service_id !== serviceIds[i]) return null;
  }
  return ordered;
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
      // El tope de reservas por rato, antes de crear nada. Va aquí dentro y no
      // arriba con el plazo porque hay que preguntarle a la base de datos, y
      // un fallo al preguntar tiene que salir por el mismo sitio que los demás.
      //
      // Exento con un pase válido, exactamente igual que el plazo y que el
      // tope de personas: Félix apunta desde su panel toda la mañana lo que le
      // van pidiendo por teléfono. Un pase ausente, caducado o inventado cae al
      // límite público.
      if (requireAdmin(req) !== null && await haLlegadoAlTopeDeCitas(supabase, phone)) {
        return respuestaTope(res, "citas");
      }

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
          // Antes de decirle a nadie que le han quitado el hueco: mirar de
          // quién es. Si la cita que estorba es de este mismo teléfono, el
          // mismo día, la misma hora y el mismo barbero, no es un choque —
          // es la misma reserva llegando dos veces, porque la respuesta de la
          // primera no llegó o porque volvió a darle al botón.
          let yaGuardada = null;
          try {
            yaGuardada = await reservaYaGuardada(supabase, {
              phone,
              dateKey,
              barberId: barber.id,
              starts,
              serviceIds: chosen.map((s) => s.id),
            });
          } catch (e) {
            // Mirar de quién es el hueco va ENCIMA del rechazo, nunca en su
            // lugar: si falla, se contesta exactamente lo de siempre.
            console.warn("[reserva] no se pudo comprobar si el hueco ya era suyo:", e.message);
            yaGuardada = null;
          }

          if (yaGuardada) {
            // La reserva temporal sobra igual que en el camino normal: la
            // cita existe. Que no se borre no rompe nada, caduca sola.
            if (holdId) {
              try {
                await supabase.from("slot_holds").delete().eq("id", holdId);
              } catch {
                // Caduca sola.
              }
            }
            const mismo = yaGuardada.map(appointmentOut).sort((a, b) => a.time.localeCompare(b.time));
            // AQUÍ NO SE INSERTA NADA: la respuesta se construye con la fila
            // que ya estaba en la base de datos, y eso es lo que garantiza que
            // de aquí no puede salir una cita duplicada.
            //
            // Y NO se llama a `tellShop`: no se ha reservado nada nuevo, así
            // que el móvil de Félix no tiene por qué volver a sonar. Un aviso
            // repetido por una reserva que no existe es ruido que enseña a
            // ignorar los avisos.
            return res.status(201).json({ ok: true, appointment: mismo[0], appointments: mismo });
          }

          // De otra persona: no cambia nada, palabra por palabra.
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
      waitUntil(tellShop(supabase, out, "booked", req));
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
        waitUntil(tellShop(supabase, cancelled, "cancelled", req));
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
      //
      // Marcar "no se presentó" borra además la forma de pago: quien no vino
      // no pagó, y un cobro apuntado a un ausente descuadraría las cifras del
      // panel, que suman 0 € por él. La regla contraria vive en /api/cobro,
      // donde marcar un cobro quita la marca de ausente.
      const cambios = status === "cancelled"
        ? { status, cancelled_at: new Date().toISOString() }
        : status === "no_show"
          ? { status, cancelled_at: null, payment_method: null }
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
      if (status === "cancelled") waitUntil(tellShop(supabase, [appt], "cancelled", req));
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
