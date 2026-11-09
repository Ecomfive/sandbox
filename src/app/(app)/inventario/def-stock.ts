import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import { FILTRO_SOLO_SIMPLES } from "@/lib/tabla/tipo-producto";
import { ETIQUETA_PLATAFORMA, type Plataforma, type StockPlataformas } from "@/lib/wms/stock-plataformas";
import { numeroProducto, textoCodigos } from "@/lib/wms/codigos-producto";
import { existencia } from "@/lib/wms/total-stock";

/** Una fila del inventario: un SKU maestro con lo que hay en las bodegas elegidas (todas las del país o una). */
export interface FilaStock {
  id: string;
  codigo: string;
  nombre: string;
  /** El N.º correlativo y el código de barras del producto (7 nov 2026, pedido de Hernán). */
  numero: number | null;
  barras: string | null;
  tipo: string;
  /** Estado del producto, «fisico» (Activo) o «test»: un producto de prueba aparece aquí pero no tiene stock. */
  clase: string;
  fisico: number;
  reservado: number;
  disponible: number;
  danado: number;
  inspeccion: number;
  retenido: number;
  enCamino: number;
  /** Unidades de lotes ya vencidos: siguen en la bodega pero no cuentan como disponibles. */
  vencido: number;
  /** El producto se controla por lote y fecha de vencimiento. */
  manejaVencimiento: boolean;
  /** La foto del producto (la de su ficha en Producto), o null. */
  foto: string | null;
  /** Cuántas cajas tiene y qué unidades suman (migración 0236): lo que Nicol mira para saber cuánto pedir. */
  cajas: number;
  unidadesEnCajas: number;
  /** Lo que tiene en las plataformas (Dropi, Effi, Drop) del país; `null` si no tiene. */
  plataformas: StockPlataformas | null;
  /** Unidades físicas en cada bodega (9 nov 2026, pedido de Hernán): para filtrar por bodega y para las columnas del Excel. Solo las bodegas donde hay registro. */
  porBodega: { bodegaId: string; fisico: number }[];
  /** Si es una variante: el id de su producto principal y sus valores («Rojo / M»). */
  padreId: string | null;
  opciones: string;
  /** Si es un producto con variantes: sus variantes (sus cifras ya suman las de ellas). Vacío en un producto sin variantes. */
  variantes: FilaStock[];
}

export const ETIQUETA_TIPO_SKU: Record<string, string> = { simple: "Simple", combo: "Pack o combo" };
export const ETIQUETA_CLASE_SKU: Record<string, string> = { fisico: "Activo", test: "Test", inactivo: "Inactivo", descontinuado: "Descontinuado" };

export const ETIQUETA_EXISTENCIA: Record<string, string> = {
  negativo: "Saldo negativo",
  sin_stock: "Sin stock",
  con_stock: "Con stock",
};

/** Negativo: salió más de lo que se registró que entró (se corrige con «Corregir»). Con unidades en una plataforma, el producto tiene stock aunque las bodegas estén en cero. */
export function existenciaDe(f: Pick<FilaStock, "fisico" | "plataformas">): "negativo" | "sin_stock" | "con_stock" {
  return existencia(f.fisico, f.plataformas?.total ?? 0);
}

