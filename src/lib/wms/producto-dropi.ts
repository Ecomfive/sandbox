// Lógica pura de la «Ficha producto Dropi» (módulo WMS): tipos, listas, cálculos y validación de lo que llega del
// formulario. Réplica de la ficha «Crear Producto» de Dropi. Sin acceso a la base ni a React.

import { claveCombinacion, combinaciones, sanitizarHtml, type MedioDatos, type OpcionProducto } from "./producto";

export const PUBLICACIONES = ["publico", "privado"] as const;
export type Publicacion = (typeof PUBLICACIONES)[number];
export const ETIQUETA_PUBLICACION: Record<Publicacion, string> = { publico: "Público", privado: "Privado" };

export const TIPOS_DROPI = ["simple", "variable"] as const;
export type TipoDropi = (typeof TIPOS_DROPI)[number];
export const ETIQUETA_TIPO_DROPI: Record<TipoDropi, string> = { simple: "Simple", variable: "Variable" };

export const CATEGORIAS_DROPI = ["Cocina", "Hogar", "Belleza", "Salud", "Mascotas", "Sexshop", "Otro"] as const;

/** Mínimos que pide Dropi a un producto público. */
export const MIN_DESCRIPCION = 200;
export const MIN_IMAGENES = 3;
export const MIN_STOCK_PUBLICO = 100;

export const GARANTIAS = [
  { clave: "orden_incompleta", etiqueta: "Orden incompleta" },
  { clave: "mal_funcionamiento", etiqueta: "Mal funcionamiento" },
  { clave: "producto_roto", etiqueta: "Producto roto" },
  { clave: "orden_diferente", etiqueta: "Orden diferente" },
] as const;
export type ClaveGarantia = (typeof GARANTIAS)[number]["clave"];

export const DIAS_GARANTIA_POR_DEFECTO = 10;

export interface GarantiaDatos {
  activa: boolean;
  dias: number;
  observaciones: string;
}

export interface VariacionDropi {
  combinacion: Record<string, string>;
  sku: string;
  precio: number | null;
  precio_sugerido: number | null;
  /** { "<bodega_id>": cantidad } */
  stock: Record<string, number>;
}

export interface PrivadoDropi {
  correo: string;
  cantidad: number;
}

export interface RecursoDropi {
  titulo: string;
  url: string;
}

export interface Bodega {
  id: string;
  nombre: string;
}

export interface ProductoDropiDatos {
  nombre: string;
  /** Con `usar_nombre_guia` en falso, el nombre de la guía de envío es el mismo del producto. */
  usar_nombre_guia: boolean;
  nombre_guia: string;
  publicacion: Publicacion;
  peso: number | null;
  longitud: number | null;
  ancho: number | null;
  alto: number | null;
  precio: number | null;
  precio_sugerido: number | null;
  tipo: TipoDropi;
  /** Se pueden elegir varias (como en Dropi: Belleza y Salud a la vez). */
  categorias: string[];
  /** Lo revisa y marca Dropi; aquí se lleva el mismo dato (columna «Aprobado»). */
  aprobado: boolean;
  sku: string;
  descripcion: string;
  descripcion_app: string;
  stock: Record<string, number>;
  atributos: OpcionProducto[];
  variaciones: VariacionDropi[];
  garantias: Record<ClaveGarantia, GarantiaDatos>;
  privados: PrivadoDropi[];
  recursos: RecursoDropi[];
  medios: MedioDatos[];
}

export function garantiasPorDefecto(): Record<ClaveGarantia, GarantiaDatos> {
  return Object.fromEntries(
    GARANTIAS.map((g) => [g.clave, { activa: true, dias: DIAS_GARANTIA_POR_DEFECTO, observaciones: "" }])
  ) as Record<ClaveGarantia, GarantiaDatos>;
}

export function productoDropiVacio(): ProductoDropiDatos {
  return {
    nombre: "",
    usar_nombre_guia: false,
    nombre_guia: "",
    publicacion: "publico",
    peso: null,
    longitud: null,
    ancho: null,
    alto: null,
    precio: null,
    precio_sugerido: null,
    tipo: "simple",
    categorias: [],
    aprobado: false,
    sku: "",
    descripcion: "",
    descripcion_app: "",
    stock: {},
    atributos: [],
    variaciones: [],
    garantias: garantiasPorDefecto(),
    privados: [],
    recursos: [],
    medios: [],
  };
}

/** El texto de un HTML sin etiquetas (para contar los 200 caracteres mínimos de la descripción). */
export function textoPlano(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Stock total de un producto: la suma de todas sus bodegas (y, si es variable, de todas sus variaciones). */
export function stockTotal(d: Pick<ProductoDropiDatos, "tipo" | "stock" | "variaciones">): number {
  const suma = (s: Record<string, number>) => Object.values(s).reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0);
  return d.tipo === "variable" ? d.variaciones.reduce((t, v) => t + suma(v.stock), 0) : suma(d.stock);
}

