import type { DefTabla } from "@/lib/tabla/motor";

/** Simple: un solo producto. Compuesto: una combinación de productos simples (al venderlo se descuenta cada uno). */
export const ETIQUETA_TIPO: Record<string, string> = { simple: "Simple", combo: "Compuesto" };

/**
 * El estado de un producto. Activo: se compra y tiene stock. Test: se está probando; todavía no se compra y no tiene stock.
 * En la base es la columna `clase` y «activo» se guarda como 'fisico' (el nombre de antes): solo cambia lo que se ve.
 */
export const ETIQUETA_CLASE: Record<string, string> = { fisico: "Activo", test: "Test" };
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

export const UNIDADES_MEDIDA = ["cm", "in"] as const;
export const UNIDADES_PESO_ENVIO = ["kg", "g", "lb", "oz"] as const;

/** Los datos de envío de un producto (el bloque «Envío», como en Shopify). Sin «físico», se conservan pero no se usan. */
export interface EnvioProducto {
  esFisico: boolean;
  embalaje: string | null;
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  unidadMedida: string;
  peso: number | null;
  unidadPeso: string;
  paisOrigen: string | null;
  codigoSa: string | null;
}

/** «#0195»: el N.º correlativo del producto como se muestra. */
export const numeroProducto = (n: number | null) => (n === null ? "—" : `#${String(n).padStart(4, "0")}`);

export interface FilaProducto {
  id: string;
  /** El N.º correlativo (lo pone el sistema al crear; ordena la lista). Sin la migración 0089, null. */
  numero: number | null;
  /** El SKU: la llave con la que una venta de cualquier plataforma encuentra el producto. */
  codigo: string;
  nombre: string;
  tipo: string;
  clase: string;
  /** El EAN/UPC/GTIN del fabricante o el interno que generó el sistema; null si no tiene. */
  codigoBarras: string | null;
  codigoBarrasOrigen: string | null;
  /** Se controla por lote y fecha de vencimiento. */
  manejaVencimiento: boolean;
  /** Con cuántos días de anticipación se avisa que un lote está por vencer (null = 60). */
  diasAvisoVencimiento: number | null;
  envio: EnvioProducto;
  /** Solo los compuestos: "2× 1001, 1× 1002". */
  componentes: string;
  /** La foto del producto (bucket público `wms-productos`), o null. */
  foto: string | null;
  /** Unidades compradas desde la primera compra (las líneas vinculadas en Compras; con variantes, suma las de ellas). */
  unidadesCompradas: number;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
  asociaciones: Asociacion[];
  /** Si es una variante: su producto padre y sus valores ({ Color: "Beige", Talla: "S" }). */
  padre: { id: string; codigo: string; nombre: string } | null;
  opciones: Record<string, string> | null;
  /** Si tiene variantes: sus opciones con los valores, y las variantes. */
  opcionesVariantes: { nombre: string; valores: string[] }[];
  variantes: { id: string; codigo: string; nombre: string; opciones: Record<string, string> }[];
}

/** Cómo se filtra y agrupa la lista de productos. */
export const DEF_PRODUCTO: DefTabla<FilaProducto> = {
  clave: "producto",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (p) => `${p.codigo} ${p.nombre} ${p.codigoBarras ?? ""}` },
    {
      id: "clase",
      etiqueta: "Estado",
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
    { id: "comprado", etiqueta: "Unidades compradas", tipo: "numero", valor: (p) => p.unidadesCompradas },
  ],
  csvAntes: [
    { etiqueta: "N.º", valor: (p) => (p.numero === null ? "" : String(p.numero)) },
    { etiqueta: "SKU", valor: (p) => p.codigo },
    { etiqueta: "Producto", valor: (p) => p.nombre },
    { etiqueta: "Tipo", valor: (p) => ETIQUETA_TIPO[p.tipo] ?? p.tipo },
    { etiqueta: "Estado", valor: (p) => ETIQUETA_CLASE[p.clase] ?? p.clase },
    { etiqueta: "Código de barras", valor: (p) => p.codigoBarras ?? "" },
    { etiqueta: "Componentes", valor: (p) => p.componentes },
  ],
};
