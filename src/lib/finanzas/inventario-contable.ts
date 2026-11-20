// Inventario contable y renta (lista de 100 mejoras, 71, 73, 74, 78 y 86; 19 nov 2026). Lógica pura: inventario propio y en
// consignación, provisión por obsoleto, inventario en plataformas valorizado y el estimado del impuesto sobre la renta de
// Panamá con lo que va del año. Prueba en `inventario-contable.test.ts`.

import { diasEntre, type FilaValorizada, type ProductoInventario } from "./inventario-valorizado";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------------------------
// 78. Consignación: mercancía en nuestras bodegas que no es nuestra (de un cliente de fulfillment o de un proveedor)
// ---------------------------------------------------------------------------------------------

export const CLAVE_CONSIGNACION = "inventario_consignacion";

/** Lee `fin_config.inventario_consignacion` (lista de id de bodegas). */
export function leerConsignacion(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 200) : [];
}

/** Separa las filas de las bodegas en consignación: no son activo nuestro y no suman al inventario contable. */
export function separarConsignacion(filas: FilaValorizada[], bodegas: string[]): { propias: FilaValorizada[]; consignacion: FilaValorizada[] } {
  const set = new Set(bodegas);
  return { propias: filas.filter((f) => !set.has(f.bodegaId)), consignacion: filas.filter((f) => set.has(f.bodegaId)) };
}

// ---------------------------------------------------------------------------------------------
// 73. Provisión por inventario obsoleto
// ---------------------------------------------------------------------------------------------

/** Tramos de la provisión por días sin salidas: desde 120 días, la mitad; desde 180 o sin salidas, todo. */
export const TRAMOS_PROVISION = [
  { desde: 180, porcentaje: 1, etiqueta: "180 días o más" },
  { desde: 120, porcentaje: 0.5, etiqueta: "120 a 179 días" },
] as const;

export interface LineaProvision {
  skuId: string;
  codigo: string;
  producto: string;
  valor: number;
  diasSinSalida: number | null;
  porcentaje: number;
  provision: number;
}

export interface Provision {
  lineas: LineaProvision[];
  total: number;
  /** Valor del inventario alcanzado (más de 120 días sin salidas). */
  valorObsoleto: number;
  porTramo: { etiqueta: string; valor: number; provision: number }[];
}

/** La provisión de cada producto con stock, por los días desde su última salida (sin salidas = 100 %). */
export function provisionObsoleto(productos: ProductoInventario[], hoy: string): Provision {
  const lineas: LineaProvision[] = [];
  for (const p of productos) {
    if (p.unidades <= 0 || p.valor <= 0) continue;
    const d = p.ultimaSalida ? diasEntre(p.ultimaSalida, hoy) : null;
    const tramo = d === null ? TRAMOS_PROVISION[0] : TRAMOS_PROVISION.find((t) => d >= t.desde);
    if (!tramo) continue;
    lineas.push({ skuId: p.skuId, codigo: p.codigo, producto: p.producto, valor: p.valor, diasSinSalida: d, porcentaje: tramo.porcentaje, provision: r2(p.valor * tramo.porcentaje) });
  }
  lineas.sort((a, b) => b.provision - a.provision || a.codigo.localeCompare(b.codigo));
  const porTramo = TRAMOS_PROVISION.map((t) => {
    const del = lineas.filter((l) => l.porcentaje === t.porcentaje);
    return { etiqueta: t.etiqueta, valor: r2(del.reduce((a, l) => a + l.valor, 0)), provision: r2(del.reduce((a, l) => a + l.provision, 0)) };
  });
  return { lineas, total: r2(lineas.reduce((a, l) => a + l.provision, 0)), valorObsoleto: r2(lineas.reduce((a, l) => a + l.valor, 0)), porTramo };
}

export const TIPO_PROVISION = "Provisión por inventario obsoleto";
export const claveProvision = (mes: string) => `provision-obsoleto:${mes.slice(0, 7)}`;

/** Lo que hay que asentar este mes: la provisión de hoy menos lo ya provisionado en meses anteriores (negativo = reverso). */
export const ajusteProvision = (provisionHoy: number, yaProvisionado: number) => r2(provisionHoy - yaProvisionado);

// ---------------------------------------------------------------------------------------------
// 74. Inventario en plataformas (Dropi, Drop, Effi, Dunamixfy) valorizado al costo
// ---------------------------------------------------------------------------------------------

export interface StockPlataformaSku {
  dropi: number;
  drop: number;
  effi: number;
  dunamixfy: number;
}

