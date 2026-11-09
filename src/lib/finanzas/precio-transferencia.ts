// Portal AF4 360° › Precio de transferencia entre la importadora (ECOMFIVE: proveeduría que importa la mercancía) y las
// tiendas propias (migración 0952). Lógica pura, sin Supabase. Prueba en `precio-transferencia.test.ts`.
//
// El problema: la importadora compra y paga la mercancía, pero el libro le carga a cada tienda solo una parte (o nada) de lo
// que vendió, así que el costo de mercancía de una tienda queda muy por debajo de lo real, su EBITDA no sirve para decidir y
// el resultado de la importadora queda castigado con mercancía que vendieron otras.
//
// La solución es una vista, no asientos: el libro no se toca. Para cada tienda y mes:
//   esperado (E) = Σ unidades entregadas × costo puesto en bodega del producto × (1 + margen de transferencia)
//   registrado (R) = la mercancía que el libro ya le cargó (tipos de mercancía de costo de ventas)
// y se arma el EERR con tres líneas de ajuste:
//   · la tienda: + E «Mercancía a precio de transferencia» y − R «Mercancía del libro reclasificada a la importadora»
//   · la importadora: + E «Ventas intercompañía a tiendas» y + R de esa mercancía reclasificada (la compró ella)
//   · la columna «Eliminaciones»: − E de ventas intercompañía y − E de mercancía a precio de transferencia
// Cada línea de ajuste suma cero entre las columnas, así que el consolidado (el total) es exactamente el de siempre. Por
// qué una vista y no asientos del cierre: la política (márgenes) se puede cambiar y recalcula toda la historia, no choca con
// los meses cerrados ni duplica nada en el libro, y el consolidado queda igual por construcción. Si un día se quiere en el
// libro, se pasan estas mismas líneas como asientos de ajuste (`fin_ajustes_cierre`) del cierre.

import type { FilaEerr } from "./eerr";

export const UNIDAD_ELIMINACIONES = "eliminaciones";
export const TIPO_VENTA_IC = "Ventas intercompañía a tiendas (precio de transferencia)";
export const TIPO_COSTO_TP = "Mercancía a precio de transferencia";
export const TIPO_RECLASIFICADO = "Mercancía del libro reclasificada a la importadora";
export const TIPOS_AJUSTE_TP = [TIPO_VENTA_IC, TIPO_COSTO_TP, TIPO_RECLASIFICADO] as const;

export type BaseCosto = "vigente" | "promedio";
export const BASES_COSTO: { clave: BaseCosto; etiqueta: string }[] = [
  { clave: "vigente", etiqueta: "Costo vigente (último lote)" },
  { clave: "promedio", etiqueta: "Costo promedio de los lotes" },
];

export interface PoliticaTP {
  /** Margen de transferencia por defecto, en % sobre el costo puesto en bodega. */
  margenPct: number;
  base: BaseCosto;
  /** La importadora (`fin_unidades`); null = la tienda llamada ECOMFIVE. */
  unidadProveedoraId: string | null;
  /** Tiendas que compran a la importadora; null = todas las tiendas menos la importadora. */
  tiendas: string[] | null;
  /** Tipos del libro que son mercancía; null = los de siempre (`esMercanciaPredeterminada`). */
  tiposMercancia: string[] | null;
}

export const POLITICA_PREDETERMINADA: PoliticaTP = { margenPct: 10, base: "vigente", unidadProveedoraId: null, tiendas: null, tiposMercancia: null };

export type AlcanceRegla = "producto" | "categoria";
export interface ReglaTP {
  id?: string;
  alcance: AlcanceRegla;
  /** `producto_clave` del costo o la línea (categoría) del lote. */
  clave: string;
  margenPct: number;
}

/** Lo entregado de una tienda en un mes por producto (de `fin_tp_unidades`). */
export interface VentaTP {
  periodo: string;
  unidadId: string;
  productoClave: string;
  /** Línea del lote de costo (categoría): ECOMFIVE, CALZADOS… */
  linea: string | null;
  unidades: number;
  /** Costo de lo entregado con el costo vigente (0 si el producto no tiene costo). */
  costo: number;
  /** Con el costo promedio de los lotes (el vigente si no hay). */
  costoPromedio: number;
  /** Ventas de esas líneas (para los porcentajes). */
  ventas: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const margenValido = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n >= 0 && n <= 300 ? Math.round(n * 100) / 100 : null;
};
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

