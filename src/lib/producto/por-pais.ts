/**
 * Producto › Por país (5 nov 2026, pedido de Alcides): de cada producto, en qué país ya existe en el sistema y en cuál todavía no.
 * Un producto existe en un país si tiene allí una publicación (Dropi o Drop), una compra que cuenta (ni descartada ni anulada) o stock
 * en una bodega de ese país. Donde no existe, la persona decide «Enviar» o «Descartado» (tabla `producto_pais_decisiones`).
 * Todo es puro: las filas llegan ya leídas de la base (`datos-por-pais.ts`).
 */

/** Cómo está un producto en un país. El orden importa: el primero que se cumple es el que se muestra. */
export type EstadoPais = "publicado" | "comprado" | "stock" | "archivado" | "enviar" | "descartado" | "descontinuado" | "no";

export const ETIQUETA_ESTADO_PAIS: Record<EstadoPais, string> = {
  publicado: "Publicado",
  comprado: "Comprado",
  stock: "Con stock",
  archivado: "Solo archivado",
  enviar: "Enviar",
  descartado: "Descartado",
  descontinuado: "Descontinuado",
  no: "No existe",
};

/** Los estados en que el producto ya está en ese país (los demás son «todavía no»). */
export const ESTADOS_EXISTE: EstadoPais[] = ["publicado", "comprado", "stock"];

export type Decision = "enviar" | "descartado";

export interface PublicacionPais {
  skuId: string;
  pais: string;
  plataforma: "dropi" | "drop";
  /** El ID que se ve en la plataforma («8406», «ID-ONWAG»). */
  idPlataforma: string;
  /** El id de la publicación en el sistema (para abrir su ficha). */
  ref: string;
  activa: boolean;
  /** Las unidades que dice la plataforma (la última lectura de «Mis productos» de Dropi, o el inventario de Drop); null si no se sabe. */
  stock: number | null;
}

export interface CompraPais {
  skuId: string;
  compraId: string;
  pais: string;
  numero: number | null;
  unidades: number;
  etapa: string;
  anulada: boolean;
  creada: string;
}

export interface StockPais {
  skuId: string;
  pais: string;
  bodega: string;
  unidades: number;
}

export interface DecisionPais {
  skuId: string;
  pais: string;
  decision: Decision;
  motivo: string | null;
  por: string | null;
  en: string;
}

/** Lo que hay de un producto en un país, para la casilla y su ventana. */
export interface CeldaPais {
  estado: EstadoPais;
  publicaciones: { plataforma: "dropi" | "drop"; id: string; ref: string; activa: boolean; stock: number | null }[];
  compras: { compraId: string; numero: number | null; unidades: number; creada: string }[];
  unidadesCompradas: number;
  stock: { bodega: string; unidades: number }[];
  /** Unidades en las bodegas del sistema (WMS) de ese país. */
  unidadesStock: number;
  /** Unidades en las plataformas (Dropi, Drop) según sus publicaciones activas; cada ID una vez. */
  unidadesPlataformas: number;
  /** Lo disponible en el país: bodegas + plataformas. */
  unidadesDisponibles: number;
  decision: { decision: Decision; motivo: string | null; por: string | null; en: string } | null;
  descontinuado: boolean;
}

export const celdaVacia = (): CeldaPais => ({
  estado: "no",
  publicaciones: [],
  compras: [],
  unidadesCompradas: 0,
  stock: [],
  unidadesStock: 0,
  unidadesPlataformas: 0,
  unidadesDisponibles: 0,
  decision: null,
  descontinuado: false,
});

/** El estado de la casilla: lo que ya existe manda; si no, descontinuado, la decisión, solo archivado o nada. */
export function estadoDeCelda(c: Omit<CeldaPais, "estado">): EstadoPais {
  if (c.publicaciones.some((p) => p.activa)) return "publicado";
  if (c.compras.length > 0) return "comprado";
  if (c.unidadesStock > 0) return "stock";
  if (c.descontinuado) return "descontinuado";
  if (c.decision) return c.decision.decision;
  if (c.publicaciones.length > 0) return "archivado";
  return "no";
}

export interface ProductoBase {
  id: string;
  /** Si es una variante, su producto: lo de la variante cuenta para él. */
  padreId: string | null;
}

/**
 * Arma, por producto y país, la casilla. Lo de una variante se suma a su producto. `cuenta` dice si una compra suma (la regla de
 * `compraCuenta`). Las líneas de la misma compra se juntan en una.
 */
