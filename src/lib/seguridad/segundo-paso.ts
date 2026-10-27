// Verificación en dos pasos (pedido de Jhokser, 27 oct 2026): la lógica pura, sin base ni red, para poder probarla (segundo-paso.test.ts).
// Después de la contraseña se pide el código de una **app autenticadora** (TOTP, el MFA nativo de Supabase Auth): al verificarlo, la sesión
// sube al nivel «aal2». Quien todavía no la tiene la activa en el mismo ingreso. Por ahora no hay código por correo (se quitó el 27 oct 2026
// hasta tener un dominio de correo verificado), así que quien pierda el celular pide a un administrador que le restablezca la verificación.

/**
 * ¿Está encendida la verificación en dos pasos? Pide `SEGUNDO_PASO=activo`. Es también el interruptor de emergencia: poniendo
 * `SEGUNDO_PASO=desactivado` (o quitando la variable) y volviendo a desplegar, el ingreso queda como antes.
 */
export function segundoPasoActivo(env: Record<string, string | undefined> = process.env): boolean {
  return env.SEGUNDO_PASO === "activo";
}

/** Lo que el usuario escribió, como código de 6 dígitos («123 456», «123-456») o null si no lo es. */
export function normalizarCodigo(texto: unknown): string | null {
  const limpio = String(texto ?? "").replace(/[\s-]/g, "");
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

/** El contenido de un JWT (sin verificarlo: solo se usa con un token que Supabase ya validó con `getUser`). */
function cuerpoDeToken(token: string | undefined | null): Record<string, unknown> | null {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3) return null;
  try {
    const j = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** El nivel de verificación de un token de acceso: `aal2` = ya puso el código de su app autenticadora en esta sesión. */
export function nivelDeToken(token: string | undefined | null): string | null {
  const c = cuerpoDeToken(token);
  return typeof c?.aal === "string" ? c.aal : null;
}