/** La política guardada en `fin_config.precio_transferencia`, completada con la predeterminada. */
export function leerPoliticaTP(v: unknown): PoliticaTP {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const lista = (x: unknown, valido: (s: string) => boolean) =>
    Array.isArray(x) ? [...new Set(x.filter((y): y is string => typeof y === "string" && valido(y)))] : null;
  return {
    margenPct: margenValido(o.margen_pct) ?? POLITICA_PREDETERMINADA.margenPct,
    base: o.base === "promedio" ? "promedio" : "vigente",
    unidadProveedoraId: typeof o.unidad_proveedora_id === "string" && UUID.test(o.unidad_proveedora_id) ? o.unidad_proveedora_id : null,
    tiendas: lista(o.tiendas, (s) => UUID.test(s)),
    tiposMercancia: lista(o.tipos_mercancia, (s) => s.trim().length > 0 && s.length <= 120),
  };
}

/** La política como se guarda (jsonb). */
export const politicaAJson = (p: PoliticaTP) => ({
  margen_pct: p.margenPct,
  base: p.base,
  unidad_proveedora_id: p.unidadProveedoraId,
  tiendas: p.tiendas,
  tipos_mercancia: p.tiposMercancia,
});

/** Valida lo que llega del formulario. */
export function validarPoliticaTP(e: { margen?: unknown; base?: unknown; proveedora?: unknown; tiendas?: unknown; tipos?: unknown }): PoliticaTP | { error: string } {
  const margenPct = margenValido(e.margen);
  if (margenPct === null) return { error: "El margen va de 0 % a 300 %." };
  if (e.base !== "vigente" && e.base !== "promedio") return { error: "Elige el costo base." };
  const proveedora = typeof e.proveedora === "string" && e.proveedora ? e.proveedora : null;
  if (proveedora && !UUID.test(proveedora)) return { error: "Elige la importadora." };
  const tiendas = Array.isArray(e.tiendas) ? [...new Set(e.tiendas.filter((t): t is string => typeof t === "string" && UUID.test(t)))] : null;
  if (tiendas && proveedora && tiendas.includes(proveedora)) return { error: "La importadora no puede comprarse a sí misma." };
  const tipos = Array.isArray(e.tipos) ? [...new Set(e.tipos.filter((t): t is string => typeof t === "string" && t.trim().length > 0 && t.length <= 120))] : null;
  if (tipos && !tipos.length) return { error: "Elige al menos un tipo de mercancía." };
  return { margenPct, base: e.base, unidadProveedoraId: proveedora, tiendas: tiendas && tiendas.length ? tiendas : null, tiposMercancia: tipos };
}

export function validarReglaTP(e: { alcance?: unknown; clave?: unknown; margen?: unknown }): ReglaTP | { error: string } {
  if (e.alcance !== "producto" && e.alcance !== "categoria") return { error: "Elige si es un producto o una categoría." };
  const clave = typeof e.clave === "string" ? e.clave.replace(/\s+/g, " ").trim() : "";
  if (clave.length < 1 || clave.length > 200) return { error: e.alcance === "producto" ? "Elige el producto." : "Elige la categoría." };
  const margenPct = margenValido(e.margen);
  if (margenPct === null) return { error: "El margen va de 0 % a 300 %." };
  return { alcance: e.alcance, clave, margenPct };
}

/** Los tipos de mercancía de siempre (la misma regla de `fin_rentabilidad_libro`, migración 0915). */
export function esMercanciaPredeterminada(nombre: string): boolean {
  const n = normal(nombre);
  return n.includes("MERCANC") || n === "COSTO DE VENTAS" || n.startsWith("IMPORTACI") || n.startsWith("OTROS GASTOS DE IMPORTACI");
}

export function esTipoMercancia(nombre: string, p: PoliticaTP): boolean {
  if (p.tiposMercancia) return p.tiposMercancia.some((t) => normal(t) === normal(nombre));
  return esMercanciaPredeterminada(nombre);
}

/** La importadora: la elegida o la tienda que se llama ECOMFIVE. */
export function proveedoraDe(p: PoliticaTP, unidades: { id: string; nombre: string; clase: string }[]): string | null {
  if (p.unidadProveedoraId && unidades.some((u) => u.id === p.unidadProveedoraId)) return p.unidadProveedoraId;
  return unidades.find((u) => /^ECOMFIVE/i.test(u.nombre.trim()))?.id ?? null;
}

/** Las tiendas que compran a la importadora. */
export function tiendasCompradoras(p: PoliticaTP, unidades: { id: string; clase: string }[], proveedora: string | null): Set<string> {
  const base = p.tiendas ?? unidades.filter((u) => u.clase === "tienda").map((u) => u.id);
  return new Set(base.filter((id) => id !== proveedora));
}

export type OrigenMargen = "producto" | "categoria" | "defecto";

