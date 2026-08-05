// Las dos rutas que hablan de la fecha de la última copia —la que la lee
// (/api/admin-data) y la que la escribe (/api/admin)— tienen que usar
// exactamente la misma clave. Escrita dos veces, una errata en una de ellas
// daría un panel que siempre dice "nunca" por mucho que se descargue.
//
// Vive en app_meta, que es una tabla de clave y valor y ya guarda la versión
// del esquema. No hace falta ninguna tabla nueva ni ninguna migración.
export const CLAVE_ULTIMA_COPIA = "last_backup_at";
