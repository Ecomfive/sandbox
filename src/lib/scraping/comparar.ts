// Scraping de proveedores (14 oct 2026): lo que se lee de la página de un proveedor de Dropi se compara con lo guardado de la
// búsqueda anterior. Sale qué productos son nuevos, cuáles cambiaron de precio o de stock, cuáles desaparecieron (y por qué
// se cree que fue) y con qué producto con foto se vincula cada privado. Sin base ni React, para poder probarlo.
//
// Dropi, visto con la sesión de un dropshipper, solo entrega los productos **publicados con stock** (el «1436 Productos» del
// encabezado cuenta también los sin stock y los privados de otros dropshippers). Por eso un producto que se agota deja de
// aparecer: desaparecer con poco stock se toma como «agotado».

import { palabrasClave, parecidoNombre } from "@/lib/wms/duplicados";

export const URL_FOTOS_DROPI = "https://d39ru7awumhhs2.cloudfront.net/";

/** Con este stock o menos en la búsqueda anterior, un producto que desaparece se cuenta como agotado. */
export const STOCK_AGOTADO = 10;
/** Desde cuánto parecido del nombre (y con 2 palabras en común o más) un privado queda vinculado solo. */
export const UMBRAL_VINCULO = 0.85;
/** Desde cuánto se ofrece como posible pareja (para que la persona lo confirme). */
export const UMBRAL_POSIBLE = 0.5;

export interface ProductoVisto {
  dropiId: number;
  sku: string | null;
  nombre: string;
  foto: string | null;
  privado: boolean;
  precio: number | null;
  precioSugerido: number | null;
  stock: number | null;
  categoria: string | null;
  creadoEnDropi: string | null;
}

export interface ProductoGuardado {
  id: string;
  dropiId: number;
  nombre: string;
  privado: boolean;
  precio: number | null;
  stock: number | null;
  estado: "activo" | "desaparecido";
}

export type TipoEvento = "primera_vez" | "precio" | "stock" | "desaparecio" | "reaparecio" | "privatizado" | "publicado" | "vinculado";

