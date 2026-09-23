// Lógica pura de la «Ficha producto Shopify» (módulo WMS): tipos, listas de opciones, cálculos y la validación de lo que
// llega del formulario. Sin acceso a la base ni a React: se puede probar suelta.

export const ESTADOS_PRODUCTO = ["activo", "borrador", "no_listado"] as const;
export type EstadoProducto = (typeof ESTADOS_PRODUCTO)[number];

export const ETIQUETA_ESTADO_PRODUCTO: Record<EstadoProducto, string> = {
  activo: "Activo",
  borrador: "Borrador",
  no_listado: "No listado",
};

export const TONO_ESTADO_PRODUCTO: Record<EstadoProducto, "success" | "warning" | "neutral"> = {
  activo: "success",
  borrador: "warning",
  no_listado: "neutral",
};

export const CANALES_VENTA = [
  "Tienda online",
  "Point of Sale",
  "Shop",
  "Google y YouTube",
  "Facebook e Instagram",
  "TikTok",
] as const;

export const UNIDADES_PESO = ["kg", "g", "lb", "oz"] as const;
export type UnidadPeso = (typeof UNIDADES_PESO)[number];

export const PLANTILLAS_TEMA = ["Producto predeterminado", "Producto con galería", "Producto con video"] as const;

export const EMBALAJE_PREDETERMINADO = "Predeterminado de la tienda";

export const SUCURSAL_PREDETERMINADA = "Sucursal de la tienda";

/** Sugerencias para el campo Categoría (se puede escribir otra). */
export const CATEGORIAS_SUGERIDAS = [
  "Casa y jardín > Jardinería > Sistemas de riego",
  "Casa y jardín > Cocina y comedor",
  "Casa y jardín > Decoración del hogar",
  "Casa y jardín > Herramientas",
  "Salud y belleza > Cuidado personal",
  "Salud y belleza > Bienestar",
  "Ropa y accesorios > Ropa",
  "Ropa y accesorios > Calzado",
  "Electrónica > Accesorios",
  "Electrónica > Audio",
  "Deportes y ocio > Fitness",
  "Deportes y ocio > Aire libre",
  "Juguetes y juegos",
  "Mascotas > Accesorios",
  "Bebés y niños",
  "Vehículos y repuestos > Accesorios",
  "Oficina y papelería",
] as const;

export interface OpcionProducto {
  nombre: string;
  valores: string[];
}

export interface InventarioSucursal {
  sucursal: string;
  disponible: number;
  comprometido: number;
  no_disponible: number;
}

export interface VarianteDatos {
  id?: string;
  /** Una clave por opción del producto: { Talla: "M", Color: "Rojo" }. Vacío si el producto no tiene opciones. */
  opciones: Record<string, string>;
  precio: number | null;
  precio_comparacion: number | null;
  costo: number | null;
  sku: string;
  codigo_barras: string;
  peso: number | null;
  unidad_peso: UnidadPeso;
  inventario: InventarioSucursal[];
}

export interface MedioDatos {
  /** Los ya guardados traen `id` y `ruta`; uno recién elegido trae `tempId` (su archivo viaja aparte). */
  id?: string;
  ruta?: string;
  tempId?: string;
  nombre_archivo: string;
  tipo: "imagen" | "video";
  alt: string;
}

export interface Metacampo {
  clave: string;
  valor: string;
}

export interface ProductoDatos {
  titulo: string;
  descripcion: string;
  estado: EstadoProducto;
  categoria: string;
  tipo: string;
  proveedor: string;
  colecciones: string[];
  etiquetas: string[];
  plantilla_tema: string;
  canales: string[];
  cobrar_impuesto: boolean;
  seguimiento_inventario: boolean;
  vender_sin_existencias: boolean;
  es_fisico: boolean;
  embalaje: string;
  pais_origen: string;
  codigo_sa: string;
  seo_titulo: string;
  seo_descripcion: string;
  seo_url: string;
  metacampos: Metacampo[];
  opciones: OpcionProducto[];
  variantes: VarianteDatos[];
  medios: MedioDatos[];
}

export const MAX_OPCIONES = 3;
export const MAX_VARIANTES = 100;
export const MAX_SEO_TITULO = 70;
export const MAX_SEO_DESCRIPCION = 160;

export function varianteVacia(sucursales: string[] = [SUCURSAL_PREDETERMINADA]): VarianteDatos {
  return {
    opciones: {},
    precio: null,
    precio_comparacion: null,
    costo: null,
    sku: "",
    codigo_barras: "",
    peso: null,
    unidad_peso: "kg",
    inventario: sucursales.map((sucursal) => ({ sucursal, disponible: 0, comprometido: 0, no_disponible: 0 })),
  };
}

