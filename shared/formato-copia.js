// Qué es una copia de seguridad de esta web, y cómo se reconoce.
//
// Este fichero lo leen LAS DOS PUERTAS, igual que `plazo-reserva.js`: el
// navegador, que mira el archivo que Félix elige del móvil ANTES de mandarlo
// —para poder decirle "esto no es una copia de tu web" sin gastar un viaje—, y
// el servidor, que vuelve a mirarlo porque lo del navegador es una comodidad y
// se puede saltar. Por eso vive fuera de los dos: no importa nada, no depende
// de nada y no toca ninguna credencial. No importes aquí nada de `api/_lib/`.
//
// El motivo de que el número esté en un solo sitio: si el navegador conociera
// un formato y el servidor otro, rechazarían archivos distintos, y el que
// decide es el servidor. Un sitio, dos lectores.

// Qué versión de este formato es el fichero. Es lo que permitirá leer dentro
// de dos años una copia hecha hoy: si las tablas cambian de forma, este número
// sube y quien la lea sabrá contra qué esquema mirarla.
export const FORMATO_COPIA = 1;

// La marca de la casa. Un JSON cualquiera del móvil no la lleva.
export const APP_COPIA = "felix-barberia";

// Por qué ese documento no vale, o null si vale. Devuelve el texto que se le
// enseña a Félix, ya en castellano: las dos puertas lo pintan tal cual.
//
// Un `format_version` MAYOR que el que este código conoce también se rechaza.
// Leer un formato del futuro adivinando lo que traiga dentro es cómo se
// corrompe una restauración, y una restauración corrupta se descubre tarde.
export function motivoCopiaInvalida(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return "Ese archivo no es una copia de seguridad: no se entiende lo que lleva dentro.";
  }
  if (doc.app !== APP_COPIA) {
    return "Ese archivo no es una copia de esta web. Busca el que empieza por “copia-felix-barberia”.";
  }
  if (typeof doc.format_version !== "number" || !Number.isFinite(doc.format_version)) {
    return "Ese archivo no dice qué formato de copia es, así que no me fío de él.";
  }
  if (doc.format_version > FORMATO_COPIA) {
    return "Esa copia es de una versión más nueva de la web que la que hay ahora mismo. No la sé leer.";
  }
  if (doc.format_version < FORMATO_COPIA) {
    return "Esa copia es de un formato antiguo que esta versión ya no sabe leer.";
  }
  if (!doc.tables || typeof doc.tables !== "object" || Array.isArray(doc.tables)) {
    return "Ese archivo está incompleto: no lleva las tablas dentro.";
  }
  return null;
}
