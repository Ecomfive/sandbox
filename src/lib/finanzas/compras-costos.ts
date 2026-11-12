// Compras y costos desde el lado financiero (Rentabilidad › Compras y costos, migración 0935). Lógica pura, sin
// Supabase: costo puesto en bodega real por compra (FOB + gastos de importación) contra el costo vigente, variación del
// costo entre lotes, cuentas por pagar a proveedores con su fecha estimada, anticipos, presupuesto de compras por mes y
// las partidas que todo eso suma a la Proyección de caja. Prueba en `compras-costos.test.ts`.

import { DIAS_POR_DEFECTO, MIN_MUESTRA, tiemposDeTransito } from "../compras/planificacion";
import {
  SEMANAS_COMPRA_SIN_FECHA,
  fechaPagoCompra,
  indiceSemana,
  pendienteCompra,
  type CompraAbierta,
  type Linea,
} from "./proyeccion-caja";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------------------------
export interface CompraFin {
  id: string;
  codigo: string;
  nombre: string;
  proveedor: string | null;
  etapa: string;
  estado: string;
  via: string | null;
  montoTotal: number | null;
  primerPago: number | null;
  segundoPago: number | null;
  pagadoAProveedor: number | null;
  fechaPago1: string | null;
  fechaPago2: string | null;
  fechaEnvio: string | null;
  fechaLimite: string | null;
  fechaLlegada: string | null;
  qtyTotal: number | null;
  skuId: string | null;
  creada: string;
}

export interface ItemCompra {
  compraId: string;
  skuId: string;
  codigo: string;
  producto: string;
  cantidad: number;
  recibida: number | null;
  costoUnitario: number | null;
}

export const CONCEPTOS_GASTO = ["flete", "aduana", "agente", "seguro", "almacenaje", "otros"] as const;
export type ConceptoGasto = (typeof CONCEPTOS_GASTO)[number];
export const ETIQUETA_GASTO: Record<ConceptoGasto, string> = {
  flete: "Flete",
  aduana: "Aduana e impuestos",
  agente: "Agente de carga",
  seguro: "Seguro",
  almacenaje: "Almacenaje",
  otros: "Otros",
};
export const esConceptoGasto = (v: unknown): v is ConceptoGasto => typeof v === "string" && (CONCEPTOS_GASTO as readonly string[]).includes(v);

export interface GastoImportacion {
  id: string;
  compraId: string;
  concepto: ConceptoGasto;
  monto: number;
  fecha: string | null;
  pagado: boolean;
  nota: string | null;
}

/** Una compra está abierta si no se completó ni se descartó. */
export const compraAbierta = (c: Pick<CompraFin, "etapa" | "estado">) => c.etapa !== "descartado" && c.estado !== "completado";

// ---------------------------------------------------------------------------------------------
// Validación de lo que llega del navegador
// ---------------------------------------------------------------------------------------------
export interface GastoNuevo {
  concepto: ConceptoGasto;
  monto: number;
  fecha: string | null;
  pagado: boolean;
  nota: string | null;
}

export function validarGasto(v: unknown): GastoNuevo | { error: string } {
  if (!v || typeof v !== "object") return { error: "Datos inválidos." };
  const o = v as Record<string, unknown>;
  if (!esConceptoGasto(o.concepto)) return { error: "Elige el concepto del gasto." };
  const monto = typeof o.monto === "number" ? o.monto : typeof o.monto === "string" ? Number(o.monto.replace(",", ".")) : NaN;
  if (!Number.isFinite(monto) || monto <= 0 || monto >= 10_000_000) return { error: "El monto debe ser mayor a cero." };
  const fecha = typeof o.fecha === "string" && o.fecha.trim() ? o.fecha.trim() : null;
  if (fecha && (!FECHA.test(fecha) || Number.isNaN(Date.parse(fecha)))) return { error: "La fecha no es válida." };
  const nota = typeof o.nota === "string" && o.nota.trim() ? o.nota.trim().slice(0, 300) : null;
  return { concepto: o.concepto, monto: r2(monto), fecha, pagado: o.pagado === true, nota };
}

