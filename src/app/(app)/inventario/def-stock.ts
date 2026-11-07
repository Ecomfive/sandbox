import type { DefTabla } from "@/lib/tabla/motor";
import type { StockPlataformas } from "@/lib/wms/stock-plataformas";
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
}

export const ETIQUETA_TIPO_SKU: Record<string, string> = { simple: "Simple", combo: "Compuesto" };
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
  clave: "wms-stock",
  campos: [
    { id: "sku", etiqueta: "SKU", tipo: "texto", sinCsv: true, valor: (f) => `${f.codigo} ${f.nombre} ${textoCodigos(f)}` },
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

/** En los países que muestran las plataformas, además se filtra y se descarga por ellas. */
export const DEF_STOCK_PLATAFORMAS: DefTabla<FilaStock> = {
  ...DEF_STOCK,
  campos: [...DEF_STOCK.campos, { id: "plataformas", etiqueta: "En plataformas", tipo: "numero", sinCsv: true, valor: (f) => f.plataformas?.total ?? 0 }],
  csvAntes: [
    ...(DEF_STOCK.csvAntes ?? []),
    { etiqueta: "Dropi", valor: (f) => f.plataformas?.dropi ?? 0 },
    { etiqueta: "Effi", valor: (f) => f.plataformas?.effi ?? 0 },
    { etiqueta: "Drop", valor: (f) => f.plataformas?.drop ?? 0 },
  ],
};
