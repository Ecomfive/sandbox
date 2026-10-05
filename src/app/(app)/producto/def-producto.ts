import type { DefTabla } from "@/lib/tabla/motor";

/** Simple: un solo producto. Compuesto: una combinación de productos simples (al venderlo se descuenta cada uno). */
export const ETIQUETA_TIPO: Record<string, string> = { simple: "Simple", combo: "Compuesto" };

/** Físico: ya se compró y tiene stock. Test: se está probando; todavía no se compra y no tiene stock. */
export const ETIQUETA_CLASE: Record<string, string> = { fisico: "Físico", test: "Test" };
export const TONO_CLASE: Record<string, "success" | "warning"> = { fisico: "success", test: "warning" };

/** Lo enlazado a un producto: fichas de Shopify y de Dropi, y el producto tal como llega en los pedidos de Dropi. */
export interface Asociacion {
  tipo: "shopify" | "dropi" | "pedidos";
  /** Nombre del producto o variante enlazado. */
  nombre: string;
  /** País y estado, para distinguirlos. */
  detalle: string;
  /** A dónde lleva (la ficha), si hay. */
  href: string | null;
}

export const ETIQUETA_ASOCIACION: Record<Asociacion["tipo"], string> = {
  shopify: "Ficha Shopify",
  dropi: "Ficha Dropi",
  pedidos: "Producto en pedidos de Dropi",
};

export interface FilaProducto {
  id: string;
  /** El SKU: la llave con la que una venta de cualquier plataforma encuentra el producto. */
  codigo: string;
  nombre: string;
  tipo: string;
  clase: string;
  /** El EAN/UPC/GTIN del fabricante o el interno que generó el sistema; null si no tiene. */
  codigoBarras: string | null;
  codigoBarrasOrigen: string | null;
  /** Solo los compuestos: "2× 1001, 1× 1002". */
  componentes: string;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
  asociaciones: Asociacion[];
}

/** Cómo se filtra y agrupa la lista de productos. */
export const DEF_PRODUCTO: DefTabla<FilaProducto> = {
  clave: "producto",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (p) => `${p.codigo} ${p.nombre} ${p.codigoBarras ?? ""}` },
    {
      id: "clase",
      etiqueta: "Clase",
      tipo: "seleccion",
      valores: (p) => [p.clase],
      opciones: () => Object.entries(ETIQUETA_CLASE).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["fisico", "test"],
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (p) => [p.tipo],
      opciones: () => Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
  ],
  csvAntes: [
    { etiqueta: "SKU", valor: (p) => p.codigo },
    { etiqueta: "Producto", valor: (p) => p.nombre },
    { etiqueta: "Tipo", valor: (p) => ETIQUETA_TIPO[p.tipo] ?? p.tipo },
    { etiqueta: "Clase", valor: (p) => ETIQUETA_CLASE[p.clase] ?? p.clase },
    { etiqueta: "Código de barras", valor: (p) => p.codigoBarras ?? "" },
    { etiqueta: "Componentes", valor: (p) => p.componentes },
  ],
};
