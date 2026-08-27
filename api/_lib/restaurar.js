// Meter una copia de seguridad de vuelta. La otra mitad de `copia.js`.
//
// Vive en _lib/ y no en una ruta propia POR EL MISMO MOTIVO que la copia:
// `api/` está en 12 ficheros de función, que es exactamente el techo por
// despliegue del plan Hobby de Vercel, y el número 13 no despliega. Todo lo
// que empieza por "_" lo ignora Vercel. Se llega por una rama POST de
// /api/admin-data — la ruta que ENTREGA la copia es la que la recibe de
// vuelta— y allí la llave del panel ya está comprobada antes de mirar nada.
//
// ------------------------------------------------------------------------
// ESTO SÓLO AÑADE. Nunca borra, nunca pisa, nunca actualiza.
// ------------------------------------------------------------------------
//
// No es una precaución: es la decisión que quita el peligro de en medio. Un
// botón de restaurar que sustituyera lo que hay sería el único de toda la
// aplicación capaz de destruir datos buenos —las citas de esta semana, si el
// archivo es viejo— y por eso no existe. Con "sólo añade", pulsarlo con el
// fichero equivocado no puede hacer daño, y por eso tampoco lleva ningún aviso
// nuclear. En este fichero no hay ni un `.delete()` ni un `.update()`, y no
// puede haberlos. Si alguna vez hace falta un "reemplazar todo", es otra cosa,
// con otro riesgo, y necesita su propia conversación.
import { motivoCopiaInvalida } from "../../shared/formato-copia.js";
import { claveDeDia } from "../../shared/plazo-reserva.js";

// El orden NO es decorativo: hay claves ajenas de verdad.
//   appointments.barber_id  → barbers.id
//   appointments.service_id → services.id
//   waitlist.service_id     → services.id
// Meter las citas antes que los servicios y los barberos falla. Con cada tabla
// va su clave primaria, que es contra la que se resuelve el "ya está" — todas
// las tablas de la copia tienen una (comprobado en producción).
export const ORDEN_RESTAURACION = [
  ["services", "id"],
  ["barbers", "id"],
  ["schedule_ranges", "id"],
  ["blocked_days", "block_date"],
  ["blocked_ranges", "id"],
  ["festivos", "festivo_date"],
  ["vacation_ranges", "id"],
  ["daily_closes", "close_date"],
  ["appointments", "id"],
  ["waitlist", "id"],
];

// Lo que la copia NO trae, y que por tanto tampoco se toca aquí: `push_keys` y
// `push_subscriptions` (se regeneran pulsando "Activar" en el móvil),
// `slot_holds` (caducan solas en cinco minutos) y `app_meta` (contabilidad de
// la propia aplicación). Y la fecha de la última copia NO se mueve al
// restaurar: restaurar no es hacer una copia. Si un documento manipulado trae
// una tabla de más, se ignora — sólo se recorre la lista de arriba.

// Cuántas filas se mandan de una vez. Bastante por debajo del tamaño de cuerpo
// que aguanta PostgREST, y lo bastante pequeño como para que un lote que hay
// que reintentar fila a fila por un choque de solapamiento no sea caro.
const LOTE = 200;

// El código de Postgres de una violación de restricción de exclusión. Es el
// que lanza `appointments_no_overlap` cuando la cita de la copia se solapa con
// otra que hoy ocupa ese hueco.
const CHOQUE_SOLAPAMIENTO = "23P01";

// Un documento que no vale se dice, y no se escribe NI UNA FILA.
export class CopiaInvalida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "CopiaInvalida";
  }
}

// Lo mismo que mira el navegador antes de mandar nada, mirado otra vez aquí:
// lo del navegador es una comodidad y se puede saltar llamando a la ruta a
// pelo. La comprobación de verdad es ésta.
export function validarCopia(doc) {
  const motivo = motivoCopiaInvalida(doc);
  if (motivo) throw new CopiaInvalida(motivo);
}