export const DEF_STOCK: DefTabla<FilaStock> = {
  filtrosIniciales: FILTRO_SOLO_SIMPLES,
  clave: "wms-stock",
  campos: [
    // Buscar una variante encuentra a su producto principal (las variantes salen dentro de él).
    { id: "sku", etiqueta: "SKU", tipo: "texto", sinCsv: true, valor: (f) => `${f.codigo} ${f.nombre} ${textoCodigos(f)} ${f.variantes.map((v) => `${v.codigo} ${v.nombre} ${textoCodigos(v)}`).join(" ")}` },
    {
      id: "existencia",
      etiqueta: "Existencia",
      tipo: "seleccion",
      valores: (f) => [existenciaDe(f)],
      opciones: () => Object.entries(ETIQUETA_EXISTENCIA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["negativo", "con_stock", "sin_stock"],
    },
    {
      id: "clase",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.clase],
      opciones: () => Object.entries(ETIQUETA_CLASE_SKU).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["fisico", "test"],
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (f) => [f.tipo],
      opciones: () => Object.entries(ETIQUETA_TIPO_SKU).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
    { id: "fisico", etiqueta: "Físico", tipo: "numero", sinCsv: true, valor: (f) => f.fisico },
    { id: "disponible", etiqueta: "Disponible", tipo: "numero", sinCsv: true, valor: (f) => f.disponible },
    { id: "vencido", etiqueta: "Vencido", tipo: "numero", sinCsv: true, valor: (f) => f.vencido },
    { id: "enCamino", etiqueta: "En camino", tipo: "numero", sinCsv: true, valor: (f) => f.enCamino },
    { id: "cajas", etiqueta: "Cajas", tipo: "numero", sinCsv: true, valor: (f) => f.cajas },
  ],
  // Al agrupar, cada grupo dice sus unidades físicas; un compuesto no suma, sus unidades ya están en sus componentes.
  total: (f) => (f.tipo === "combo" ? 0 : f.fisico),
  // Un producto con variantes baja una línea por variante (no su suma): el archivo trae el detalle que la lista esconde en el desplegable.
  expandirDescarga: (f) => (f.variantes.length > 0 ? f.variantes : [f]),
  csvAntes: [
    { etiqueta: "Código", valor: (f) => f.codigo },
    { etiqueta: "N.º", valor: (f) => numeroProducto(f.numero) },
    { etiqueta: "Código de barras", valor: (f) => f.barras ?? "" },
    { etiqueta: "Producto", valor: (f) => f.nombre },
    { etiqueta: "Físico", valor: (f) => f.fisico },
    { etiqueta: "Reservado", valor: (f) => f.reservado },
    { etiqueta: "Disponible", valor: (f) => f.disponible },
    { etiqueta: "Dañado", valor: (f) => f.danado },
    { etiqueta: "En inspección", valor: (f) => f.inspeccion },
    { etiqueta: "Retenido", valor: (f) => f.retenido },
    { etiqueta: "En camino", valor: (f) => f.enCamino },
    { etiqueta: "Vencido", valor: (f) => f.vencido },
    { etiqueta: "Cajas", valor: (f) => f.cajas },
  ],
};

/**
 * Suma a una definición el filtro «Bodega» (los productos que tienen unidades en esa bodega, sea una o varias a la vez) y una columna «Físico ·
 * <bodega>» por cada bodega en lo que se descarga, para ver el inventario repartido por bodega. Con una sola bodega no suma nada (no hay qué repartir).
 */
export function conBodegas(base: DefTabla<FilaStock>, bodegas: { id: string; nombre: string }[]): DefTabla<FilaStock> {
  if (bodegas.length < 2) return base;
  const fisicoEn = (f: FilaStock, id: string) => f.porBodega.find((b) => b.bodegaId === id)?.fisico ?? 0;
  return {
    ...base,
    campos: [
      ...base.campos,
      {
        id: "bodega",
        etiqueta: "Bodega",
        tipo: "seleccion",
        sinCsv: true,
        valores: (f) => {
          const en = f.porBodega.filter((b) => b.fisico !== 0).map((b) => b.bodegaId);
          return en.length ? en : [SIN_VALOR];
        },
        opciones: () => bodegas.map((b) => ({ valor: b.id, etiqueta: b.nombre })),
        etiquetaSinValor: "En ninguna",
      },
    ],
    csvAntes: [...(base.csvAntes ?? []), ...bodegas.map((b) => ({ etiqueta: `Físico · ${b.nombre}`, valor: (f: FilaStock) => fisicoEn(f, b.id) }))],
  };
}

export const PLATAFORMAS_STOCK: Plataforma[] = ["dropi", "effi", "drop"];

/** Las plataformas donde el producto tiene unidades. */
export const plataformasConStock = (f: Pick<FilaStock, "plataformas">): Plataforma[] => PLATAFORMAS_STOCK.filter((p) => (f.plataformas?.[p] ?? 0) > 0);

/** En los países que muestran las plataformas, además se filtra y se descarga por ellas. «Plataforma» filtra por una (7 nov 2026, pedido de Hernán: separadas). */
export const DEF_STOCK_PLATAFORMAS: DefTabla<FilaStock> = {
  ...DEF_STOCK,
  campos: [
    ...DEF_STOCK.campos,
    { id: "plataformas", etiqueta: "En plataformas", tipo: "numero", sinCsv: true, valor: (f) => f.plataformas?.total ?? 0 },
    {
      id: "plataforma",
      etiqueta: "Plataforma",
      tipo: "seleccion",
      sinCsv: true,
      valores: (f) => {
        const p = plataformasConStock(f);
        return p.length ? p : [SIN_VALOR];
      },
      opciones: () => PLATAFORMAS_STOCK.map((p) => ({ valor: p, etiqueta: ETIQUETA_PLATAFORMA[p] })),
      etiquetaSinValor: "En ninguna",
    },
  ],
  csvAntes: [
    ...(DEF_STOCK.csvAntes ?? []),
    { etiqueta: "Dropi", valor: (f) => f.plataformas?.dropi ?? 0 },
    { etiqueta: "Effi", valor: (f) => f.plataformas?.effi ?? 0 },
    { etiqueta: "Drop", valor: (f) => f.plataformas?.drop ?? 0 },
  ],
};
