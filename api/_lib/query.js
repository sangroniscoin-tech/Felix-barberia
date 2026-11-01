// Lee un parámetro de la URL de la petición (?nombre=valor).
//
// No se usa `req.query`: Vercel lo rellena con `url.parse()`, que Node da por
// obsoleto y que llenaba los registros con el aviso DEP0169 en cada visita.
// `URL` es la forma estándar y da lo mismo. Si el parámetro viene repetido se
// queda con el primero; si no viene, devuelve undefined, como `req.query`.
export function leerParam(req, nombre) {
  try {
    const valor = new URL(req.url || "/", "http://localhost").searchParams.get(nombre);
    return valor === null ? undefined : valor;
  } catch {
    return undefined;
  }
}