/** ¿Alguna bodega llega al mínimo que pide Dropi a un producto público? */
export function cumpleStockPublico(d: Pick<ProductoDropiDatos, "tipo" | "stock" | "variaciones">): boolean {
  const porBodega = new Map<string, number>();
  const fuentes = d.tipo === "variable" ? d.variaciones.map((v) => v.stock) : [d.stock];
  for (const s of fuentes) for (const [b, n] of Object.entries(s)) porBodega.set(b, (porBodega.get(b) ?? 0) + (Number(n) || 0));
  return [...porBodega.values()].some((n) => n >= MIN_STOCK_PUBLICO);
}

/**
 * Ajusta las variaciones a los atributos: conserva (con sus datos) las que siguen existiendo, crea las que faltan y
 * quita las que ya no corresponden. Sin atributos no hay variaciones.
 */
export function sincronizarVariaciones(atributos: OpcionProducto[], actuales: VariacionDropi[], precioBase: number | null, sugeridoBase: number | null): VariacionDropi[] {
  const combos = combinaciones(atributos);
  const porClave = new Map(actuales.map((v) => [claveCombinacion(v.combinacion), v]));
  return combos.map(
    (c) => porClave.get(claveCombinacion(c)) ?? { combinacion: c, sku: "", precio: precioBase, precio_sugerido: sugeridoBase, stock: {} }
  );
}

/** Lo que falta o sobra para poder guardar (en el orden en que se ve en la ficha); vacío = todo en orden. */
export type SeccionDropi = "general" | "stock" | "imagenes";

