// Las plataformas de dropshipping con que trabaja el sistema y en qué países está cada una (3 nov 2026, pedido de Hernán): **Dropi** está en varios países; **Drop** y **Effi** son solo de Costa Rica.
// Todo lo que se agregue de Drop (módulos, datos, búsquedas) es de Costa Rica; con otro país elegido en la barra se avisa y se ofrece pasar a Costa Rica. Sin base ni React, con prueba
// (plataformas.test.ts).

export type PlataformaId = "dropi" | "drop" | "effi";

export interface Plataforma {
  id: PlataformaId;
  nombre: string;
  /** Códigos de los países donde existe; `null` = todos los del sistema. */
  paises: readonly string[] | null;
}

export const PLATAFORMAS: readonly Plataforma[] = [
  { id: "dropi", nombre: "Dropi", paises: null },
  { id: "drop", nombre: "Drop", paises: ["CR"] },
  { id: "effi", nombre: "Effi", paises: ["CR"] },
];

export const PLATAFORMA_POR_DEFECTO: PlataformaId = "dropi";

/** La cookie con la plataforma elegida (la de arriba a la derecha, junto al país): la comparten el selector de la barra y el de Análisis de competencia. */
export const PLATAFORMA_COOKIE = "plataforma_actual";

/** El código del único país de Drop. */
export const PAIS_DE_DROP = "CR";

export const plataformaDe = (id: PlataformaId): Plataforma => PLATAFORMAS.find((p) => p.id === id)!;

/** Un valor cualquiera (una cookie, un parámetro) como plataforma; si no es una conocida, la de por defecto. */
export function plataformaValida(valor: unknown): PlataformaId {
  return PLATAFORMAS.some((p) => p.id === valor) ? (valor as PlataformaId) : PLATAFORMA_POR_DEFECTO;
}

/** Si la plataforma existe en ese país. */
export function plataformaDisponible(id: PlataformaId, codigoPais: string): boolean {
  const p = plataformaDe(id);
  return p.paises === null || p.paises.includes(codigoPais);
}

/** Las plataformas que existen en un país. */
export const plataformasDePais = (codigoPais: string): Plataforma[] => PLATAFORMAS.filter((p) => plataformaDisponible(p.id, codigoPais));
