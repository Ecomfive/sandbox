// Gestión de IDs Dropi › de dónde nació cada publicación (5 nov 2026, pedido de Hernán; migración 0226). Desde el 24 oct 2026 los productos se
// crean en el sistema: lo que alguien hace directo en Dropi se marca para verlo y resolverlo. Sin base ni React, con prueba.

export type OrigenPublicacion = "sistema" | "dropi" | "carga_inicial";

export const ORIGENES: { valor: OrigenPublicacion; etiqueta: string }[] = [
  { valor: "sistema", etiqueta: "Creada en el sistema" },
  { valor: "dropi", etiqueta: "Creada en Dropi" },
  { valor: "carga_inicial", etiqueta: "Carga inicial" },
];

export const etiquetaOrigen = (o: OrigenPublicacion): string => ORIGENES.find((x) => x.valor === o)?.etiqueta ?? o;

/**
 * Lo que le falta a una publicación nacida en Dropi para quedar como una hecha en el sistema. Vacío si no nació en Dropi, si está archivada
 * (ya no se trabaja) o si ya tiene su producto vinculado y su costo. No hay que marcarla a mano: al completarla deja de contar.
 */
export function faltaParaResolver(f: { origen: OrigenPublicacion | null; sku: unknown; costoMercancia: number | null; archivada: boolean }): string[] {
  if (f.origen !== "dropi" || f.archivada) return [];
  const falta: string[] = [];
  if (!f.sku) falta.push("vincular su producto");
  if (!f.costoMercancia || f.costoMercancia <= 0) falta.push("poner el costo de mercancía");
  return falta;
}
