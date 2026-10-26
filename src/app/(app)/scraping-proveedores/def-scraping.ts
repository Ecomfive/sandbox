import { monedaDePais } from "@/lib/moneda/tipo-cambio";
import type { TipoReferencia } from "@/lib/scraping/cruces";
import { RECOMENDACIONES, type Recomendacion } from "@/lib/scraping/recomendar";
import type { DefTabla } from "@/lib/tabla/motor";

/** Los países de Dropi (el dominio app.dropi.<código>). */
export const PAISES_DROPI: Record<string, string> = { mx: "México", co: "Colombia", ec: "Ecuador", pa: "Panamá", cr: "Costa Rica", cl: "Chile", pe: "Perú", gt: "Guatemala", py: "Paraguay", ar: "Argentina" };
export const nombrePais = (codigo: string) => PAISES_DROPI[codigo] ?? codigo.toUpperCase();

/** Los colores de cada recomendación, los del sistema (Testear en el morado de los paneles). */
export const CLASE_RECOMENDACION: Record<Recomendacion, string> = {
  testear: "bg-primario-suave text-primario",
  mirar: "bg-warning-soft text-warning",
  tenemos: "bg-muted text-muted-foreground",
  sin_senales: "bg-muted text-muted-foreground",
};

/** Lo que se anota al sacar un producto con «Ya lo tenemos»: a qué se parece de lo nuestro, si hay algo. */
export function motivoYaLoTenemos(f: FilaScraping): string {
  const p = f.parecidos[0];
  return p ? `Se parece a «${p.nombre}» (${p.detalle})` : "Marcado a mano";
}

/** Señales para las tarjetas: se vendió esta semana, es nuevo. */
export type Senal = "vende_semana" | "nuevo";
export const SENALES: { valor: Senal; etiqueta: string }[] = [
  { valor: "vende_semana", etiqueta: "Bajó el stock esta semana" },
  { valor: "nuevo", etiqueta: "Nuevo (menos de 14 días)" },
];
export function senalesDe(f: FilaScraping): Senal[] {
  const s: Senal[] = [];
  if (f.ventas7 > 0 && f.estado !== "desaparecido") s.push("vende_semana");
  if (f.nuevo) s.push("nuevo");
  return s;
}

export type EstadoScraping = "activo" | "privado" | "desaparecido";
export type Movimiento = "subio" | "bajo" | "precio" | "nuevo";
export type Cruce = "prioridad" | "ya_testeado" | "en_producto" | "ya_comprado" | "en_dropi" | "parecido" | "en_seleccion";

export const CRUCES: { valor: Cruce; etiqueta: string }[] = [
  { valor: "prioridad", etiqueta: "Prioridad (en varios proveedores)" },
  { valor: "ya_testeado", etiqueta: "Ya testeado" },
  { valor: "en_producto", etiqueta: "Ya en Producto" },
  { valor: "ya_comprado", etiqueta: "Ya comprado (Compras)" },
  { valor: "en_dropi", etiqueta: "Lo vendemos en Dropi" },
  { valor: "parecido", etiqueta: "Parecido a algo nuestro" },
  { valor: "en_seleccion", etiqueta: "Enviado a Selección" },
];

export function crucesDe(f: FilaScraping): Cruce[] {
  const c: Cruce[] = [];
  if (f.repetidoEn.length) c.push("prioridad");
  if (f.yaVisto?.tipo === "test") c.push("ya_testeado");
  if (f.yaVisto?.tipo === "producto") c.push("en_producto");
  if (f.yaVisto?.tipo === "compra") c.push("ya_comprado");
  if (f.yaVisto?.tipo === "publicacion") c.push("en_dropi");
  if (!f.yaVisto && f.parecidos.length) c.push("parecido");
  if (f.seleccion) c.push("en_seleccion");
  return c;
}