/** El margen de un producto: su regla, si no la de su categoría, si no el de la política. */
export function margenDe(v: Pick<VentaTP, "productoClave" | "linea">, reglas: ReglaTP[], p: PoliticaTP): { pct: number; origen: OrigenMargen } {
  const prod = reglas.find((r) => r.alcance === "producto" && normal(r.clave) === normal(v.productoClave));
  if (prod) return { pct: prod.margenPct, origen: "producto" };
  const cat = v.linea ? reglas.find((r) => r.alcance === "categoria" && normal(r.clave) === normal(v.linea!)) : undefined;
  if (cat) return { pct: cat.margenPct, origen: "categoria" };
  return { pct: p.margenPct, origen: "defecto" };
}

export interface TransferenciaTienda {
  periodo: string;
  unidadId: string;
  unidades: number;
  /** Costo puesto en bodega de lo entregado (con la base elegida). */
  costo: number;
  /** Costo × (1 + margen). */
  esperado: number;
  /** Unidades entregadas de productos sin costo (quedan fuera de lo esperado). */
  sinCosto: number;
  ventas: number;
}

const clave = (periodo: string, unidad: string) => `${periodo}|${unidad}`;

/** Lo que cada tienda debería tener de mercancía a precio de transferencia, por mes. */
export function transferenciaPorTienda(ventas: VentaTP[], reglas: ReglaTP[], p: PoliticaTP, tiendas: Set<string>): Map<string, TransferenciaTienda> {
  const salida = new Map<string, TransferenciaTienda>();
  for (const v of ventas) {
    if (!tiendas.has(v.unidadId) || !(v.unidades > 0)) continue;
    const k = clave(v.periodo, v.unidadId);
    const t = salida.get(k) ?? { periodo: v.periodo, unidadId: v.unidadId, unidades: 0, costo: 0, esperado: 0, sinCosto: 0, ventas: 0 };
    const costo = p.base === "promedio" ? v.costoPromedio || v.costo : v.costo;
    t.unidades += v.unidades;
    t.ventas += v.ventas;
    if (costo > 0) {
      t.costo += costo;
      t.esperado += costo * (1 + margenDe(v, reglas, p).pct / 100);
    } else t.sinCosto += v.unidades;
    salida.set(k, t);
  }
  for (const t of salida.values()) {
    t.costo = r2(t.costo);
    t.esperado = r2(t.esperado);
    t.ventas = r2(t.ventas);
  }
  return salida;
}

/** La mercancía que el libro ya le cargó a cada unidad, por mes (un reverso resta). */
export function registradoPorUnidad(filas: FilaEerr[], p: PoliticaTP): Map<string, number> {
  const salida = new Map<string, number>();
  for (const f of filas) {
    if (f.seccion !== "costo_ventas" || !esTipoMercancia(f.tipo, p)) continue;
    const k = clave(f.periodo, f.unidad_id);
    salida.set(k, r2((salida.get(k) ?? 0) - f.monto * f.signo));
  }
  return salida;
}

/** Las ventas netas de cada unidad por mes (ingresos con su signo), para los porcentajes. */
export function ventasPorUnidad(filas: FilaEerr[]): Map<string, number> {
  const salida = new Map<string, number>();
  for (const f of filas) {
    if (f.seccion !== "ingresos") continue;
    const k = clave(f.periodo, f.unidad_id);
    salida.set(k, r2((salida.get(k) ?? 0) + f.monto * f.signo));
  }
  return salida;
}

export interface DiferenciaTP {
  periodo: string;
  unidadId: string;
  unidades: number;
  sinCosto: number;
  /** Ventas netas de la tienda en el EERR. */
  ventas: number;
  costo: number;
  esperado: number;
  registrado: number;
  /** esperado − registrado = costo no cargado + margen de la importadora. */
  diferencia: number;
  /** costo − registrado: mercancía que la importadora pagó y el libro no le cargó a la tienda. */
  costoNoCargado: number;
  /** esperado − costo: el margen que gana la importadora. */
  margenImportadora: number;
  /** % de las ventas: lo registrado y lo esperado (null sin ventas). */
  pctRegistrado: number | null;
  pctEsperado: number | null;
}

export interface ResultadoTP {
  proveedora: string | null;
  /** Las líneas de ajuste por unidad (tiendas e importadora) en la forma del EERR. */
  ajustes: FilaEerr[];
  /** La columna de eliminaciones (`UNIDAD_ELIMINACIONES`). */
  eliminaciones: FilaEerr[];
  diferencias: DiferenciaTP[];
}

const fila = (periodo: string, unidad: string, tipo: string, seccion: "ingresos" | "costo_ventas", signo: number, orden: number, monto: number): FilaEerr => ({
  periodo,
  unidad_id: unidad,
  tipo,
  orden,
  seccion,
  signo,
  monto: r2(monto),
});