/** El presupuesto de un mes: «AAAA-MM-01» y un monto ≥ 0 (vacío = quitarlo). */
export function validarPresupuesto(v: unknown): { mes: string; monto: number | null } | { error: string } {
  if (!v || typeof v !== "object") return { error: "Datos inválidos." };
  const o = v as Record<string, unknown>;
  const mes = typeof o.mes === "string" ? o.mes : "";
  if (!/^\d{4}-\d{2}-01$/.test(mes)) return { error: "Mes inválido." };
  if (o.monto === null || o.monto === "" || o.monto === undefined) return { mes, monto: null };
  const monto = typeof o.monto === "number" ? o.monto : typeof o.monto === "string" ? Number(o.monto.replace(/[\s,]/g, "")) : NaN;
  if (!Number.isFinite(monto) || monto < 0 || monto >= 100_000_000) return { error: "El presupuesto debe ser un monto de cero o más." };
  return { mes, monto: r2(monto) };
}

// ---------------------------------------------------------------------------------------------
// 70. Costo puesto en bodega real por compra
// ---------------------------------------------------------------------------------------------
export interface LineaCostoPuesto {
  skuId: string;
  codigo: string;
  producto: string;
  cantidad: number;
  fob: number;
  gastos: number;
  unitarioReal: number | null;
  vigente: number | null;
  diferencia: number | null;
}

export interface CostoPuesto {
  compraId: string;
  codigo: string;
  nombre: string;
  proveedor: string | null;
  etapa: string;
  abierta: boolean;
  fechaLlegada: string | null;
  fob: number;
  gastos: number;
  gastosPorConcepto: Partial<Record<ConceptoGasto, number>>;
  gastosPendientes: number;
  total: number;
  unidades: number;
  /** Costo puesto por unidad (FOB + gastos ÷ unidades). */
  unitarioReal: number | null;
  /** El costo vigente ponderado por las unidades de la compra (Costos de mercancía). */
  unitarioVigente: number | null;
  /** (real − vigente) ÷ vigente. */
  diferencia: number | null;
  /** Gastos ÷ FOB: lo que pesa la importación sobre la mercancía. */
  pesoGastos: number | null;
  lineas: LineaCostoPuesto[];
}

/**
 * El costo puesto en bodega de cada compra con monto. FOB = el monto de la compra (o, si no tiene, la suma de sus
 * productos a su costo unitario). Los gastos de importación se reparten entre los productos en proporción a su FOB (si
 * los productos no tienen costo, por unidades). Se compara con el costo vigente de cada producto.
 */