export interface PlataformasValorizadas {
  porPlataforma: { plataforma: keyof StockPlataformaSku; unidades: number; valor: number }[];
  valor: number;
  unidades: number;
  /** Productos con unidades en plataformas y sin costo vigente (no suman al valor). */
  sinCosto: number;
}

export function valorizarPlataformas(stock: Map<string, StockPlataformaSku>, costo: Map<string, number>): PlataformasValorizadas {
  const plataformas: (keyof StockPlataformaSku)[] = ["dropi", "drop", "effi", "dunamixfy"];
  const acc = Object.fromEntries(plataformas.map((p) => [p, { unidades: 0, valor: 0 }])) as Record<keyof StockPlataformaSku, { unidades: number; valor: number }>;
  let sinCosto = 0;
  for (const [sku, s] of stock) {
    const c = costo.get(sku);
    const unidades = plataformas.reduce((a, p) => a + Math.max(0, s[p]), 0);
    if (unidades <= 0) continue;
    if (c === undefined) {
      sinCosto++;
      for (const p of plataformas) acc[p].unidades += Math.max(0, s[p]);
      continue;
    }
    for (const p of plataformas) {
      acc[p].unidades += Math.max(0, s[p]);
      acc[p].valor += Math.max(0, s[p]) * c;
    }
  }
  const porPlataforma = plataformas.map((p) => ({ plataforma: p, unidades: acc[p].unidades, valor: r2(acc[p].valor) })).filter((x) => x.unidades > 0);
  return { porPlataforma, valor: r2(porPlataforma.reduce((a, x) => a + x.valor, 0)), unidades: porPlataforma.reduce((a, x) => a + x.unidades, 0), sinCosto };
}

// ---------------------------------------------------------------------------------------------
// 86. Estimado del impuesto sobre la renta (Panamá) con lo que va del año
// ---------------------------------------------------------------------------------------------

/** Tarifa general del impuesto sobre la renta de las personas jurídicas en Panamá. */
export const TARIFA_RENTA = 0.25;
/** Desde estos ingresos gravables anuales se compara con el cálculo alterno (CAIR). */
export const UMBRAL_CAIR = 1_500_000;
/** El CAIR: 4.67 % de los ingresos gravables, sobre el que se aplica la tarifa. */
export const BASE_CAIR = 0.0467;

export interface EntradaRenta {
  /** Meses del año con datos (1 a 12). */
  meses: number;
  /** Ingresos netos del año hasta la fecha. */
  ingresos: number;
  /** Resultado antes del impuesto del año hasta la fecha (sin retiros de dividendos). */
  utilidadAntesImpuesto: number;
  /** Impuesto sobre la renta ya registrado en el libro este año. */
  registrado: number;
}

export interface EstimadoRenta {
  ingresosAnual: number;
  utilidadAnual: number;
  tradicional: number;
  /** El cálculo alterno; null si los ingresos no llegan al umbral. */
  cair: number | null;
  /** El mayor de los dos (el que se paga, salvo que la DGI autorice la no aplicación del CAIR). */
  estimado: number;
  metodo: "tradicional" | "cair";
  /** Tasa efectiva sobre la utilidad estimada. */
  tasaEfectiva: number | null;
  /** Lo que falta registrar contra el estimado. */
  porRegistrar: number;
}

/** Anualiza lo que va del año y calcula el impuesto por el método tradicional y, si corresponde, por el CAIR. */
export function estimarRenta(e: EntradaRenta): EstimadoRenta | null {
  if (e.meses < 1) return null;
  const f = 12 / Math.min(12, e.meses);
  const ingresosAnual = r2(e.ingresos * f);
  const utilidadAnual = r2(e.utilidadAntesImpuesto * f);
  const tradicional = r2(Math.max(0, utilidadAnual) * TARIFA_RENTA);
  const cair = ingresosAnual > UMBRAL_CAIR ? r2(ingresosAnual * BASE_CAIR * TARIFA_RENTA) : null;
  const metodo = cair !== null && cair > tradicional ? "cair" : "tradicional";
  const estimado = metodo === "cair" ? cair! : tradicional;
  return {
    ingresosAnual,
    utilidadAnual,
    tradicional,
    cair,
    estimado,
    metodo,
    tasaEfectiva: utilidadAnual > 0 ? estimado / utilidadAnual : null,
    porRegistrar: r2(Math.max(0, estimado - e.registrado)),
  };
}
