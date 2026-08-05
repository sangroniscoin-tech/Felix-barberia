// La copia de seguridad: el volcado entero de lo que hace falta para
// reconstruir la barbería si algún día no quedase nada.
//
// Vive en _lib/ y no en una ruta propia A PROPÓSITO. `api/` está en 12
// ficheros de función, que es exactamente el techo por despliegue del plan
// Hobby de Vercel: el número 13 no despliega. Todo lo que empieza por "_" lo
// ignora Vercel, así que esto es código compartido y no una función más. La
// copia sale por /api/admin-data?copia=1, que ya es la puerta con llave del
// panel. Si algún día hace falta una ruta propia, es una decisión de plan.
//
// Es una operación de SÓLO LECTURA. Aquí no hay ni un INSERT, ni un UPDATE ni
// un DELETE, y no puede haberlos: descargarse una copia no puede cambiar una
// cita, un precio ni un cierre. La única escritura que acompaña a esto —la
// fecha de la última copia— vive aparte, en /api/admin.

// Qué versión de este formato es el fichero. Es lo que permitirá leer dentro
// de dos años una copia hecha hoy: si las tablas cambian de forma, este número
// sube y quien la lea sabrá contra qué esquema mirarla.
export const FORMATO_COPIA = 1;

// Las tablas de negocio, con la columna por la que se ordenan. El orden no es
// decorativo: dos copias seguidas tienen que salir iguales, y sin ORDER BY
// Postgres no promete devolver las filas en el mismo orden dos veces.
//
// Lo que NO entra, y por qué:
//  - `push_keys` y `push_subscriptions`: no son datos del negocio. Se vuelven a
//    generar activando los avisos otra vez desde el móvil.
//  - `slot_holds`: reservas temporales de cinco minutos. Caducan solas; copiar
//    algo que muere en cinco minutos no reconstruye nada.
//  - `app_meta`: la versión del esquema y la fecha de esta misma copia. Es
//    contabilidad de la propia aplicación, no del negocio.
const TABLAS = [
  ["appointments", "id"],
  ["waitlist", "id"],
  ["services", "sort_order"],
  ["barbers", "id"],
  ["schedule_ranges", "id"],
  ["blocked_days", "block_date"],
  ["blocked_ranges", "id"],
  ["festivos", "festivo_date"],
  ["vacation_ranges", "id"],
  ["daily_closes", "close_date"],
];

// Cuántas filas se piden de una vez. PostgREST corta las respuestas por arriba
// —mil filas por defecto en Supabase—, así que una sola consulta devolvería la
// agenda RECORTADA en cuanto la barbería pase de ese número, y lo haría sin
// decir nada. Una copia recortada en silencio es peor que no tenerla: parece
// completa. Por eso se pide por trozos hasta que un trozo viene corto.
const TROZO = 1000;

async function traerTodo(supabase, tabla, orden) {
  const filas = [];
  for (let desde = 0; ; desde += TROZO) {
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .order(orden)
      .range(desde, desde + TROZO - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < TROZO) return filas;
  }
}

// El documento entero, tal y como cae en el móvil de Félix.
//
// Las filas van CRUDAS, con los nombres de columna de la base de datos y no
// con los que usa la pantalla. Esto no es para mirarlo: es para poder volver a
// meterlo. Traducirlo a la forma bonita del panel perdería justo las columnas
// que hoy no se pintan —el estado, la forma de cobro, el `raw_*` de lo que
// vino de la hoja— que son las que harían falta para reconstruirlo.
//
// Las citas van TODAS: las canceladas también, que el panel sólo recibe día a
// día, y las dos filas de ejemplo, que llevan su `is_sample_data` puesto y así
// siguen distinguiéndose. Las que la purga anual ya vació van con el nombre y
// el teléfono vacíos, tal cual: aquí no se inventa nada.
export async function armarCopia(supabase, ahora = new Date()) {
  const tablas = {};
  const counts = {};

  // En serie y no en paralelo: son diez consultas paginadas contra el plan
  // gratuito, y una copia que tarda un segundo más pero llega entera es la que
  // se quería.
  for (const [tabla, orden] of TABLAS) {
    const filas = await traerTodo(supabase, tabla, orden);
    tablas[tabla] = filas;
    counts[tabla] = filas.length;
  }

  return {
    app: "felix-barberia",
    format_version: FORMATO_COPIA,
    generated_at: ahora.toISOString(),
    counts,
    tables: tablas,
  };
}