export function costoPuestoCompras(
  compras: CompraFin[],
  items: ItemCompra[],
  gastos: GastoImportacion[],
  vigente: Map<string, number>,
  nombres: Map<string, { codigo: string; producto: string }> = new Map(),
): CostoPuesto[] {
  const itemsDe = new Map<string, ItemCompra[]>();
  for (const i of items) itemsDe.set(i.compraId, [...(itemsDe.get(i.compraId) ?? []), i]);
  const gastosDe = new Map<string, GastoImportacion[]>();
  for (const g of gastos) gastosDe.set(g.compraId, [...(gastosDe.get(g.compraId) ?? []), g]);
  const salida: CostoPuesto[] = [];
  for (const c of compras) {
    const its = itemsDe.get(c.id) ?? [];
    const gs = gastosDe.get(c.id) ?? [];
    const fobItems = its.reduce((a, i) => a + (i.costoUnitario ?? 0) * i.cantidad, 0);
    const fob = r2(c.montoTotal ?? fobItems);
    if (fob <= 0 && !gs.length) continue;
    const totalGastos = r2(gs.reduce((a, g) => a + g.monto, 0));
    const porConcepto: Partial<Record<ConceptoGasto, number>> = {};
    for (const g of gs) porConcepto[g.concepto] = r2((porConcepto[g.concepto] ?? 0) + g.monto);
    const unidadesItems = its.reduce((a, i) => a + i.cantidad, 0);
    const unidades = unidadesItems || Math.max(c.qtyTotal ?? 0, 0);
    // Sin productos, la compra entera es una línea de su producto (si lo tiene).
    const base: ItemCompra[] = its.length
      ? its
      : c.skuId && unidades > 0
        ? [{ compraId: c.id, skuId: c.skuId, codigo: nombres.get(c.skuId)?.codigo ?? "", producto: nombres.get(c.skuId)?.producto ?? c.nombre, cantidad: unidades, recibida: null, costoUnitario: fob / unidades }]
        : [];
    const pesoPorFob = fobItems > 0;
    const lineas: LineaCostoPuesto[] = base.map((i) => {
      const fobLinea = its.length ? (pesoPorFob ? (fob * (i.costoUnitario ?? 0) * i.cantidad) / fobItems : (fob * i.cantidad) / unidadesItems) : fob;
      const parte = its.length ? (pesoPorFob ? ((i.costoUnitario ?? 0) * i.cantidad) / fobItems : i.cantidad / unidadesItems) : 1;
      const gastosLinea = totalGastos * parte;
      const unitarioReal = i.cantidad > 0 ? Math.round(((fobLinea + gastosLinea) / i.cantidad) * 10_000) / 10_000 : null;
      const v = vigente.get(i.skuId) ?? null;
      return {
        skuId: i.skuId,
        codigo: i.codigo,
        producto: i.producto,
        cantidad: i.cantidad,
        fob: r2(fobLinea),
        gastos: r2(gastosLinea),
        unitarioReal,
        vigente: v,
        diferencia: unitarioReal !== null && v ? Math.round(((unitarioReal - v) / v) * 10_000) / 10_000 : null,
      };
    });
    const conVigente = lineas.filter((l) => l.vigente !== null);
    const uVig = conVigente.reduce((a, l) => a + l.cantidad, 0);
    const unitarioVigente = uVig > 0 ? Math.round((conVigente.reduce((a, l) => a + l.vigente! * l.cantidad, 0) / uVig) * 10_000) / 10_000 : null;
    const total = r2(fob + totalGastos);
    const unitarioReal = unidades > 0 ? Math.round((total / unidades) * 10_000) / 10_000 : null;
    salida.push({
      compraId: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      proveedor: c.proveedor,
      etapa: c.etapa,
      abierta: compraAbierta(c),
      fechaLlegada: c.fechaLlegada,
      fob,
      gastos: totalGastos,
      gastosPorConcepto: porConcepto,
      gastosPendientes: r2(gs.filter((g) => !g.pagado).reduce((a, g) => a + g.monto, 0)),
      total,
      unidades,
      unitarioReal,
      unitarioVigente,
      diferencia: unitarioReal !== null && unitarioVigente ? Math.round(((unitarioReal - unitarioVigente) / unitarioVigente) * 10_000) / 10_000 : null,
      pesoGastos: fob > 0 ? Math.round((totalGastos / fob) * 10_000) / 10_000 : null,
      lineas,
    });
  }
  return salida.sort((a, b) => (b.fechaLlegada ?? "9999").localeCompare(a.fechaLlegada ?? "9999") || b.codigo.localeCompare(a.codigo));
}

// ---------------------------------------------------------------------------------------------
// 71. Variación de costo entre lotes
// ---------------------------------------------------------------------------------------------
export interface LoteCosto {
  productoClave: string;
  producto: string;
  codigo: string | null;
  skuId: string | null;
  fecha: string | null;
  costo: number;
}