// ---------------------------------------------------------------------------
// La purga anual, que es la trampa de todo esto.
//
// Un pg_cron borra al año los datos personales de las citas —nombre, teléfono,
// correo y las columnas raw_*— y borra enteras las entradas de la lista de
// espera. El AVISO DE PRIVACIDAD PUBLICADO dice que eso pasa. Una copia de hace
// meses lleva dentro esos datos sin borrar: meterla tal cual resucitaría datos
// que legalmente ya estaban eliminados y dejaría en falso un documento legal.
//
// Así que al restaurar se aplica el mismo vaciado que aplica la purga. La fila
// vuelve —el dinero y el recuento vuelven—, la persona no. Esto NO es opcional
// y no es una mejora: es lo que hace que lo publicado siga siendo verdad.
// ---------------------------------------------------------------------------

// El día a partir del cual una cita conserva a su persona. La purga compara
// contra `current_date - interval '1 year'`; aquí el "hoy" se lee en la hora de
// la barbería y no en el UTC del servidor, como en todo lo demás.
function limitePersonal(ahora = new Date()) {
  const [y, m, d] = claveDeDia(ahora).split("-").map(Number);
  // Un año natural hacia atrás sobre una fecha ya sin hora. El 29 de febrero
  // cae en el 1 de marzo, que es lo que hace Postgres al restar un año a un
  // día que no existe en el año anterior... y da igual por un día: el efecto de
  // equivocarse aquí es vaciar una cita un día antes o después, nunca resucitar
  // a nadie que llevara meses borrado.
  const t = new Date(Date.UTC(y - 1, m - 1, d));
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

// Exactamente las seis columnas que vacía `purge_expired_personal_data`, y con
// exactamente los mismos valores: cadena vacía en nombre y teléfono, porque el
// NOT NULL sigue en pie, y NULL en el correo y en los raw_*.
function sinPersona(fila) {
  return {
    ...fila,
    customer_name: "",
    customer_phone: "",
    customer_email: null,
    raw_name: null,
    raw_phone: null,
    raw_email: null,
  };
}

// ---------------------------------------------------------------------------
// Meter filas
// ---------------------------------------------------------------------------

// `upsert` con `ignoreDuplicates: true` es, en Postgres,
// `INSERT ... ON CONFLICT DO NOTHING`: una fila cuya clave primaria ya existe
// no se toca, ni siquiera se lee. ESO es el "sólo añade", y `ignoreDuplicates`
// NO ES OPCIONAL — sin él, `upsert` sobrescribe, que es exactamente lo que se
// ha decidido no hacer. Con `.select()` vuelven sólo las filas que de verdad
// entraron, así que contar es restar.
async function meterLote(supabase, tabla, clave, filas) {
  const { data, error } = await supabase
    .from(tabla)
    .upsert(filas, { onConflict: clave, ignoreDuplicates: true })
    .select(clave);
  if (error) return { error };
  const metidas = (data || []).length;
  return { metidas, yaEstaban: filas.length - metidas };
}

// `ON CONFLICT DO NOTHING` NO cubre la restricción de exclusión: sólo atrapa
// choques de clave primaria o única. Una cita `booked` de la copia cuyo hueco
// ocupe hoy OTRA cita distinta lanza 23P01 y, en un INSERT de varias filas,
// tira la sentencia entera — con lo que un solo choque dejaría sin restaurar
// todas las demás. Por eso el lote que devuelve 23P01 se reintenta fila a fila:
// se salta la que choca, se cuenta, y las demás entran.
//
// NUNCA se relaja la restricción, ni se desactiva, ni se borra la fila que
// estorba para hacer sitio. La cita que hoy ocupa ese hueco es una cita real de
// un cliente real: la de la copia se salta y se dice. Esa restricción se puso
// justamente para que no se perdieran reservas, y restaurar no es motivo para
// tocarla.
async function meterUnaAUna(supabase, tabla, clave, filas) {
  let metidas = 0, yaEstaban = 0, saltadas = 0;
  for (const fila of filas) {
    const { data, error } = await supabase
      .from(tabla)
      .upsert([fila], { onConflict: clave, ignoreDuplicates: true })
      .select(clave);
    if (error) {
      if (error.code === CHOQUE_SOLAPAMIENTO) { saltadas++; continue; }
      throw new Error(`${tabla}: ${error.message}`);
    }
    if ((data || []).length) metidas++; else yaEstaban++;
  }
  return { metidas, yaEstaban, saltadas };
}

async function meterTabla(supabase, tabla, clave, filas) {
  const cuenta = { metidas: 0, yaEstaban: 0, saltadas: 0, omitidas: 0 };
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const r = await meterLote(supabase, tabla, clave, lote);
    if (!r.error) {
      cuenta.metidas += r.metidas;
      cuenta.yaEstaban += r.yaEstaban;
      continue;
    }
    if (r.error.code !== CHOQUE_SOLAPAMIENTO) {
      throw new Error(`${tabla}: ${r.error.message}`);
    }
    const uno = await meterUnaAUna(supabase, tabla, clave, lote);
    cuenta.metidas += uno.metidas;
    cuenta.yaEstaban += uno.yaEstaban;
    cuenta.saltadas += uno.saltadas;
  }
  return cuenta;
}

