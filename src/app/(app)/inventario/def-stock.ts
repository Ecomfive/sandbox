import type { DefTabla } from "@/lib/tabla/motor";

/** Una fila del inventario: un SKU maestro con lo que hay en las bodegas elegidas (todas las del país o una). */
export interface FilaStock {
  id: string;
  codigo: string;
  nombre: string;
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
}

export const ETIQUETA_TIPO_SKU: Record<string, string> = { simple: "Simple", combo: "Compuesto" };
export const ETIQUETA_CLASE_SKU: Record<string, string> = { fisico: "Activo", test: "Test" };

export const ETIQUETA_EXISTENCIA: Record<string, string> = {
  negativo: "Saldo negativo",
  sin_stock: "Sin stock",
  con_stock: "Con stock",
};

/** Negativo: salió más de lo que se registró que entró (se corrige con una entrada o un ajuste). */
export function existenciaDe(f: Pick<FilaStock, "fisico">): "negativo" | "sin_stock" | "con_stock" {
  return f.fisico < 0 ? "negativo" : f.fisico === 0 ? "sin_stock" : "con_stock";
}

export const DEF_STOCK: DefTabla<FilaStock> = {
  clave: "wms-stock",
  campos: [
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (f) => `${f.codigo} ${f.nombre}` },
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
    { id: "fisico", etiqueta: "Físico", tipo: "numero", valor: (f) => f.fisico },
    { id: "disponible", etiqueta: "Disponible", tipo: "numero", valor: (f) => f.disponible },
    { id: "vencido", etiqueta: "Vencido", tipo: "numero", valor: (f) => f.vencido },
  ],
  csvAntes: [
    { etiqueta: "Código", valor: (f) => f.codigo },
    { etiqueta: "Producto", valor: (f) => f.nombre },
    { etiqueta: "Físico", valor: (f) => f.fisico },
    { etiqueta: "Reservado", valor: (f) => f.reservado },
    { etiqueta: "Disponible", valor: (f) => f.disponible },
    { etiqueta: "Dañado", valor: (f) => f.danado },
    { etiqueta: "En inspección", valor: (f) => f.inspeccion },
    { etiqueta: "Retenido", valor: (f) => f.retenido },
    { etiqueta: "En camino", valor: (f) => f.enCamino },
    { etiqueta: "Vencido", valor: (f) => f.vencido },
  ],
};