export interface VariacionCosto {
  productoClave: string;
  producto: string;
  codigo: string | null;
  skuId: string | null;
  lotes: number;
  ultimo: number;
  fechaUltimo: string | null;
  anterior: number | null;
  fechaAnterior: string | null;
  /** (último − anterior) ÷ anterior. */
  variacion: number | null;
  minimo: number;
  maximo: number;
  /** Del primer lote al último. */
  variacionTotal: number | null;
  alerta: boolean;
}

/** El costo de cada producto lote a lote (por fecha de llegada): el último contra el anterior; alerta si sube más que el umbral. */
export function variacionCostos(lotes: LoteCosto[], umbral: number): VariacionCosto[] {
  const grupos = new Map<string, LoteCosto[]>();
  for (const l of lotes) if (l.costo > 0) grupos.set(l.productoClave, [...(grupos.get(l.productoClave) ?? []), l]);
  const salida: VariacionCosto[] = [];
  for (const [clave, ls] of grupos) {
    const o = [...ls].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const u = o[o.length - 1];
    const a = o.length > 1 ? o[o.length - 2] : null;
    const variacion = a ? Math.round(((u.costo - a.costo) / a.costo) * 10_000) / 10_000 : null;
    const primero = o[0];
    salida.push({
      productoClave: clave,
      producto: u.producto,
      codigo: u.codigo ?? o.find((x) => x.codigo)?.codigo ?? null,
      skuId: u.skuId ?? o.find((x) => x.skuId)?.skuId ?? null,
      lotes: o.length,
      ultimo: u.costo,
      fechaUltimo: u.fecha,
      anterior: a?.costo ?? null,
      fechaAnterior: a?.fecha ?? null,
      variacion,
      minimo: Math.min(...o.map((x) => x.costo)),
      maximo: Math.max(...o.map((x) => x.costo)),
      variacionTotal: o.length > 1 ? Math.round(((u.costo - primero.costo) / primero.costo) * 10_000) / 10_000 : null,
      alerta: variacion !== null && variacion > umbral,
    });
  }
  return salida.sort((x, y) => Number(y.alerta) - Number(x.alerta) || (y.variacion ?? -9) - (x.variacion ?? -9) || x.producto.localeCompare(y.producto));
}

// ---------------------------------------------------------------------------------------------
// 72. Cuentas por pagar a proveedores
// ---------------------------------------------------------------------------------------------
export interface PorPagarProveedor {
  clave: string;
  tipo: "compra" | "gasto";
  compraId: string;
  codigo: string;
  nombre: string;
  proveedor: string | null;
  concepto: string;
  monto: number;
  /** Fecha estimada de pago (null: sin fecha; la proyección lo reparte en las primeras semanas). */
  fecha: string | null;
  vencido: boolean;
}

export const aCompraAbierta = (c: CompraFin): CompraAbierta => ({
  etiqueta: c.codigo || c.nombre,
  monto_total: c.montoTotal ?? 0,
  primer_pago: c.primerPago,
  segundo_pago: c.segundoPago,
  pagado_a_proveedor: c.pagadoAProveedor,
  fecha_pago_1: c.fechaPago1,
  fecha_pago_2: c.fechaPago2,
  fecha_envio: c.fechaEnvio,
  fecha_limite: c.fechaLimite,
  fecha_llegada: c.fechaLlegada,
});

/**
 * Lo que falta pagar: el saldo de cada compra abierta con monto (el segundo pago, o lo que falte; la misma regla que la
 * proyección y el capital de trabajo) con su fecha estimada, y los gastos de importación sin pagar con su fecha.
 * `vencido` = la fecha de la compra (o del gasto) ya pasó.
 */