export function productoVacio(): ProductoDatos {
  return {
    titulo: "",
    descripcion: "",
    estado: "borrador",
    categoria: "",
    tipo: "",
    proveedor: "",
    colecciones: [],
    etiquetas: [],
    plantilla_tema: PLANTILLAS_TEMA[0],
    canales: ["Tienda online", "Point of Sale"],
    cobrar_impuesto: true,
    seguimiento_inventario: true,
    vender_sin_existencias: false,
    es_fisico: true,
    embalaje: EMBALAJE_PREDETERMINADO,
    pais_origen: "",
    codigo_sa: "",
    seo_titulo: "",
    seo_descripcion: "",
    seo_url: "",
    metacampos: [],
    opciones: [],
    variantes: [varianteVacia()],
    medios: [],
  };
}

/** «En existencia» de una sucursal: la suma de sus tres cantidades (como en Shopify). */
export function enExistencia(i: Pick<InventarioSucursal, "disponible" | "comprometido" | "no_disponible">): number {
  return i.disponible + i.comprometido + i.no_disponible;
}

/** Ganancia y margen (sobre el precio) de un artículo; null si falta el precio o el costo. */
export function gananciaYMargen(precio: number | null, costo: number | null): { ganancia: number; margen: number | null } | null {
  if (precio === null || costo === null) return null;
  const ganancia = precio - costo;
  return { ganancia, margen: precio > 0 ? (ganancia / precio) * 100 : null };
}

/** El controlador (handle) de la URL: minúsculas, sin acentos, con guiones. */
export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255);
}

/** Todas las combinaciones de valores de las opciones (el producto cartesiano), en el orden de las opciones. */
export function combinaciones(opciones: OpcionProducto[]): Record<string, string>[] {
  const activas = opciones.filter((o) => o.nombre.trim() && o.valores.length > 0);
  let resultado: Record<string, string>[] = [{}];
  for (const o of activas) {
    resultado = resultado.flatMap((base) => o.valores.map((v) => ({ ...base, [o.nombre.trim()]: v })));
  }
  return activas.length === 0 ? [] : resultado;
}

export const claveCombinacion = (c: Record<string, string>) => JSON.stringify(Object.entries(c).sort(([a], [b]) => a.localeCompare(b)));

/**
 * Ajusta las variantes a las opciones: conserva (con sus datos) las que siguen existiendo, crea las que faltan copiando
 * las sucursales, y quita las que ya no corresponden. Sin opciones queda la variante única.
 */
export function sincronizarVariantes(opciones: OpcionProducto[], actuales: VarianteDatos[], sucursales: string[]): VarianteDatos[] {
  const combos = combinaciones(opciones);
  if (combos.length === 0) return [actuales.find((v) => Object.keys(v.opciones).length === 0) ?? actuales[0] ?? varianteVacia(sucursales)].map((v) => ({ ...v, opciones: {} }));
  const porClave = new Map(actuales.map((v) => [claveCombinacion(v.opciones), v]));
  const base = actuales[0];
  return combos.map((c) => {
    const previa = porClave.get(claveCombinacion(c));
    if (previa) return previa;
    const nueva = varianteVacia(sucursales);
    return { ...nueva, opciones: c, precio: base?.precio ?? null, precio_comparacion: base?.precio_comparacion ?? null, costo: base?.costo ?? null, unidad_peso: base?.unidad_peso ?? "kg" };
  });
}

/** Quita lo que puede ejecutar código del HTML de la descripción (script, iframe, atributos on*, javascript:). */
export function sanitizarHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown, max: number, largo = 255): string[] =>
  Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, largo)).filter(Boolean))].slice(0, max)
    : [];
