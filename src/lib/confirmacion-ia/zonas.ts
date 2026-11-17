// Confirmación con IA (16 nov 2026, pedido de Hernán): las palabras de zona que el equipo va agregando para decir si una dirección es de ciudad o del interior. Una palabra sola
// («Colón») o varias juntas («Panamá Este») que, si salen en la dirección, deciden la zona. Lógica pura, con su prueba.

/** `adelantado`: zona de difícil acceso o fronteriza que se paga por adelantado (17 nov 2026): no tiene etiqueta de envío, el pedido queda «En espera de pago» hasta que el asesor verifique el pago. */
export type Zona = "ciudad" | "interior" | "adelantado";
export const ZONAS: Zona[] = ["ciudad", "interior", "adelantado"];

/** Cómo se llama cada zona en las pantallas: la etiqueta de Shopify tal cual se escribe (Panamá). */
export const NOMBRE_ZONA: Record<Zona, string> = { ciudad: "CIUDAD", interior: "INTERIOR/SERVIENTREGA", adelantado: "PAGO POR ADELANTADO" };

export interface ReglaZona {
  id: string;
  /** Como la escribió la persona. */
  texto: string;
  /** Sin acentos, en minúsculas y con un solo espacio entre palabras: con esto se compara. */
  clave: string;
  resultado: Zona;
}

/** El texto para comparar: sin acentos, en minúsculas, sin signos y con un solo espacio entre palabras. */
export function normalizarTexto(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Cuántas palabras tiene una regla: una sola o varias juntas. */
export const palabrasDeRegla = (clave: string): number => (clave ? clave.split(" ").length : 0);
export const esCompuesta = (clave: string): boolean => palabrasDeRegla(clave) > 1;

/** Las reglas cuyas palabras salen en la dirección, completas y en ese orden (no dentro de otra palabra). */
export function coincidencias(direccion: string, reglas: ReglaZona[]): ReglaZona[] {
  const texto = ` ${normalizarTexto(direccion)} `;
  return reglas.filter((r) => r.clave && texto.includes(` ${r.clave} `));
}

/**
 * La zona que deciden las reglas que salen en la dirección. Una de pago por adelantado gana siempre; si no, gana la regla de más palabras (una compuesta pesa más que una sola: «Panamá Este» sobre «Panamá»). Si las de más palabras
 * dicen cosas distintas, hay conflicto y no se decide por reglas.
 */
export function zonaPorReglas(coinc: ReglaZona[]): { zona: Zona | null; conflicto: boolean; reglas: ReglaZona[] } {
  if (!coinc.length) return { zona: null, conflicto: false, reglas: [] };
  // Una palabra de pago por adelantado manda sobre las demás: aunque la dirección también diga la provincia (interior), si dice Puerto Armuelles el pedido espera el pago.
  if (coinc.some((r) => r.resultado === "adelantado")) return { zona: "adelantado", conflicto: false, reglas: coinc };
  const mayor = Math.max(...coinc.map((r) => palabrasDeRegla(r.clave)));
  const fuertes = coinc.filter((r) => palabrasDeRegla(r.clave) === mayor);
  const zonas = new Set(fuertes.map((r) => r.resultado));
  if (zonas.size > 1) return { zona: null, conflicto: true, reglas: coinc };
  return { zona: fuertes[0].resultado, conflicto: false, reglas: coinc };
}

/** Si el texto sirve como regla: de 2 a 80 caracteres y al menos una letra o número. Devuelve el error en palabras. */
export function errorDeRegla(texto: string): string | null {
  const t = String(texto ?? "").trim();
  if (t.length < 2) return "Escribe la palabra o las palabras de la zona.";
  if (t.length > 80) return "Es muy largo: escribe solo el nombre del lugar (hasta 80 letras).";
  if (!normalizarTexto(t)) return "Escribe letras o números.";
  return null;
}
