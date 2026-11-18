// Secretos propios de cada función en vez de derivados de la clave de servicio de Supabase (auditoría de seguridad, 18 nov 2026).
// Un secreto derivado ata sistemas que no tienen nada que ver: rotar la clave de servicio rompe las llaves de la extensión, los tokens de
// iComfly y las llaves de clientes a la vez. Mientras la variable propia no esté (o sea corta), cada función sigue con lo de antes y
// Estado del sistema lo muestra como pendiente (`estado-sistema.ts`). Sin base ni React, con prueba (`secretos-propios.test.ts`).

/** Largo mínimo de un secreto propio (32 caracteres: `openssl rand -hex 32` da 64). */
export const LARGO_MINIMO_SECRETO = 32;

/** El texto de la variable si sirve como secreto propio (sin espacios al borde y de al menos 32 caracteres); si no, null. */
export function secretoPropio(texto: string | undefined | null): string | null {
  const t = (texto ?? "").trim();
  return t.length >= LARGO_MINIMO_SECRETO ? t : null;
}

/** Cómo está un secreto propio: configurado y largo, sin configurar, o configurado pero corto. Nunca el valor. */
export type EstadoSecretoPropio = "propio" | "falta" | "corto";

export function estadoSecretoPropio(texto: string | undefined | null): EstadoSecretoPropio {
  if (secretoPropio(texto)) return "propio";
  return (texto ?? "").trim() ? "corto" : "falta";
}
