// La sesión del panel de barbero.
//
// La clave del panel vive SOLO en la variable de entorno ADMIN_PASSWORD, se
// lee únicamente aquí, y este fichero está en api/, que Vercel ejecuta en el
// servidor. Nunca se empaqueta en el JavaScript que descarga el navegador.
// Igual que api/_lib/supabase.js con la clave de la base de datos: si alguien
// importa esto desde src/, la clave acaba en el móvil de cada cliente.
//
// Lo único que viaja al navegador es un pase firmado con una fecha de
// caducidad dentro. No contiene la clave ni permite deducirla.
import crypto from "node:crypto";

// Cuánto dura una sesión del panel. Lo acordado con el cliente: 1 hora.
export const SESSION_SECONDS = 3600;

// Etiqueta de la derivación. Cambiarla invalida todos los pases emitidos.
const SIGNING_CONTEXT = "felix-admin-session-v1";

// La contraseña configurada, o null si no la hay. Nunca se devuelve al
// navegador; solo se usa para comparar y para firmar.
export function getAdminPassword() {
  const p = process.env.ADMIN_PASSWORD;
  return typeof p === "string" && p.length > 0 ? p : null;
}

// La clave de firma se DERIVA de la contraseña, en vez de pedir una segunda
// variable de entorno. Dos cosas se ganan con eso: el cliente solo tiene que
// configurar una variable a mano, y cambiar la contraseña en Vercel invalida
// por sí solo todas las sesiones abiertas — que es justo lo que hace que
// cambiarla sirva de algo.
function signingKey(password) {
  return crypto.createHmac("sha256", password).update(SIGNING_CONTEXT).digest();
}

function sign(password, payload) {
  return crypto.createHmac("sha256", signingKey(password)).update(payload).digest();
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Comparación en tiempo constante. Se comparan los resúmenes y no las cadenas
// directamente: así los dos lados miden siempre 32 bytes, timingSafeEqual no
// puede lanzar por longitudes distintas, y ni siquiera la longitud de la
// contraseña se filtra por lo que tarda en contestar.
export function passwordMatches(candidate, password) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const a = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const b = crypto.createHash("sha256").update(password, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueToken(password, now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = b64url(JSON.stringify({ exp }));
  return `${payload}.${b64url(sign(password, payload))}`;
}

// Un pase vale si la firma es nuestra y si no ha caducado. Lo que venga dentro
// del pase no decide nada hasta que la firma está comprobada: primero se
// verifica, después se lee.
export function verifyToken(token, password, now = Date.now()) {
  if (typeof token !== "string") return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(b64url(sign(password, payload)));
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!claims || typeof claims.exp !== "number") return false;
  return claims.exp * 1000 > now;
}

// Guarda una petición de administración. Devuelve null si viene identificada,
// y si no, la respuesta que hay que darle ya montada.
//
// Se llama ANTES de mirar el cuerpo de la petición: nada de lo que mande quien
// no se ha identificado llega a interpretarse.
//
// Sin ADMIN_PASSWORD configurada NO se abre la puerta: se cierra. Una
// configuración a medias nunca puede acabar en un panel abierto a cualquiera.
export function requireAdmin(req) {
  const password = getAdminPassword();
  if (!password) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: "not_configured",
        message: "Falta configurar la clave del panel en el servidor.",
      },
    };
  }

  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const token = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;

  if (!token || !verifyToken(token, password)) {
    return {
      status: 401,
      body: {
        ok: false,
        reason: "unauthorized",
        message: "Tu sesión ha caducado. Vuelve a entrar con tu clave.",
      },
    };
  }

  return null;
}
