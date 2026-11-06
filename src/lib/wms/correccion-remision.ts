/**
 * Corregir una remisión con autorización (migración 0237): quién puede resolver una petición y qué se revisa al pedirla. Quien pide nunca autoriza. Lógica pura, con prueba.
 */

export type TipoCorreccion = "recibida" | "anular";

/** Los autorizadores que aplican a un país: los de todos los países y los de ese. Nunca quien hizo la petición. */
export function quienesAutorizan(autorizadores: { perfil_id: string; pais_id: string | null }[], paisId: string, solicitante: string): string[] {
  return [...new Set(autorizadores.filter((a) => (a.pais_id === null || a.pais_id === paisId) && a.perfil_id !== solicitante).map((a) => a.perfil_id))];
}

/** Revisa una petición contra el estado de la línea. Devuelve lo que se guarda o el error, en palabras. */
export function revisarCorreccion(
  linea: { estado: string; recibida: number | null },
  pedido: { tipo: unknown; recibida: unknown; motivo: unknown },
): { tipo: TipoCorreccion; recibida: number | null; motivo: string } | { error: string } {
  const motivo = typeof pedido.motivo === "string" ? pedido.motivo.trim().slice(0, 500) : "";
  if (motivo.length < 5) return { error: "Escribe el motivo de la corrección." };
  if (pedido.tipo === "anular") {
    if (linea.estado !== "en_camino") return { error: "Solo se anula lo que sigue en camino." };
    return { tipo: "anular", recibida: null, motivo };
  }
  if (pedido.tipo !== "recibida") return { error: "Corrección no válida." };
  if (linea.estado !== "recibido") return { error: "Solo se corrige una línea que ya se recibió." };
  const recibida = typeof pedido.recibida === "string" && pedido.recibida.trim() === "" ? NaN : Number(pedido.recibida);
  if (!Number.isInteger(recibida) || recibida < 0 || recibida > 1_000_000) return { error: "Escribe cuántas unidades llegaron en realidad." };
  if (recibida === linea.recibida) return { error: "Es la misma cantidad que ya está anotada." };
  return { tipo: "recibida", recibida, motivo };
}

/** Lo que pide una corrección, como se muestra: «Recibidas: 200 → 198» o «Anular: vuelven 200 a la bodega». */
export const textoCorreccion = (c: { tipo: TipoCorreccion; recibidaAntes: number | null; recibidaNueva: number | null; enviada: number }) =>
  c.tipo === "anular" ? `Anular: vuelven ${c.enviada.toLocaleString("es-PA")} a la bodega` : `Recibidas: ${(c.recibidaAntes ?? 0).toLocaleString("es-PA")} → ${(c.recibidaNueva ?? 0).toLocaleString("es-PA")}`;
