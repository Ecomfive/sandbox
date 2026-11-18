// Cerrar las sesiones de una cuenta al suspenderla o al darle una clave nueva (auditoría de seguridad, 18 nov 2026): lo que no depende de la
// base, para poder probarlo. Lo que llama a Supabase está en `sesiones-cuenta.ts`.

/**
 * El bloqueo de ingreso de una cuenta suspendida (`ban_duration` de Supabase Auth): sin fecha de fin real (100 años). Con él no puede entrar
 * con su clave ni renovar la sesión; al reactivarla se quita con `"none"`.
 */
export const BLOQUEO_SUSPENDIDA = "876000h";

/** La función de la migración 0318 que borra sus sesiones (y con ellas sus tokens de renovación). */
export const FUNCION_CERRAR_SESIONES = "cerrar_sesiones_usuario";

export const FALTA_MIGRACION_SESIONES = "falta correr la migración 0318 en Supabase";

/** Si el error de la llamada es «esa función todavía no existe» (la migración 0318 sin correr). */
export function esFuncionSinMigrar(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  const codigo = String(e?.code ?? "");
  if (codigo === "PGRST202" || codigo === "42883") return true;
  return new RegExp(`Could not find the function.*${FUNCION_CERRAR_SESIONES}`, "i").test(String(e?.message ?? ""));
}

/** Por qué no se cerraron sus sesiones, en palabras para quien administra. */
export function motivoFallaSesiones(error: unknown): string {
  return esFuncionSinMigrar(error) ? FALTA_MIGRACION_SESIONES : "la base no respondió";
}

export interface ResultadoSalida {
  /** Se le puso el bloqueo de ingreso (no puede volver a entrar ni renovar la sesión). */
  bloqueada: boolean;
  /** Se borraron sus sesiones abiertas. */
  sesionesCerradas: boolean;
  /** Lo que falló, ya en palabras (vacío si todo salió bien). */
  fallas: string[];
}

/**
 * El aviso para quien suspendió, si algo de la salida falló: la suspensión ya quedó guardada (el sistema la deja fuera en la próxima página),
 * pero tiene que saber que su sesión puede seguir viva un rato. Sin fallas, null.
 */
export function avisoTrasSuspender(r: ResultadoSalida): string | null {
  if (r.fallas.length === 0) return null;
  const queda = r.bloqueada
    ? "No podrá volver a entrar, pero la sesión que tenga abierta puede seguir hasta una hora"
    : "Su sesión abierta puede seguir viva hasta que venza";
  return `Quedó suspendida y el sistema ya no le abre ninguna página. ${queda}: ${r.fallas.join("; ")}.`;
}

/** El aviso tras darle una contraseña temporal, si no se pudieron cerrar sus otras sesiones. */
export function avisoTrasClaveNueva(fallaSesiones: string | null): string | null {
  if (!fallaSesiones) return null;
  return `La contraseña quedó cambiada, pero no se pudo confirmar que se cerraran sus sesiones abiertas: ${fallaSesiones}.`;
}

/** Lo que queda anotado en el historial sobre la salida de la cuenta. */
export function detalleSalida(r: ResultadoSalida): string {
  if (r.fallas.length === 0) return "Se le bloqueó el ingreso y se cerraron sus sesiones abiertas";
  const partes = [r.bloqueada ? "ingreso bloqueado" : "no se pudo bloquear el ingreso", r.sesionesCerradas ? "sesiones cerradas" : "no se pudieron cerrar sus sesiones"];
  return `${partes.join(", ")} (${r.fallas.join("; ")})`;
}

/** El nombre del rol para el historial: «Sin rol» si no tiene, o el id si el rol ya no existe. */
export function textoRol(rolId: string | null, nombres: Record<string, string>): string {
  if (!rolId) return "Sin rol";
  return nombres[rolId] ?? rolId;
}
