import type { DefTabla } from "@/lib/tabla/motor";

export type EstadoScraping = "activo" | "privado" | "desaparecido";
export type Movimiento = "subio" | "bajo" | "precio" | "nuevo";

/** Un producto del proveedor elegido, listo para la tabla (lo arma la página). */
export interface FilaScraping {
  id: string;
  dropiId: number;
  sku: string | null;
  nombre: string;
  foto: string | null;
  categoria: string | null;
  precio: number | null;
  /** Precio de la búsqueda anterior, si cambió en la última. */
  precioAntes: number | null;
  precioSugerido: number | null;
  stock: number | null;
  /** Stock de la búsqueda anterior, si cambió en la última. */
  stockAntes: number | null;
  estado: EstadoScraping;
  motivo: "agotado" | "privatizado" | "desconocido" | null;
  movimientos: Movimiento[];
  vinculo: { nombre: string; parecido: number; seguro: boolean } | null;
  ultimaVez: string;
  primeraVez: string;
  creadoEnDropi: string | null;
  /** Stock en cada búsqueda de las últimas 4 semanas (de la más vieja a la más nueva). */
  serie: number[];
}

export const ESTADOS: { valor: EstadoScraping; etiqueta: string }[] = [
  { valor: "activo", etiqueta: "Activo" },
  { valor: "privado", etiqueta: "Privado" },
  { valor: "desaparecido", etiqueta: "Desapareció" },
];

export const MOVIMIENTOS: { valor: Movimiento; etiqueta: string }[] = [
  { valor: "subio", etiqueta: "Subió stock" },
  { valor: "bajo", etiqueta: "Bajó stock" },
  { valor: "precio", etiqueta: "Cambió precio" },
  { valor: "nuevo", etiqueta: "Nuevo" },
];

export const MOTIVO: Record<string, string> = {
  agotado: "se agotó",
  privatizado: "lo hizo privado",
  desconocido: "dejó de aparecer",
};

/** Precios en la moneda del país de Dropi del proveedor. */
const MONEDA: Record<string, string> = { mx: "MXN", co: "COP", cr: "CRC", pa: "USD", cl: "CLP", ec: "USD", pe: "PEN", gt: "GTQ" };

export function formatoPrecio(valor: number | null, pais: string): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: MONEDA[pais] ?? "USD", maximumFractionDigits: 2 }).format(valor);
}

export const formatoNumero = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-MX"));

/** Filtros, agrupación y descarga de la tabla de productos de un proveedor. */
export const DEF_SCRAPING: DefTabla<FilaScraping> = {
  clave: "scraping-productos",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS,
      agrupable: true,
    },
    {
      id: "movimiento",
      etiqueta: "Última búsqueda",
      tipo: "seleccion",
      valores: (f) => f.movimientos,
      opciones: () => MOVIMIENTOS,
    },
    { id: "nombre", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.nombre} ${f.dropiId} ${f.sku ?? ""}` },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (f) => (f.categoria ? f.categoria.split(", ") : []), agrupable: true },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "stock", etiqueta: "Stock", tipo: "numero", valor: (f) => f.stock },
    { id: "ultima", etiqueta: "Revisado", tipo: "fecha", valor: (f) => f.ultimaVez.slice(0, 10) },
    { id: "creado", etiqueta: "Creado en Dropi", tipo: "fecha", valor: (f) => f.creadoEnDropi?.slice(0, 10) ?? null },
  ],
  csvAntes: [
    { etiqueta: "ID Dropi", valor: (f) => f.dropiId },
    { etiqueta: "SKU", valor: (f) => f.sku },
    { etiqueta: "Vinculado a", valor: (f) => f.vinculo?.nombre ?? null },
  ],
};