/** Arma los ajustes de precio de transferencia sobre las filas del EERR (ya repartidas) de los meses pedidos. */
export function ajustesTP(args: {
  filas: FilaEerr[];
  ventas: VentaTP[];
  reglas: ReglaTP[];
  politica: PoliticaTP;
  unidades: { id: string; nombre: string; clase: string }[];
  meses: string[];
}): ResultadoTP {
  const { filas, ventas, reglas, politica, unidades } = args;
  const meses = new Set(args.meses);
  const proveedora = proveedoraDe(politica, unidades);
  const vacio: ResultadoTP = { proveedora, ajustes: [], eliminaciones: [], diferencias: [] };
  if (!proveedora) return vacio;
  const tiendas = tiendasCompradoras(politica, unidades, proveedora);
  const enMeses = filas.filter((f) => meses.has(f.periodo));
  const esperado = transferenciaPorTienda(ventas.filter((v) => meses.has(v.periodo)), reglas, politica, tiendas);
  const registrado = registradoPorUnidad(enMeses, politica);
  const ventasEerr = ventasPorUnidad(enMeses);
  const llaves = new Set<string>([...esperado.keys(), ...[...registrado.keys()].filter((k) => tiendas.has(k.split("|")[1]))]);
  const ajustes: FilaEerr[] = [];
  const eliminaciones: FilaEerr[] = [];
  const diferencias: DiferenciaTP[] = [];
  const porMes = new Map<string, { e: number; r: number }>();
  for (const k of [...llaves].sort()) {
    const [periodo, unidad] = k.split("|");
    const t = esperado.get(k);
    const E = t?.esperado ?? 0;
    const R = registrado.get(k) ?? 0;
    const C = t?.costo ?? 0;
    if (Math.abs(E) < 0.005 && Math.abs(R) < 0.005) continue;
    if (E) ajustes.push(fila(periodo, unidad, TIPO_COSTO_TP, "costo_ventas", -1, 990, E));
    if (R) ajustes.push(fila(periodo, unidad, TIPO_RECLASIFICADO, "costo_ventas", -1, 991, -R));
    const m = porMes.get(periodo) ?? { e: 0, r: 0 };
    m.e += E;
    m.r += R;
    porMes.set(periodo, m);
    const vts = ventasEerr.get(k) ?? 0;
    diferencias.push({
      periodo,
      unidadId: unidad,
      unidades: t?.unidades ?? 0,
      sinCosto: t?.sinCosto ?? 0,
      ventas: vts,
      costo: C,
      esperado: E,
      registrado: R,
      diferencia: r2(E - R),
      costoNoCargado: r2(C - R),
      margenImportadora: r2(E - C),
      pctRegistrado: vts > 0 ? (R / vts) * 100 : null,
      pctEsperado: vts > 0 ? (E / vts) * 100 : null,
    });
  }
  for (const [periodo, { e, r }] of [...porMes].sort()) {
    if (e) {
      ajustes.push(fila(periodo, proveedora, TIPO_VENTA_IC, "ingresos", 1, 990, e));
      eliminaciones.push(fila(periodo, UNIDAD_ELIMINACIONES, TIPO_VENTA_IC, "ingresos", 1, 990, -e));
      eliminaciones.push(fila(periodo, UNIDAD_ELIMINACIONES, TIPO_COSTO_TP, "costo_ventas", -1, 990, -e));
    }
    if (r) ajustes.push(fila(periodo, proveedora, TIPO_RECLASIFICADO, "costo_ventas", -1, 991, r));
  }
  return { proveedora, ajustes, eliminaciones, diferencias };
}

/** Totales de las diferencias (para los indicadores). */
export function totalesTP(ds: DiferenciaTP[]) {
  const s = (f: (d: DiferenciaTP) => number) => r2(ds.reduce((a, d) => a + f(d), 0));
  const ventas = s((d) => d.ventas);
  const registrado = s((d) => d.registrado);
  const esperado = s((d) => d.esperado);
  return {
    unidades: s((d) => d.unidades),
    sinCosto: s((d) => d.sinCosto),
    ventas,
    costo: s((d) => d.costo),
    esperado,
    registrado,
    diferencia: s((d) => d.diferencia),
    costoNoCargado: s((d) => d.costoNoCargado),
    margenImportadora: s((d) => d.margenImportadora),
    pctRegistrado: ventas > 0 ? (registrado / ventas) * 100 : null,
    pctEsperado: ventas > 0 ? (esperado / ventas) * 100 : null,
  };
}

/** La fila de `fin_tp_unidades` como venta. */
export function leerVentaTP(r: Record<string, unknown>): VentaTP {
  const n = (v: unknown) => Number(v ?? 0) || 0;
  return {
    periodo: String(r.periodo).slice(0, 10),
    unidadId: String(r.unidad_id),
    productoClave: String(r.producto_clave ?? ""),
    linea: r.linea === null || r.linea === undefined ? null : String(r.linea),
    unidades: n(r.unidades),
    costo: n(r.costo),
    costoPromedio: n(r.costo_promedio),
    ventas: n(r.ventas),
  };
}