export function armarPorPais(
  productos: ProductoBase[],
  paises: string[],
  datos: { publicaciones: PublicacionPais[]; compras: CompraPais[]; stock: StockPais[]; decisiones: DecisionPais[]; descontinuados: { skuId: string; pais: string }[] },
  cuenta: (c: { etapa: string; anulada: boolean }) => boolean,
): Map<string, Record<string, CeldaPais>> {
  const padre = new Map(productos.filter((p) => p.padreId).map((p) => [p.id, p.padreId as string]));
  const principal = (id: string) => padre.get(id) ?? id;
  const salida = new Map<string, Record<string, CeldaPais>>();
  for (const p of productos) {
    if (p.padreId) continue;
    salida.set(p.id, Object.fromEntries(paises.map((codigo) => [codigo, celdaVacia()])));
  }
  const celda = (skuId: string, pais: string) => salida.get(principal(skuId))?.[pais];

  for (const pub of datos.publicaciones) {
    const c = celda(pub.skuId, pub.pais);
    if (!c || c.publicaciones.some((x) => x.plataforma === pub.plataforma && x.id === pub.idPlataforma)) continue;
    c.publicaciones.push({ plataforma: pub.plataforma, id: pub.idPlataforma, ref: pub.ref, activa: pub.activa, stock: pub.stock });
    if (pub.activa && pub.stock) c.unidadesPlataformas += pub.stock;
  }
  for (const compra of datos.compras) {
    if (!cuenta(compra)) continue;
    const c = celda(compra.skuId, compra.pais);
    if (!c) continue;
    const misma = c.compras.find((x) => x.compraId === compra.compraId);
    if (misma) misma.unidades += compra.unidades;
    else c.compras.push({ compraId: compra.compraId, numero: compra.numero, unidades: compra.unidades, creada: compra.creada });
    c.unidadesCompradas += compra.unidades;
  }
  for (const s of datos.stock) {
    if (s.unidades <= 0) continue;
    const c = celda(s.skuId, s.pais);
    if (!c) continue;
    const misma = c.stock.find((x) => x.bodega === s.bodega);
    if (misma) misma.unidades += s.unidades;
    else c.stock.push({ bodega: s.bodega, unidades: s.unidades });
    c.unidadesStock += s.unidades;
  }
  for (const d of datos.decisiones) {
    const c = salida.get(d.skuId)?.[d.pais];
    if (c) c.decision = { decision: d.decision, motivo: d.motivo, por: d.por, en: d.en };
  }
  for (const d of datos.descontinuados) {
    const c = salida.get(d.skuId)?.[d.pais];
    if (c) c.descontinuado = true;
  }
  for (const celdas of salida.values()) {
    for (const c of Object.values(celdas)) {
      c.compras.sort((a, b) => b.creada.localeCompare(a.creada));
      c.stock.sort((a, b) => b.unidades - a.unidades);
      c.unidadesDisponibles = c.unidadesStock + c.unidadesPlataformas;
      c.estado = estadoDeCelda(c);
    }
  }
  return salida;
}

/** Revisa lo que llega del navegador al guardar una decisión. Devuelve el error en palabras o null. */
export function errorDecision(decision: string | null, motivo: string): string | null {
  if (decision !== null && decision !== "enviar" && decision !== "descartado") return "Decisión desconocida.";
  if (decision === "descartado" && motivo.trim().length < 3) return "Escribe por qué se descarta (al menos 3 letras).";
  if (motivo.length > 300) return "El motivo no puede pasar de 300 caracteres.";
  return null;
}

/** Las tarjetas de acción de «Por país» (5 nov 2026, pedido de Alcides: «los cuadritos arriba, como en Compras»). */
export type AccionPorPais = "por_decidir" | "por_enviar" | "comprado_sin_publicar" | "solo_archivado" | "un_pais" | "ningun_pais" | "descartado";

/**
 * Los países donde un producto activo es una oportunidad por decidir: ya existe en otro país y aquí no existe (o solo quedó archivado),
 * sin «Enviar», «Descartado» ni descontinuado.
 */
export function paisesPorDecidir(celdas: Record<string, CeldaPais>, clase: string): string[] {
  if (clase !== "fisico") return [];
  const existe = Object.values(celdas).some((c) => ESTADOS_EXISTE.includes(c.estado));
  if (!existe) return [];
  return Object.entries(celdas)
    .filter(([, c]) => c.estado === "no" || c.estado === "archivado")
    .map(([codigo]) => codigo);
}

/** En qué tarjetas cuenta un producto (puede estar en varias). Las de oportunidad y alcance son solo de productos activos. */
export function accionesPorPais(celdas: Record<string, CeldaPais>, clase: string): AccionPorPais[] {
  const estados = Object.values(celdas).map((c) => c.estado);
  const existeEn = estados.filter((e) => ESTADOS_EXISTE.includes(e)).length;
  const salida: AccionPorPais[] = [];
  if (paisesPorDecidir(celdas, clase).length) salida.push("por_decidir");
  if (estados.includes("enviar")) salida.push("por_enviar");
  if (estados.includes("comprado")) salida.push("comprado_sin_publicar");
  if (estados.includes("archivado")) salida.push("solo_archivado");
  if (clase === "fisico" && existeEn === 1) salida.push("un_pais");
  if (clase === "fisico" && existeEn === 0) salida.push("ningun_pais");
  if (estados.includes("descartado")) salida.push("descartado");
  return salida;
}
