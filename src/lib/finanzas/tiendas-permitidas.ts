// Permisos por tienda (mejora 99, migración 0937: `perfiles.tiendas_permitidas`). `null` = todas; una lista = solo esas
// tiendas (`fin_unidades`). Lógica pura: la aplica el servidor en Estado de resultados, Panel, Rentabilidad, Ventas por
// tienda, Libro de movimientos y el libro del contador. La lectura vive en `cargar-tiendas-permitidas.ts`. Prueba en
// `tiendas-permitidas.test.ts`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La lista guardada, limpia: `null` si no limita; solo ids con forma de UUID, sin repetir. */
export function leerTiendasPermitidas(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x): x is string => typeof x === "string" && UUID.test(x)).map((x) => x.toLowerCase()))];
}

export const limitaTiendas = (permitidas: string[] | null): permitidas is string[] => permitidas !== null;

export function puedeVerUnidad(permitidas: string[] | null, unidadId: string | null | undefined): boolean {
  if (permitidas === null) return true;
  return !!unidadId && permitidas.includes(unidadId.toLowerCase());
}

/** Las unidades de la lista que la persona no puede ver (una vacía o null = sin tienda, de toda la empresa). Sin límite, ninguna. */
export function unidadesFueraDePermiso(permitidas: string[] | null, unidades: (string | null | undefined)[]): (string | null)[] {
  if (permitidas === null) return [];
  return [...new Set(unidades.map((u) => (u ? u : null)))].filter((u) => !puedeVerUnidad(permitidas, u));
}

/** Deja solo las unidades que la persona puede ver. */
export function filtrarUnidades<T extends { id: string }>(permitidas: string[] | null, unidades: T[]): T[] {
  return permitidas === null ? unidades : unidades.filter((u) => permitidas.includes(u.id.toLowerCase()));
}

/**
 * La tienda que se muestra: la pedida si la puede ver; «todas» (null) solo si no tiene límite. Con límite y sin pedir una
 * de las suyas, la primera de las que puede ver (`elegibles` en su orden); si no puede ver ninguna, `SIN_TIENDA`.
 */
export const SIN_TIENDA = "00000000-0000-0000-0000-000000000000";
export function tiendaPermitida(pedida: string | null, permitidas: string[] | null, elegibles: { id: string }[]): string | null {
  if (permitidas === null) return pedida;
  if (pedida && puedeVerUnidad(permitidas, pedida)) return pedida;
  return filtrarUnidades(permitidas, elegibles)[0]?.id ?? SIN_TIENDA;
}

/** Cómo se lee la lista: «Todas las tiendas», «OFERFY, NUVO», «Ninguna». */
export function textoTiendasPermitidas(permitidas: string[] | null, nombres: Record<string, string>): string {
  if (permitidas === null) return "Todas las tiendas";
  if (!permitidas.length) return "Ninguna";
  return permitidas.map((id) => nombres[id] ?? "—").join(", ");
}

/** Con límite, las páginas que muestran datos de toda la empresa (caja, cartera, nómina) no se muestran. */
export const veTodaLaEmpresa = (permitidas: string[] | null) => permitidas === null;

/**
 * Los módulos que son de toda la empresa y no se pueden partir por tienda: con tiendas limitadas no salen en el menú y
 * sus páginas no muestran datos (`SoloTodaLaEmpresa`).
 */
export const MODULOS_TODA_LA_EMPRESA = ["balance-general", "tesoreria", "cierre-mes"] as const;

/** Los módulos del menú según las tiendas permitidas (sin límite, todos). */
export function modulosSegunTiendas(modulos: string[], permitidas: string[] | null): string[] {
  if (permitidas === null) return modulos;
  return modulos.filter((m) => !(MODULOS_TODA_LA_EMPRESA as readonly string[]).includes(m));
}