const numeroONull = (v: unknown): number | null | "invalido" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : "invalido";
};
const entero = (v: unknown): number => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/** Valida y limpia el formulario que llega al servidor. Devuelve el error como valor (en producción Next.js oculta las excepciones). */
export function validarProducto(crudo: unknown): { datos: ProductoDatos } | { error: string } {
  if (typeof crudo !== "object" || crudo === null) return { error: "Los datos del producto no son válidos." };
  const r = crudo as Record<string, unknown>;

  const titulo = texto(r.titulo, 255);
  if (!titulo) return { error: "Falta el título del producto." };
  const estado = ESTADOS_PRODUCTO.find((e) => e === r.estado);
  if (!estado) return { error: "El estado no es válido." };

  const opciones: OpcionProducto[] = (Array.isArray(r.opciones) ? r.opciones : [])
    .slice(0, MAX_OPCIONES)
    .map((o) => ({ nombre: texto((o as OpcionProducto)?.nombre, 60), valores: lista((o as OpcionProducto)?.valores, 50, 60) }))
    .filter((o) => o.nombre && o.valores.length > 0);
  const nombres = opciones.map((o) => o.nombre.toLowerCase());
  if (new Set(nombres).size !== nombres.length) return { error: "Dos opciones tienen el mismo nombre." };

  const crudas = Array.isArray(r.variantes) ? r.variantes : [];
  if (crudas.length === 0) return { error: "El producto necesita al menos una variante." };
  if (crudas.length > MAX_VARIANTES) return { error: `Un producto admite hasta ${MAX_VARIANTES} variantes.` };

  const variantes: VarianteDatos[] = [];
  for (const [i, v] of crudas.entries()) {
    const c = v as Record<string, unknown>;
    const precio = numeroONull(c.precio);
    const comparacion = numeroONull(c.precio_comparacion);
    const costo = numeroONull(c.costo);
    const peso = numeroONull(c.peso);
    if ([precio, comparacion, costo, peso].includes("invalido")) {
      return { error: `Los precios, el costo y el peso no pueden ser negativos${crudas.length > 1 ? " (variante " + (i + 1) + ")" : ""}.` };
    }
    const unidad = UNIDADES_PESO.find((u) => u === c.unidad_peso) ?? "kg";
    const inventario: InventarioSucursal[] = (Array.isArray(c.inventario) ? c.inventario : [])
      .slice(0, 50)
      .map((x) => {
        const s = x as Record<string, unknown>;
        return {
          sucursal: texto(s.sucursal, 80),
          disponible: entero(s.disponible),
          comprometido: Math.max(0, entero(s.comprometido)),
          no_disponible: Math.max(0, entero(s.no_disponible)),
        };
      })
      .filter((x) => x.sucursal);
    const opcionesVariante: Record<string, string> = {};
    for (const o of opciones) {
      const valor = texto((c.opciones as Record<string, unknown> | undefined)?.[o.nombre], 60);
      if (!valor) return { error: `Falta el valor de «${o.nombre}» en una variante.` };
      opcionesVariante[o.nombre] = valor;
    }
    variantes.push({
      id: typeof c.id === "string" ? c.id : undefined,
      opciones: opcionesVariante,
      precio: precio as number | null,
      precio_comparacion: comparacion as number | null,
      costo: costo as number | null,
      sku: texto(c.sku, 120),
      codigo_barras: texto(c.codigo_barras, 60),
      peso: peso as number | null,
      unidad_peso: unidad,
      inventario,
    });
  }

  const seoUrl = slugificar(texto(r.seo_url, 255));
  const medios: MedioDatos[] = (Array.isArray(r.medios) ? r.medios : []).slice(0, 250).map((m) => {
    const x = m as Record<string, unknown>;
    return {
      id: typeof x.id === "string" ? x.id : undefined,
      ruta: typeof x.ruta === "string" ? x.ruta : undefined,
      tempId: typeof x.tempId === "string" ? x.tempId : undefined,
      nombre_archivo: texto(x.nombre_archivo, 200),
      tipo: x.tipo === "video" ? "video" : "imagen",
      alt: texto(x.alt, 512),
    };
  });

  return {
    datos: {
      titulo,
      descripcion: sanitizarHtml(typeof r.descripcion === "string" ? r.descripcion.slice(0, 200_000) : ""),
      estado,
      categoria: texto(r.categoria, 200),
      tipo: texto(r.tipo, 100),
      proveedor: texto(r.proveedor, 100),
      colecciones: lista(r.colecciones, 100),
      etiquetas: lista(r.etiquetas, 250, 255),
      plantilla_tema: texto(r.plantilla_tema, 100) || PLANTILLAS_TEMA[0],
      canales: lista(r.canales, 20),
      cobrar_impuesto: r.cobrar_impuesto === true,
      seguimiento_inventario: r.seguimiento_inventario === true,
      vender_sin_existencias: r.vender_sin_existencias === true,
      es_fisico: r.es_fisico === true,
      embalaje: texto(r.embalaje, 120),
      pais_origen: texto(r.pais_origen, 80),
      codigo_sa: texto(r.codigo_sa, 20),
      seo_titulo: texto(r.seo_titulo, MAX_SEO_TITULO),
      seo_descripcion: texto(r.seo_descripcion, MAX_SEO_DESCRIPCION),
      seo_url: seoUrl,
      metacampos: (Array.isArray(r.metacampos) ? r.metacampos : [])
        .slice(0, 50)
        .map((m) => ({ clave: texto((m as Metacampo)?.clave, 80), valor: texto((m as Metacampo)?.valor, 500) }))
        .filter((m) => m.clave),
      opciones,
      variantes,
      medios,
    },
  };
}