export function faltantesDropi(d: ProductoDropiDatos): { pestana: SeccionDropi; mensaje: string }[] {
  const f: { pestana: SeccionDropi; mensaje: string }[] = [];
  if (!d.nombre.trim()) f.push({ pestana: "general", mensaje: "El nombre es obligatorio." });
  if (d.usar_nombre_guia && !d.nombre_guia.trim()) f.push({ pestana: "general", mensaje: "Falta el nombre de la guía de envío." });
  for (const [campo, mensaje] of [
    ["peso", "El peso es obligatorio."],
    ["longitud", "La longitud es obligatoria."],
    ["ancho", "El ancho es obligatorio."],
    ["alto", "El alto es obligatorio."],
  ] as const) {
    if (!(Number(d[campo]) > 0)) f.push({ pestana: "general", mensaje });
  }
  if (d.tipo === "simple") {
    if (!(Number(d.precio) > 0)) f.push({ pestana: "general", mensaje: "El precio es obligatorio." });
    if (!(Number(d.precio_sugerido) > 0)) f.push({ pestana: "general", mensaje: "El precio sugerido es obligatorio." });
  }
  if (d.categorias.length === 0) f.push({ pestana: "general", mensaje: "La categoría es obligatoria." });
  if (textoPlano(d.descripcion).length === 0) f.push({ pestana: "general", mensaje: "La descripción es obligatoria." });
  else if (textoPlano(d.descripcion).length < MIN_DESCRIPCION) f.push({ pestana: "general", mensaje: `La descripción necesita al menos ${MIN_DESCRIPCION} caracteres.` });
  if (d.tipo === "variable") {
    if (d.variaciones.length === 0) f.push({ pestana: "stock", mensaje: "Agrega al menos un atributo con sus valores." });
    if (d.variaciones.some((v) => !(Number(v.precio) > 0) || !(Number(v.precio_sugerido) > 0))) {
      f.push({ pestana: "stock", mensaje: "Cada variación necesita su precio y su precio sugerido." });
    }
  }
  if (d.publicacion === "publico") {
    if (!cumpleStockPublico(d)) f.push({ pestana: "stock", mensaje: `Un producto público necesita al menos una bodega con ${MIN_STOCK_PUBLICO} unidades.` });
    if (d.medios.filter((m) => m.tipo === "imagen").length < MIN_IMAGENES) f.push({ pestana: "imagenes", mensaje: `Sube mínimo ${MIN_IMAGENES} imágenes del producto.` });
  }
  return f;
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numeroONull = (v: unknown): number | null | "invalido" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
};
const cantidad = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const mapaStock = (v: unknown): Record<string, number> =>
  Object.fromEntries(
    Object.entries((typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>)
      .filter(([k]) => /^[0-9a-fA-F-]{8,64}$/.test(k))
      .map(([k, n]) => [k, cantidad(n)])
  );

/** Valida y limpia el formulario que llega al servidor. Devuelve el error como valor. */
export function validarProductoDropi(crudo: unknown): { datos: ProductoDropiDatos } | { error: string } {
  if (typeof crudo !== "object" || crudo === null) return { error: "Los datos del producto no son válidos." };
  const r = crudo as Record<string, unknown>;

  const numeros = ["peso", "longitud", "ancho", "alto", "precio", "precio_sugerido"] as const;
  const valores: Record<string, number | null> = {};
  for (const n of numeros) {
    const x = numeroONull(r[n]);
    if (x === "invalido") return { error: "Los pesos, medidas y precios no pueden ser negativos." };
    valores[n] = x;
  }

  const atributos: OpcionProducto[] = (Array.isArray(r.atributos) ? r.atributos : [])
    .slice(0, 5)
    .map((o) => ({
      nombre: texto((o as OpcionProducto)?.nombre, 60),
      valores: [...new Set(((o as OpcionProducto)?.valores ?? []).filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))].slice(0, 50),
    }))
    .filter((o) => o.nombre && o.valores.length > 0);

  const tipo: TipoDropi = r.tipo === "variable" ? "variable" : "simple";
  const variaciones: VariacionDropi[] = [];
  if (tipo === "variable") {
    for (const v of (Array.isArray(r.variaciones) ? r.variaciones : []).slice(0, 200)) {
      const c = v as Record<string, unknown>;
      const precio = numeroONull(c.precio);
      const sugerido = numeroONull(c.precio_sugerido);
      if (precio === "invalido" || sugerido === "invalido") return { error: "Los precios no pueden ser negativos." };
      const combinacion: Record<string, string> = {};
      for (const a of atributos) {
        const valor = texto((c.combinacion as Record<string, unknown> | undefined)?.[a.nombre], 60);
        if (!valor) return { error: `Falta el valor de «${a.nombre}» en una variación.` };
        combinacion[a.nombre] = valor;
      }
      variaciones.push({ combinacion, sku: texto(c.sku, 120), precio, precio_sugerido: sugerido, stock: mapaStock(c.stock) });
    }
  }

  const garantias = garantiasPorDefecto();
  for (const g of GARANTIAS) {
    const x = (r.garantias as Record<string, Record<string, unknown>> | undefined)?.[g.clave];
    if (x) garantias[g.clave] = { activa: x.activa === true, dias: Math.min(3650, cantidad(x.dias)), observaciones: texto(x.observaciones, 500) };
  }

  const privados: PrivadoDropi[] = [];
  for (const p of (Array.isArray(r.privados) ? r.privados : []).slice(0, 200)) {
    const correo = texto((p as PrivadoDropi)?.correo, 200);
    if (!correo) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: `El correo «${correo}» no es válido.` };
    privados.push({ correo, cantidad: cantidad((p as PrivadoDropi)?.cantidad) });
  }

  const recursos: RecursoDropi[] = [];
  for (const x of (Array.isArray(r.recursos) ? r.recursos : []).slice(0, 50)) {
    const url = texto((x as RecursoDropi)?.url, 500);
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) return { error: "Los enlaces de recursos deben empezar por https:// o http://." };
    recursos.push({ titulo: texto((x as RecursoDropi)?.titulo, 120), url });
  }

  const medios: MedioDatos[] = (Array.isArray(r.medios) ? r.medios : []).slice(0, 100).map((m) => {
    const x = m as Record<string, unknown>;
    return {
      id: typeof x.id === "string" ? x.id : undefined,
      ruta: typeof x.ruta === "string" ? x.ruta : undefined,
      tempId: undefined,
      nombre_archivo: texto(x.nombre_archivo, 200),
      tipo: x.tipo === "video" ? "video" : "imagen",
      alt: "",
    };
  });

  const stockSimple = mapaStock(r.stock);
  const datos: ProductoDropiDatos = {
    nombre: texto(r.nombre, 255),
    usar_nombre_guia: r.usar_nombre_guia === true,
    nombre_guia: texto(r.nombre_guia, 255),
    publicacion: r.publicacion === "privado" ? "privado" : "publico",
    peso: valores.peso,
    longitud: valores.longitud,
    ancho: valores.ancho,
    alto: valores.alto,
    precio: valores.precio,
    precio_sugerido: valores.precio_sugerido,
    tipo,
    categorias: [...new Set((Array.isArray(r.categorias) ? r.categorias : []).filter((c): c is string => (CATEGORIAS_DROPI as readonly string[]).includes(c as string)))],
    aprobado: r.aprobado === true,
    sku: texto(r.sku, 120),
    descripcion: sanitizarHtml(typeof r.descripcion === "string" ? r.descripcion.slice(0, 200_000) : ""),
    descripcion_app: sanitizarHtml(typeof r.descripcion_app === "string" ? r.descripcion_app.slice(0, 200_000) : ""),
    stock: tipo === "simple" ? stockSimple : {},
    atributos: tipo === "variable" ? atributos : [],
    variaciones,
    garantias,
    privados,
    recursos,
    medios,
  };

  const falta = faltantesDropi(datos);
  if (falta.length > 0) return { error: falta[0].mensaje };
  return { datos };
}