export interface Evento {
  evento: TipoEvento;
  precio: number | null;
  stock: number | null;
  precio_antes: number | null;
  stock_antes: number | null;
  detalle: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const sumaStock = (filas: unknown): number =>
  Array.isArray(filas) ? filas.reduce((t: number, w) => t + (num((w as { stock?: unknown })?.stock) ?? 0), 0) : 0;

/** Un privado de Dropi: lo marca el propio Dropi o el proveedor lo nombra «Privado …» / «Full Privado …». */
export function esPrivado(nombre: string, marcado: boolean): boolean {
  return marcado || /privad[oa]/i.test(nombre);
}

/** Un producto tal como lo entrega `api/products/v4/index`, con lo que se guarda. `null` si no trae id o nombre. */
export function normalizarDropi(o: unknown): ProductoVisto | null {
  if (!o || typeof o !== "object") return null;
  const p = o as Record<string, unknown>;
  const dropiId = num(p.id);
  const nombre = typeof p.name === "string" ? p.name.trim() : "";
  if (dropiId === null || !nombre) return null;
  const galeria = Array.isArray(p.gallery) ? (p.gallery as Record<string, unknown>[]) : [];
  const principal = galeria.find((g) => g?.main) ?? galeria[0];
  const ruta = typeof principal?.urlS3 === "string" ? principal.urlS3 : typeof principal?.url === "string" ? principal.url : "";
  const privado = esPrivado(nombre, p.privated_product === true || p.private_product === true);
  // Un privado suele llevar el logo del proveedor en vez de la foto del producto: no sirve como foto.
  const foto = ruta && !/logo/i.test(ruta.split("/").pop() ?? "") ? (/^https?:\/\//.test(ruta) ? ruta : URL_FOTOS_DROPI + ruta) : null;
  const variaciones = Array.isArray(p.variations) ? (p.variations as Record<string, unknown>[]) : [];
  const stock =
    p.type === "VARIABLE" && variaciones.length
      ? variaciones.reduce((t, v) => t + sumaStock(v.warehouse_product_variation), 0)
      : sumaStock(p.warehouse_product);
  const categorias = Array.isArray(p.categories) ? (p.categories as Record<string, unknown>[]) : [];
  const categoria = categorias.map((c) => (typeof c?.name === "string" ? c.name : "")).filter(Boolean).join(", ") || null;
  return {
    dropiId,
    sku: typeof p.sku === "string" && p.sku.trim() ? p.sku.trim() : null,
    nombre,
    foto,
    privado,
    precio: num(p.sale_price),
    precioSugerido: num(p.suggested_price),
    stock,
    categoria,
    creadoEnDropi: typeof p.created_at === "string" ? p.created_at : null,
  };
}

const RELLENO_PRIVADO = new Set(["privado", "privada", "full", "hyper", "moda"]);

/** Palabras del nombre para emparejar: las de `palabrasClave` sin «Privado», «Full» ni el nombre del proveedor. */
export function palabrasParaVincular(nombre: string, proveedor = ""): string[] {
  const delProveedor = new Set(palabrasClave(proveedor));
  return palabrasClave(nombre).filter((p) => !RELLENO_PRIVADO.has(p) && !delProveedor.has(p));
}

export interface Pareja {
  id: string;
  parecido: number;
  /** Seguro: se vincula solo. Si no, es una sugerencia para que la persona la confirme. */
  seguro: boolean;
}

/** El producto con foto (no privado) más parecido por nombre a un privado, o `null` si ninguno pasa de `UMBRAL_POSIBLE`. */
export function mejorPareja(
  nombre: string,
  candidatos: { id: string; nombre: string }[],
  proveedor = "",
): Pareja | null {
  const a = palabrasParaVincular(nombre, proveedor);
  if (!a.length) return null;
  let mejor: Pareja | null = null;
  let mejorComunes = 0;
  for (const c of candidatos) {
    const b = palabrasParaVincular(c.nombre, proveedor);
    const parecido = parecidoNombre(a, b);
    if (parecido < UMBRAL_POSIBLE) continue;
    const comunes = Math.round(parecido * Math.min(a.length, b.length));
    if (!mejor || parecido > mejor.parecido || (parecido === mejor.parecido && comunes > mejorComunes)) {
      mejor = { id: c.id, parecido, seguro: parecido >= UMBRAL_VINCULO && comunes >= 2 };
      mejorComunes = comunes;
    }
  }
  return mejor;
}

export interface Cambio {
  id: string;
  visto: ProductoVisto;
  eventos: Evento[];
}

export interface Resultado {
  nuevos: ProductoVisto[];
  /** Todos los que siguen o vuelven a aparecer (se actualiza su `ultima_vez`), con sus eventos si cambió algo. */
  vistos: Cambio[];
  desaparecidos: { id: string; motivo: "agotado" | "privatizado" | "desconocido"; evento: Evento }[];
  cuentas: { vistos: number; nuevos: number; desaparecidos: number; cambiosPrecio: number; cambiosStock: number; privados: number };
}

const evento = (e: Partial<Evento> & { evento: TipoEvento }): Evento => ({
  precio: null,
  stock: null,
  precio_antes: null,
  stock_antes: null,
  detalle: null,
  ...e,
});

/** Compara lo leído hoy con lo guardado. `proveedor` es su nombre (sus palabras no cuentan para vincular privados). */
export function comparar(guardados: ProductoGuardado[], vistosHoy: ProductoVisto[], proveedor = ""): Resultado {
  const porDropi = new Map(guardados.map((g) => [g.dropiId, g]));
  const unicos = new Map<number, ProductoVisto>();
  for (const v of vistosHoy) unicos.set(v.dropiId, v);

  const nuevos: ProductoVisto[] = [];
  const vistos: Cambio[] = [];
  let cambiosPrecio = 0;
  let cambiosStock = 0;

  for (const v of unicos.values()) {
    const g = porDropi.get(v.dropiId);
    if (!g) {
      nuevos.push(v);
      continue;
    }
    const eventos: Evento[] = [];
    if (g.estado === "desaparecido") eventos.push(evento({ evento: "reaparecio", precio: v.precio, stock: v.stock }));
    if (g.privado !== v.privado) eventos.push(evento({ evento: v.privado ? "privatizado" : "publicado" }));
    if (g.precio !== null && v.precio !== null && g.precio !== v.precio) {
      eventos.push(evento({ evento: "precio", precio: v.precio, precio_antes: g.precio }));
      cambiosPrecio++;
    }
    if (g.stock !== null && v.stock !== null && g.stock !== v.stock) {
      eventos.push(evento({ evento: "stock", stock: v.stock, stock_antes: g.stock }));
      cambiosStock++;
    }
    vistos.push({ id: g.id, visto: v, eventos });
  }

  // Lo que estaba y ya no aparece. Si hoy hay un privado con su mismo nombre, lo hicieron privado; si le quedaba poco stock,
  // se agotó.
  const privadosHoy = [...unicos.values()].filter((v) => v.privado).map((v) => ({ id: String(v.dropiId), nombre: v.nombre }));
  const desaparecidos: Resultado["desaparecidos"] = [];
  for (const g of guardados) {
    if (g.estado !== "activo" || unicos.has(g.dropiId)) continue;
    const comoPrivado = !g.privado && privadosHoy.length ? mejorPareja(g.nombre, privadosHoy, proveedor) : null;
    const motivo = comoPrivado?.seguro ? "privatizado" : g.stock !== null && g.stock <= STOCK_AGOTADO ? "agotado" : "desconocido";
    desaparecidos.push({
      id: g.id,
      motivo,
      evento: evento({
        evento: "desaparecio",
        precio_antes: g.precio,
        stock_antes: g.stock,
        detalle: motivo === "agotado" ? "Se agotó" : motivo === "privatizado" ? "Lo hicieron privado" : "Dejó de aparecer",
      }),
    });
  }

  return {
    nuevos,
    vistos,
    desaparecidos,
    cuentas: {
      vistos: unicos.size,
      nuevos: nuevos.length,
      desaparecidos: desaparecidos.length,
      cambiosPrecio,
      cambiosStock,
      privados: [...unicos.values()].filter((v) => v.privado).length,
    },
  };
}
