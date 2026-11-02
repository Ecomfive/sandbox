// Reglas de la contraseña que elige una persona del equipo (31 oct 2026, pedido de Alcides). Puras, para probarlas; las aplica
// `cambiarMiContrasena` en el servidor. El portal de Shen Zhen tiene las suyas (en chino y español) en `proveedor/actions.ts`.

export const MIN_CONTRASENA = 8;
/** Supabase (bcrypt) solo usa los primeros 72 bytes: más larga no protege más y se rechaza. */
export const MAX_CONTRASENA = 72;

/** Lo que falla de una contraseña nueva, en palabras; null si sirve. */
export function errorContrasenaNueva(actual: string, nueva: string, repetida: string): string | null {
  if (!actual) return "Escribe tu contraseña actual.";
  if (nueva.length < MIN_CONTRASENA) return `La contraseña nueva debe tener al menos ${MIN_CONTRASENA} caracteres.`;
  if (new TextEncoder().encode(nueva).length > MAX_CONTRASENA) return "La contraseña nueva es muy larga.";
  if (nueva.trim() !== nueva) return "La contraseña nueva no puede empezar ni terminar con un espacio.";
  if (nueva !== repetida) return "Las dos contraseñas nuevas no coinciden.";
  if (nueva === actual) return "La contraseña nueva debe ser distinta de la actual.";
  return null;
}

/** Si la cuenta entra con una contraseña temporal que le dio un administrador (marca `clave_temporal` de su `app_metadata`). */
export const tieneContrasenaTemporal = (usuario: { app_metadata?: Record<string, unknown> } | null | undefined): boolean =>
  usuario?.app_metadata?.clave_temporal === true;