// Lo que se le manda a la base de datos por cada tabla: las filas de la copia,
// con el vaciado de la purga aplicado a lo que ya tocaba, y con las entradas de
// la lista de espera de más de un año fuera del todo — que es lo que la purga
// hace con ellas.
function prepararFilas(tabla, filas, ahora) {
  if (tabla === "appointments") {
    const limite = limitePersonal(ahora);
    return {
      filas: filas.map((f) => (
        typeof f.appointment_date === "string" && f.appointment_date < limite ? sinPersona(f) : f
      )),
      omitidas: 0,
    };
  }
  if (tabla === "waitlist") {
    const limite = new Date(ahora.getTime() - 365 * 86400000).toISOString();
    const vivas = filas.filter((f) => !(typeof f.created_at === "string" && f.created_at < limite));
    return { filas: vivas, omitidas: filas.length - vivas.length };
  }
  return { filas, omitidas: 0 };
}

// El informe que vuelve al navegador: por tabla, cuántas filas se metieron,
// cuántas ya estaban, cuántas se saltaron por solapamiento y cuántas se
// omitieron por viejas. SIN NOMBRES NI TELÉFONOS: es un recuento.
export async function restaurarCopia(supabase, doc, ahora = new Date()) {
  validarCopia(doc);

  const tablas = {};
  const totales = { metidas: 0, yaEstaban: 0, saltadas: 0, omitidas: 0 };

  // En serie y en el orden de dependencias, por el mismo motivo por el que la
  // copia se arma en serie: son diez tablas contra el plan gratuito, y meter
  // las citas antes que sus servicios y sus barberos simplemente falla.
  for (const [tabla, clave] of ORDEN_RESTAURACION) {
    const crudas = doc.tables[tabla];
    if (!Array.isArray(crudas) || crudas.length === 0) {
      tablas[tabla] = { metidas: 0, yaEstaban: 0, saltadas: 0, omitidas: 0 };
      continue;
    }
    const { filas, omitidas } = prepararFilas(tabla, crudas, ahora);
    const cuenta = filas.length
      ? await meterTabla(supabase, tabla, clave, filas)
      : { metidas: 0, yaEstaban: 0, saltadas: 0, omitidas: 0 };
    cuenta.omitidas = omitidas;
    tablas[tabla] = cuenta;
    for (const k of Object.keys(totales)) totales[k] += cuenta[k];
  }

  const informe = { generada: typeof doc.generated_at === "string" ? doc.generated_at : null, tablas, totales };

  // Y queda escrito en el servidor, por el mismo motivo por el que fail()
  // escribe: una restauración que sólo se le cuenta al navegador desaparece al
  // cerrar la pestaña, y ésta es justo la operación que alguien va a querer
  // reconstruir después. Son recuentos, así que no hay nada personal que
  // filtrar aquí.
  console.log(`[api] restauración copia=${informe.generada || "sin fecha"} ${JSON.stringify(tablas)}`);

  return informe;
}
