// Verificación en dos pasos (seguridad · 19 nov 2026): la contraseña y, además, un código de 6 números de una app del celular
// (Google Authenticator, Microsoft Authenticator, 1Password…). Usa el MFA de Supabase Auth con un factor TOTP. Aquí solo la lógica
// pura (sin Next ni Supabase), para probarla; la aplica `getUsuarioActual` en `src/lib/auth.ts` y la pantalla `/dos-pasos`.

/** La página donde se activa o se escribe el código. */
export const RUTA_DOS_PASOS = "/dos-pasos";

/** El nivel de la sesión según Supabase: `aal1` = solo contraseña; `aal2` = contraseña y código. */
export type NivelSesion = "aal1" | "aal2";

/**
 * En qué está la persona con la verificación en dos pasos:
 * - `listo`: esta sesión ya pasó el código (aal2).
 * - `pedir-codigo`: tiene la verificación activa pero esta sesión todavía no escribió el código. **Bloquea.**
 * - `activar`: administra Usuarios y roles, la verificación es obligatoria (`DOS_PASOS_ADMIN`) y no la tiene activa. **Bloquea.**
 * - `invitar`: administra Usuarios y roles sin la verificación activa, pero todavía no es obligatoria: se le invita a activarla.
 * - `libre`: no la tiene y no se le exige.
 */
export type EstadoDosPasos = "listo" | "pedir-codigo" | "activar" | "invitar" | "libre";

/**
 * Si la verificación es obligatoria para quien administra Usuarios y roles: solo con `DOS_PASOS_ADMIN=1` (o `true`). Sin la
 * variable no se exige a nadie que no la tenga activa, para que quien administra la active primero y después se prenda en Vercel.
 */
export function dosPasosObligatorio(env: Record<string, string | undefined>): boolean {
  const v = (env.DOS_PASOS_ADMIN ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Un factor de Supabase Auth, con lo que aquí importa. */
export interface FactorAuth {
  id: string;
  factor_type?: string;
  status?: string;
}

/** Si la cuenta tiene una app de códigos (TOTP) ya confirmada. Un factor a medio activar (`unverified`) no cuenta. */
export function tieneFactorVerificado(factores: readonly FactorAuth[] | null | undefined): boolean {
  return (factores ?? []).some((f) => f.factor_type === "totp" && f.status === "verified");
}

/** El primer factor TOTP confirmado (el que pide el código al entrar), o null. */
export function factorVerificado(factores: readonly FactorAuth[] | null | undefined): FactorAuth | null {
  return (factores ?? []).find((f) => f.factor_type === "totp" && f.status === "verified") ?? null;
}

/**
 * El estado de la persona. `administra` sale de sus permisos REALES (no de «Ver así»); `nivel`, del token que Supabase ya
 * comprobó; `tieneFactor`, de la respuesta de Supabase (no de la cookie). Quien ya activó la verificación siempre escribe el código,
 * esté o no prendida `DOS_PASOS_ADMIN`: una verificación que se puede saltar no protege nada.
 */
export function estadoDosPasos(p: { administra: boolean; nivel: NivelSesion | null; tieneFactor: boolean; obligatorio: boolean }): EstadoDosPasos {
  if (p.nivel === "aal2") return "listo";
  if (p.tieneFactor) return "pedir-codigo";
  if (!p.administra) return "libre";
  return p.obligatorio ? "activar" : "invitar";
}

/** Si con ese estado la persona todavía no entra al sistema (no recibe sus módulos). */
export function bloqueaPorDosPasos(estado: EstadoDosPasos | null | undefined): boolean {
  return estado === "pedir-codigo" || estado === "activar";
}

/**
 * El nivel (`aal`) que dice un token de acceso de Supabase. Solo lee el contenido: se usa con un token que Supabase acaba de
 * comprobar (`getUser(token)`), nunca con uno sin comprobar. Cualquier cosa rara vale como `aal1` (lo más estricto).
 */
export function nivelDelToken(token: string | null | undefined): NivelSesion | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return "aal1";
  try {
    const base64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const relleno = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const datos = JSON.parse(atob(relleno)) as { aal?: unknown };
    return datos.aal === "aal2" ? "aal2" : "aal1";
  } catch {
    return "aal1";
  }
}

/** El código que escribió la persona, sin espacios ni guiones; null si no son exactamente 6 números. */
export function limpiarCodigo(codigo: unknown): string | null {
  const limpio = String(codigo ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

/**
 * La imagen del código QR que devuelve Supabase (`data:image/svg+xml;utf-8,<svg…>`) como `data:image/svg+xml;base64,…`, para
 * mostrarla en un `<img>` (un SVG dentro de `<img>` no ejecuta nada) y nunca con `innerHTML`. Si no es un SVG, null.
 */
export function qrComoImagen(qr: string | null | undefined): string | null {
  if (!qr) return null;
  let svg = qr.trim();
  const coma = svg.indexOf(",");
  if (svg.startsWith("data:")) {
    if (coma < 0 || !svg.slice(0, coma).startsWith("data:image/svg+xml")) return null;
    const cabecera = svg.slice(0, coma);
    svg = svg.slice(coma + 1);
    if (cabecera.endsWith(";base64")) {
      try {
        svg = new TextDecoder().decode(Uint8Array.from(atob(svg), (c) => c.charCodeAt(0)));
      } catch {
        return null;
      }
    } else if (/%3c/i.test(svg.slice(0, 12))) {
      try {
        svg = decodeURIComponent(svg);
      } catch {
        return null;
      }
    }
  }
  svg = svg.trim();
  // Antes de <svg> puede venir el encabezado del XML, un <!DOCTYPE> o comentarios (el SVG de Supabase trae «<!-- Generated by SVGo -->»):
  // se aceptan solo esas cosas; cualquier otra cosa antes del <svg> hace que no se muestre (seguridad · 19 nov 2026).
  const PROLOGO = /^(?:\s+|<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->)*/i;
  const resto = svg.replace(PROLOGO, "");
  if (!/^<svg[\s>]/i.test(resto)) return null;
  const bytes = new TextEncoder().encode(svg);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return `data:image/svg+xml;base64,${btoa(binario)}`;
}

/** La clave para escribir a mano, en grupos de 4 (más fácil de copiar). Solo letras y números de base32. */
export function claveEnGrupos(secreto: string | null | undefined): string {
  const limpio = String(secreto ?? "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  return limpio.replace(/(.{4})(?=.)/g, "$1 ");
}

/**
 * A dónde sigue la persona tras escribir el código: una ruta de esta app (empieza con una sola `/`, sin `\`), y nunca de vuelta a
 * `/dos-pasos` ni a `/login`. Cualquier otra cosa, al inicio.
 */
export function destinoTrasDosPasos(volver: string | null | undefined): string {
  const v = String(volver ?? "");
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return "/";
  const ruta = v.split(/[?#]/)[0];
  if (ruta === RUTA_DOS_PASOS || ruta.startsWith(`${RUTA_DOS_PASOS}/`) || ruta === "/login" || ruta.startsWith("/login/")) return "/";
  return v;
}

/** La dirección de `/dos-pasos` con la página a la que iba (si es una ruta válida y no el inicio). */
export function rutaDosPasosDesde(pedida: string | null | undefined): string {
  const destino = destinoTrasDosPasos(pedida);
  return destino === "/" ? RUTA_DOS_PASOS : `${RUTA_DOS_PASOS}?volver=${encodeURIComponent(destino)}`;
}
