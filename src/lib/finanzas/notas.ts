// Portal AF4 360° › Notas a los estados financieros (`fin_notas_mes`, migración 0929). Lógica pura: limpia el texto que
// escribe una persona (formato simple de los manuales: «## título», «- punto», «1. paso»; nunca HTML: se muestra como
// texto con `TextoManual`). Prueba en `notas.test.ts`.

export const MAX_NOTA = 20000;
export const SIN_MIGRACION_NOTAS = "Falta correr la migración 0929 (estados financieros) en Supabase.";

/**
 * El texto de una nota listo para guardar: sin caracteres de control (salvo saltos de línea y tabuladores), con saltos de
 * línea normalizados y sin espacios sobrantes al final de cada línea. Vacío = borrar la nota. Error si es muy largo.
 */
export function limpiarNota(v: unknown): { texto: string } | { error: string } {
  if (typeof v !== "string") return { error: "Nota inválida." };
  const texto = v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (texto.length > MAX_NOTA) return { error: `La nota pasa de ${MAX_NOTA.toLocaleString("es")} caracteres.` };
  return { texto };
}

/** «2026-10» o «2026-10-01» → «2026-10-01»; otra cosa, null. */
export function leerMesNota(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/);
  return m ? `${m[1]}-${m[2]}-01` : null;
}
