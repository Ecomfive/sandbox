import { ORDEN_CARGA } from "@/lib/importar/reconocer";

/** Los módulos cuyas fuentes salen en «Actualizar datos» (19 nov 2026): con uno de ellos, la entrada «Datos» sale en el menú. */
const MODULOS_DE_FUENTES: readonly string[] = [
  "publicaciones-dropi",
  "publicaciones-effi",
  "analisis-competencia",
  "tienda-productos",
  "ventas-tiendas",
  "tienda-reporteria",
  "tienda-logistica",
  "deliverys",
  "panel-financiero",
  "retiros",
  "cierre-mes",
  "anuncios-meta",
  "tu-winner",
  "inventario",
  ...ORDEN_CARGA,
];

/** Si la persona ve alguna fuente (sin consultar la base). */
export function veAlgunaFuente(modulos: readonly string[]): boolean {
  return MODULOS_DE_FUENTES.some((m) => modulos.includes(m));
}