export function porPagarProveedores(compras: CompraFin[], gastos: GastoImportacion[], hoy: string): PorPagarProveedor[] {
  const salida: PorPagarProveedor[] = [];
  const porId = new Map(compras.map((c) => [c.id, c]));
  for (const c of compras) {
    if (!compraAbierta(c) || c.montoTotal === null) continue;
    const ca = aCompraAbierta(c);
    const monto = pendienteCompra(ca);
    if (monto <= 0) continue;
    const yaPago = (c.pagadoAProveedor ?? 0) > 0 || (c.primerPago ?? 0) > 0;
    const original = [yaPago ? c.fechaPago2 : c.fechaPago1, c.fechaEnvio, c.fechaLimite, c.fechaLlegada].find((f) => !!f) ?? null;
    salida.push({
      clave: `c:${c.id}`,
      tipo: "compra",
      compraId: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      proveedor: c.proveedor,
      concepto: yaPago ? "Segundo pago" : "Pago al proveedor",
      monto,
      fecha: fechaPagoCompra(ca, hoy),
      vencido: !!original && original < hoy,
    });
  }
  for (const g of gastos) {
    if (g.pagado) continue;
    const c = porId.get(g.compraId);
    if (!c || c.etapa === "descartado") continue;
    salida.push({
      clave: `g:${g.id}`,
      tipo: "gasto",
      compraId: g.compraId,
      codigo: c.codigo,
      nombre: c.nombre,
      proveedor: c.proveedor,
      concepto: ETIQUETA_GASTO[g.concepto],
      monto: g.monto,
      fecha: g.fecha && g.fecha < hoy ? hoy : g.fecha,
      vencido: !!g.fecha && g.fecha < hoy,
    });
  }
  return salida.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || b.monto - a.monto);
}

/** Los gastos de importación sin pagar como partidas de la proyección (concepto «Compras abiertas»). */
export function lineasGastosImportacion(porPagar: PorPagarProveedor[], hoy: string, semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const p of porPagar) {
    if (p.tipo !== "gasto") continue;
    const detalle = `Importación ${p.codigo || p.nombre}`;
    const l = lineas.get(detalle) ?? { concepto: "compras" as const, detalle, valores: semanas.map(() => 0) };
    if (p.fecha) {
      const i = indiceSemana(semanas, p.fecha, hoy);
      if (i !== null) l.valores[i] = r2(l.valores[i] + p.monto);
    } else {
      for (let i = 0; i < Math.min(SEMANAS_COMPRA_SIN_FECHA, semanas.length); i++) l.valores[i] = r2(l.valores[i] + p.monto / SEMANAS_COMPRA_SIN_FECHA);
    }
    lineas.set(detalle, l);
  }
  return [...lineas.values()].filter((l) => l.valores.some((v) => v > 0));
}

// ---------------------------------------------------------------------------------------------
// 69. Presupuesto de compras por mes
// ---------------------------------------------------------------------------------------------
export interface MesPresupuesto {
  mes: string;
  presupuesto: number | null;
  /** Lo que ya está comprometido ese mes: saldos de compras y gastos de importación por su fecha estimada. */
  comprometido: number;
  /** Presupuesto − comprometido (null sin presupuesto). */
  disponible: number | null;
  /** Lo que entra a la proyección de caja como compras planificadas (lo disponible, si es positivo). */
  planificado: number;
}

const mesDe = (f: string) => `${f.slice(0, 7)}-01`;

