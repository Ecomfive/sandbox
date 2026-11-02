// Mensajes rápidos de la bandeja de WhatsApp (29 oct 2026): qué se sugiere mientras se escribe y qué se puede guardar. Lógica pura, con prueba.

export interface RespuestaRapida {
  id: string;
  texto: string;
  usos: number;
}

/** Lo más corto y lo más largo que puede ser un mensaje rápido (lo que exige la base). */
export const MIN_RAPIDA = 2;
export const MAX_RAPIDA = 1000;
/** Cuántas se muestran arriba del cuadro de texto. */
export const MAX_SUGERIDAS = 5;

/** Un texto para comparar: sin mayúsculas, sin tildes y con los espacios juntos. */
export const normalizarRapida = (t: string): string =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** El texto listo para guardar, o el motivo si no sirve. */
export function validarRapida(texto: string): { texto: string } | { error: string } {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length < MIN_RAPIDA) return { error: "Escribe el mensaje rápido." };
  if (t.length > MAX_RAPIDA) return { error: `El mensaje rápido es muy largo (máximo ${MAX_RAPIDA} caracteres).` };
  return { texto: t };
}

/** Si ese texto ya está entre los mensajes rápidos. */
export const yaEsRapida = (rapidas: readonly RespuestaRapida[], texto: string): boolean => {
  const t = normalizarRapida(texto);
  return t.length > 0 && rapidas.some((r) => normalizarRapida(r.texto) === t);
};

/**
 * Los mensajes rápidos que se ofrecen arriba del cuadro de texto: con el cuadro vacío, los más usados; escribiendo, los que empiezan por lo escrito o lo contienen
 * (los que empiezan, primero). Se deja fuera el que ya es exactamente lo escrito.
 */
export function sugerirRapidas(rapidas: readonly RespuestaRapida[], escrito: string, max: number = MAX_SUGERIDAS): RespuestaRapida[] {
  const porUso = [...rapidas].sort((a, b) => b.usos - a.usos);
  const q = normalizarRapida(escrito);
  if (!q) return porUso.slice(0, max);
  const empiezan: RespuestaRapida[] = [];
  const contienen: RespuestaRapida[] = [];
  for (const r of porUso) {
    const t = normalizarRapida(r.texto);
    if (t === q) continue;
    if (t.startsWith(q)) empiezan.push(r);
    else if (q.length >= 2 && t.includes(q)) contienen.push(r);
  }
  return [...empiezan, ...contienen].slice(0, max);
}
