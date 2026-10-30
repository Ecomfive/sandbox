/**
 * Datos de un dropshipper que se editan ahí mismo, en el bloque «Datos» de su ficha (CRM y chat de WhatsApp): ciudad, fecha de
 * ingreso y correo. Muchos vinieron de ClickUp; desde el 29 oct 2026 se corrigen con un clic. Aquí vive la regla de cada uno, que el
 * servidor vuelve a aplicar (`cambiarDatoDropshipper`).
 */

export type CampoDato = "ciudad" | "ingreso" | "correo";

export const CAMPOS_DATO: Record<CampoDato, { columna: string; etiqueta: string }> = {
  ciudad: { columna: "ciudad", etiqueta: "Ciudad" },
  ingreso: { columna: "fecha_ingreso", etiqueta: "Ingreso" },
  correo: { columna: "contacto_email", etiqueta: "Correo" },
};

export const esCampoDato = (v: unknown): v is CampoDato => typeof v === "string" && Object.hasOwn(CAMPOS_DATO, v);

const MAX_CIUDAD = 80;
const MAX_CORREO = 120;

/** Deja el valor listo para guardar (vacío = sin dato) o dice qué está mal. `hoy` es AAAA-MM-DD: el ingreso no puede ser futuro. */
export function normalizarDato(campo: CampoDato, valor: string, hoy: string): { valor: string | null } | { error: string } {
  const limpio = valor.replace(/\s+/g, " ").trim();
  if (!limpio) return { valor: null };
  if (campo === "ciudad") {
    if (limpio.length > MAX_CIUDAD) return { error: `La ciudad puede tener hasta ${MAX_CIUDAD} letras.` };
    return { valor: limpio };
  }
  if (campo === "correo") {
    const correo = limpio.toLowerCase();
    if (correo.length > MAX_CORREO || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: "El correo no es válido." };
    return { valor: correo };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return { error: "La fecha de ingreso no es válida." };
  const fecha = new Date(`${limpio}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== limpio) return { error: "La fecha de ingreso no es válida." };
  if (limpio > hoy) return { error: "La fecha de ingreso no puede ser futura." };
  if (limpio < "2000-01-01") return { error: "La fecha de ingreso no es válida." };
  return { valor: limpio };
}
