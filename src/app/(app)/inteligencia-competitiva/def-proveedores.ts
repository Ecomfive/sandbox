import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaProveedor {
  id: string;
  /** Nombre a mostrar: la tienda si tiene, si no el nombre del proveedor. */
  titulo: string;
  /** Nombre del proveedor cuando difiere de la tienda. */
  subtitulo: string | null;
  ciudad: string | null;
  categorias: string[];
  /** Productos en la última carga (null si aún no hay ninguna). */
  actual: number | null;
  /** Diferencia contra la carga anterior (null si solo hay una). */
  cambio: number | null;
}

export type Tendencia = "sube" | "baja" | "sin-cambio" | "sin-historial";

export function tendenciaDe(p: FilaProveedor): Tendencia {
  if (p.cambio === null) return "sin-historial";
  if (p.cambio === 0) return "sin-cambio";
  return p.cambio > 0 ? "sube" : "baja";
}

const ETIQUETAS_TENDENCIA: Record<Tendencia, string> = {
  sube: "Crece",
  baja: "Baja",
  "sin-cambio": "Sin cambio",
  "sin-historial": "Sin historial",
};

/** Filtros y agrupación de los proveedores rastreados; por grupo se suman sus productos. */
export const DEF_PROVEEDORES: DefTabla<FilaProveedor> = {
  clave: "inteligencia-proveedores",
  campos: [
    {
      id: "ciudad",
      etiqueta: "Ciudad",
      tipo: "seleccion",
      valores: (p) => [p.ciudad ?? SIN_VALOR],
      etiquetaSinValor: "Sin ciudad",
      agrupable: true,
    },
    {
      id: "categoria",
      etiqueta: "Categoría",
      tipo: "seleccion",
      // Un proveedor puede vender en varias categorías: sirve para filtrar, no para agrupar (saldría en un solo grupo).
      valores: (p) => (p.categorias.length > 0 ? p.categorias : [SIN_VALOR]),
      etiquetaSinValor: "Sin categorías",
    },
    {
      id: "tendencia",
      etiqueta: "Cambio",
      tipo: "seleccion",
      valores: (p) => [tendenciaDe(p)],
      opciones: () => (["sube", "baja", "sin-cambio", "sin-historial"] as const).map((valor) => ({ valor, etiqueta: ETIQUETAS_TENDENCIA[valor] })),
      agrupable: true,
      ordenGrupos: ["sube", "baja", "sin-cambio", "sin-historial"],
    },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "texto", valor: (p) => `${p.titulo} ${p.subtitulo ?? ""}` },
    { id: "productos", etiqueta: "Productos", tipo: "numero", valor: (p) => p.actual },
    { id: "diferencia", etiqueta: "Diferencia de productos", tipo: "numero", valor: (p) => p.cambio },
  ],
  total: (p) => p.actual ?? 0,
};