/** Un producto de un proveedor referente, listo para la lista (lo arma `cargarScraping`). */
export interface FilaScraping {
  id: string;
  proveedorId: string;
  /** El nombre del proveedor. */
  proveedor: string;
  /** El país de Dropi del proveedor («mx», «co»…): la moneda de sus precios. */
  pais: string;
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
  /** Visto por primera vez hace menos de 14 días. */
  nuevo: boolean;
  /** Stock en cada búsqueda de las últimas 4 semanas (de la más vieja a la más nueva). */
  serie: number[];
  /** Ventas estimadas: lo que bajó el stock en 30 y en 7 días (las reposiciones no cuentan). */
  ventas30: number;
  ventas7: number;
  /** Qué hacer con el producto y por qué (`recomendar`). */
  recomendacion: Recomendacion;
  porQue: string;
  /** Precio y sugerido pasados a dólares con el tipo de cambio del día (`null` si no hay tasa). */
  precioUsd: number | null;
  precioSugeridoUsd: number | null;
  /** Ya se testeó (Test productos) o ya está en Producto: con qué y el motivo para la nota. */
  yaVisto: { tipo: TipoReferencia; nombre: string; motivo: string } | null;
  /** Lo nuestro que se parece sin ser igual (Test, Producto, Compras o Gestión de IDs Dropi), el más parecido primero. */
  parecidos: { tipo: TipoReferencia; nombre: string; detalle: string; parecido: number; porFoto: boolean }[];
  /** Otros proveedores o fuentes donde aparece el mismo producto (prioridad si hay alguno). */
  repetidoEn: string[];
  /** Los privados vinculados a este producto (solo en uno publicado). */
  privados: { id: string; nombre: string; precio: number | null; stock: number | null; parecido: number; seguro: boolean }[];
  /** Su fila en Selección de productos, si ya se envió. */
  seleccion: { numero: number; estado: string } | null;
  /** Si alguien lo sacó de la lista con «Ya lo tenemos» (migración 0156). */
  marcado: { en: string; por: string | null; motivo: string | null } | null;
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

/** Un precio en la moneda del país de Dropi del proveedor («MX$160.00»). */
export function formatoPrecio(valor: number | null, pais: string): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-PA", { style: "currency", currency: monedaDePais(pais), currencyDisplay: "symbol", maximumFractionDigits: 2 }).format(valor);
}

/** Un precio en dólares («US$8.70»). */
export const formatoUsd = (valor: number | null) =>
  valor === null ? "—" : `US$${valor.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatoNumero = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-MX"));

/** Filtros, agrupación y descarga de la lista de productos de los proveedores referentes. */
export const DEF_SCRAPING: DefTabla<FilaScraping> = {
  imagen: { ambito: "scraping", id: (f) => f.id },
  clave: "scraping-productos",
  vistaInicial: { agrupar: "recomendacion" },
  // La lista es el reporte de qué testear: «Ya lo tenemos» y «Sin señales» van ocultos, detrás de un botón.
  cerrados: {
    etiqueta: "Ya lo tenemos y sin señales",
    esCerrado: (f) => f.recomendacion === "tenemos" || f.recomendacion === "sin_senales",
    campoEstado: "recomendacion",
    valoresCerrados: ["tenemos", "sin_senales"],
    ocultosPorDefecto: true,
  },
  campos: [
    {
      id: "recomendacion",
      etiqueta: "Recomendación",
      tipo: "seleccion",
      valores: (f) => [f.recomendacion],
      opciones: () => RECOMENDACIONES,
      agrupable: true,
      ordenGrupos: RECOMENDACIONES.map((r) => r.valor),
    },
    { id: "senal", etiqueta: "Señales", tipo: "seleccion", valores: (f) => senalesDe(f), opciones: () => SENALES },
    { id: "pais", etiqueta: "País", tipo: "seleccion", valores: (f) => [nombrePais(f.pais)], agrupable: true },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor], agrupable: true },
    { id: "ventas30", etiqueta: "Ventas estimadas (30 días)", tipo: "numero", valor: (f) => f.ventas30 },
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
    {
      id: "cruce",
      etiqueta: "Cruces",
      tipo: "seleccion",
      valores: (f) => crucesDe(f),
      opciones: () => CRUCES,
    },
    { id: "nombre", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.nombre} ${f.dropiId} ${f.sku ?? ""}` },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (f) => (f.categoria ? f.categoria.split(", ") : []), agrupable: true },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "precioUsd", etiqueta: "Precio (US$)", tipo: "numero", valor: (f) => f.precioUsd },
    { id: "stock", etiqueta: "Stock", tipo: "numero", valor: (f) => f.stock },
    { id: "ultima", etiqueta: "Revisado", tipo: "fecha", valor: (f) => f.ultimaVez.slice(0, 10) },
    { id: "creado", etiqueta: "Creado en Dropi", tipo: "fecha", valor: (f) => f.creadoEnDropi?.slice(0, 10) ?? null },
  ],
  csvAntes: [
    { etiqueta: "Proveedor", valor: (f) => f.proveedor },
    { etiqueta: "País", valor: (f) => nombrePais(f.pais) },
    { etiqueta: "Recomendación", valor: (f) => RECOMENDACIONES.find((r) => r.valor === f.recomendacion)?.etiqueta ?? f.recomendacion },
    { etiqueta: "Por qué", valor: (f) => f.porQue },
    { etiqueta: "Ventas estimadas 30 días", valor: (f) => f.ventas30 },
    { etiqueta: "ID Dropi", valor: (f) => f.dropiId },
    { etiqueta: "SKU", valor: (f) => f.sku },
    { etiqueta: "Vinculado a", valor: (f) => f.vinculo?.nombre ?? null },
    { etiqueta: "Ya visto", valor: (f) => f.yaVisto?.motivo ?? null },
    { etiqueta: "Se parece a", valor: (f) => f.parecidos.map((p) => `${p.nombre} (${p.detalle})`).join(" | ") || null },
    { etiqueta: "También en", valor: (f) => f.repetidoEn.join(", ") || null },
  ],
};