/** Cuántos lunes tiene un mes («AAAA-MM-01»): 4 o 5. */
export function lunesDelMes(mes: string): number {
  const d = new Date(`${mes.slice(0, 7)}-01T12:00:00Z`);
  const m = d.getUTCMonth();
  let n = 0;
  while (d.getUTCMonth() === m) {
    if (d.getUTCDay() === 1) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** El presupuesto de cada mes contra lo comprometido (lo sin fecha cuenta en el mes de hoy). */
export function presupuestoCompras(meses: string[], presupuestos: Map<string, number>, porPagar: PorPagarProveedor[], hoy: string): MesPresupuesto[] {
  const comprometido = new Map<string, number>();
  for (const p of porPagar) {
    const m = mesDe(p.fecha ?? hoy);
    comprometido.set(m, r2((comprometido.get(m) ?? 0) + p.monto));
  }
  return meses.map((mes) => {
    const presupuesto = presupuestos.has(mes) ? presupuestos.get(mes)! : null;
    const c = comprometido.get(mes) ?? 0;
    const disponible = presupuesto === null ? null : r2(presupuesto - c);
    return { mes, presupuesto, comprometido: c, disponible, planificado: disponible !== null && disponible > 0 ? disponible : 0 };
  });
}

/**
 * Las compras planificadas como egreso en la proyección (concepto «Reposición de mercancía»): lo disponible del
 * presupuesto de cada mes se reparte en partes iguales entre las semanas de la proyección cuyo lunes cae en ese mes
 * (la de hoy cuenta en el mes de hoy). Lo comprometido ya está en «Compras abiertas»: por eso solo entra lo disponible.
 */
export function lineasPresupuestoCompras(meses: MesPresupuesto[], semanas: string[], hoy: string): Linea[] {
  const mesSemana = semanas.map((s, i) => mesDe(i === 0 && s < hoy ? hoy : s));
  const salida: Linea[] = [];
  for (const m of meses) {
    if (m.planificado <= 0) continue;
    const usar = mesSemana.map((x, i) => (x === m.mes ? i : -1)).filter((i) => i >= 0);
    if (!usar.length) continue;
    // El mes de hoy reparte lo que queda en sus semanas restantes; un mes que la proyección cubre solo en parte pone en
    // cada semana su parte del mes (un lunes = una semana), no todo el mes en las pocas semanas que se ven.
    const partes = m.mes === mesSemana[0] ? usar.length : Math.max(lunesDelMes(m.mes), usar.length);
    const valores = semanas.map(() => 0);
    for (const i of usar) valores[i] = r2(m.planificado / partes);
    salida.push({ concepto: "mercancia", detalle: `Presupuesto de compras ${m.mes.slice(0, 7)}`, valores });
  }
  return salida;
}

/**
 * El presupuesto de cada mes de la proyección contra lo comprometido que ya tiene la proyección (las partidas de compras
 * abiertas y gastos de importación, por la semana en que caen). Lo usa la Proyección de caja para no contar dos veces.
 */
export function presupuestoDesdeLineas(presupuestos: Map<string, number>, comprometidas: Linea[], semanas: string[], hoy: string): MesPresupuesto[] {
  const mesSemana = semanas.map((s, i) => mesDe(i === 0 && s < hoy ? hoy : s));
  const comprometido = new Map<string, number>();
  for (const l of comprometidas) l.valores.forEach((v, i) => comprometido.set(mesSemana[i], r2((comprometido.get(mesSemana[i]) ?? 0) + v)));
  return [...new Set(mesSemana)].map((mes) => {
    const presupuesto = presupuestos.has(mes) ? presupuestos.get(mes)! : null;
    const c = comprometido.get(mes) ?? 0;
    const disponible = presupuesto === null ? null : r2(presupuesto - c);
    return { mes, presupuesto, comprometido: c, disponible, planificado: disponible !== null && disponible > 0 ? disponible : 0 };
  });
}

// ---------------------------------------------------------------------------------------------
// 73. Anticipos a proveedores
// ---------------------------------------------------------------------------------------------
export interface Anticipo {
  compraId: string;
  codigo: string;
  nombre: string;
  proveedor: string | null;
  etapa: string;
  montoTotal: number | null;
  pagado: number;
  gastosPagados: number;
  anticipo: number;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const fecha10 = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** Una fila de `fin_anticipos_proveedores_al`. */
export function leerAnticipo(f: Record<string, unknown>): Anticipo {
  return {
    compraId: String(f.compra_id),
    codigo: String(f.codigo ?? ""),
    nombre: String(f.nombre ?? ""),
    proveedor: (f.proveedor as string | null) ?? null,
    etapa: String(f.etapa ?? ""),
    montoTotal: f.monto_total === null || f.monto_total === undefined ? null : num(f.monto_total),
    pagado: num(f.pagado),
    gastosPagados: num(f.gastos_pagados),
    anticipo: num(f.anticipo),
    fechaEnvio: fecha10(f.fecha_envio),
    fechaLlegada: fecha10(f.fecha_llegada),
  };
}

// ---------------------------------------------------------------------------------------------
// Reorden: lo que viene en camino y el plazo de cada producto
// ---------------------------------------------------------------------------------------------
export interface PlazoProducto {
  dias: number;
  via: string;
  produccion: number;
  transito: number;
}

export interface DatosReorden {
  enCamino: Map<string, number>;
  plazo: (skuId: string) => PlazoProducto;
}

/** Días de producción si no hay compras para medir (de la compra al envío). */
export const PRODUCCION_PREDETERMINADA = 15;

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};
const diasEntreFechas = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/**
 * Con las compras de Panamá: lo que viene en camino por producto (lo pedido y no recibido de las compras abiertas; una
 * compra sin productos cuenta su cantidad en su producto) y el plazo de cada producto: la producción (mediana de días del
 * primer pago, o de la creación, al envío) más el tránsito real de la vía de su última compra (la mediana de Compras, la
 * de Panamá si hay al menos 3 envíos; si no, lo típico de la vía).
 */
export function armarReorden(compras: CompraFin[], items: ItemCompra[], paisClave: string, hoy: string): DatosReorden {
  const porCompra = new Map<string, ItemCompra[]>();
  for (const i of items) porCompra.set(i.compraId, [...(porCompra.get(i.compraId) ?? []), i]);
  const enCamino = new Map<string, number>();
  const ultimaVia = new Map<string, { fecha: string; via: string }>();
  const produccion: number[] = [];
  const historial: { clave: string; via: string; dias: number }[] = [];
  for (const c of compras) {
    const its = porCompra.get(c.id) ?? [];
    const llego = !!c.fechaLlegada && c.fechaLlegada <= hoy;
    if (compraAbierta(c) && !llego && c.etapa !== "backlog" && c.etapa !== "cotizar" && c.etapa !== "enviado_cotizacion") {
      if (its.length) for (const i of its) enCamino.set(i.skuId, (enCamino.get(i.skuId) ?? 0) + Math.max(i.cantidad - (i.recibida ?? 0), 0));
      else if (c.skuId && c.qtyTotal) enCamino.set(c.skuId, (enCamino.get(c.skuId) ?? 0) + c.qtyTotal);
    }
    if (c.via) {
      for (const sku of its.length ? its.map((i) => i.skuId) : c.skuId ? [c.skuId] : []) {
        const prev = ultimaVia.get(sku);
        if (!prev || c.creada > prev.fecha) ultimaVia.set(sku, { fecha: c.creada, via: c.via });
      }
      if (c.fechaEnvio && c.fechaLlegada) historial.push({ clave: paisClave, via: c.via, dias: diasEntreFechas(c.fechaEnvio, c.fechaLlegada) });
    }
    const inicio = c.fechaPago1 ?? c.creada;
    if (inicio && c.fechaEnvio) {
      const d = diasEntreFechas(inicio, c.fechaEnvio);
      if (d >= 0 && d <= 180) produccion.push(d);
    }
  }
  const tiempos = tiemposDeTransito(historial);
  const diasProduccion = produccion.length >= MIN_MUESTRA ? mediana(produccion) : PRODUCCION_PREDETERMINADA;
  const transitoDe = (via: string) => {
    const t = tiempos.get(`${paisClave}|${via}`);
    return t && t.muestra >= MIN_MUESTRA ? t.dias : (DIAS_POR_DEFECTO[via] ?? DIAS_POR_DEFECTO.mar);
  };
  return {
    enCamino,
    plazo: (skuId) => {
      const via = ultimaVia.get(skuId)?.via ?? "mar";
      const transito = transitoDe(via in DIAS_POR_DEFECTO ? via : "mar");
      return { dias: diasProduccion + transito, via, produccion: diasProduccion, transito };
    },
  };
}

