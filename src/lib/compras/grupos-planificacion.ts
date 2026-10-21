// Compras › Planificación: los filtros de tienda y vía agrupan los datos de cada compra. No cambian las compras: solo cómo se
// filtran en esa pestaña. Lógica pura, sin base ni React.

/** Las tiendas que ofrece el filtro, en este orden. «Otras tiendas» junta lo que no es de ninguna y «Sin tienda» las vacías. */
export const GRUPOS_TIENDA = ["Ecomfive", "Kenku", "Clicksi", "Mercado Libre", "Nube/Oferta", "Oferfy", "Otras tiendas", "Sin tienda"] as const;
export type GrupoTienda = (typeof GRUPOS_TIENDA)[number];

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * El grupo de una tienda por su nombre: Ecomfive (con sus países, Importadora, Dropi y DropLatam), Kenku (Costa Rica y Panamá),
 * Clicksi, Mercado Libre (MELI), Nube/Oferta y Oferfy; lo demás (Cobrevida, Limitada, Oceans, Nuvo…) va en «Otras tiendas».
 */
export function grupoDeTienda(tienda: string): GrupoTienda {
  const t = normalizar(tienda);
  if (/^(ecom ?five|dropi|drop ?latam)\b/.test(t)) return "Ecomfive";
  if (/^kenku\b/.test(t)) return "Kenku";
  if (/^clicks[iy]\b/.test(t)) return "Clicksi";
  if (/^(meli|mercado ?libre)\b/.test(t)) return "Mercado Libre";
  if (/^nube\b/.test(t)) return "Nube/Oferta";
  if (/^oferfy\b/.test(t)) return "Oferfy";
  return "Otras tiendas";
}

/** Si una compra (con sus tiendas) entra en el grupo elegido. */
export function enGrupoTienda(tiendas: string[], grupo: GrupoTienda): boolean {
  if (grupo === "Sin tienda") return tiendas.length === 0;
  return tiendas.some((t) => grupoDeTienda(t) === grupo);
}

/** Las vías del filtro: solo marítimo y aéreo. Terrestre y sin vía cuentan como marítimo. */
export const VIAS_PLANIFICACION = ["mar", "aire"] as const;
export type ViaPlanificacion = (typeof VIAS_PLANIFICACION)[number];

/** Si una compra (con su vía de envío) entra en la vía elegida. Con mar y aire a la vez, entra en las dos. */
export function enViaPlanificacion(vias: string[], via: ViaPlanificacion): boolean {
  if (via === "aire") return vias.includes("aire");
  return vias.length === 0 || vias.some((v) => v !== "aire");
}
