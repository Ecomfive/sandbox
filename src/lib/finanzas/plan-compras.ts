// Plan de compras a China (Rentabilidad › Plan de compras, mejora 15, migración 0948). Lógica pura, sin Supabase. Extiende
// el Punto de reorden (`puntosDeReorden`, `armarReorden`): usa el mismo plazo por producto (producción + tránsito real de
// su vía), los mismos días de seguridad y de cobertura, y en vez de mirar solo la próxima compra arma el calendario de
// órdenes de los próximos N meses contra una **demanda proyectada** por mes. Cada orden lleva su pago (anticipo al pedir y
// saldo al envío o a la llegada) y el total por mes se puede llevar al presupuesto de compras, que es lo que entra a la
// Proyección de caja (sin contar dos veces lo ya comprometido). Prueba en `plan-compras.test.ts`.
//
// La demanda la arma hoy `demandaPorRitmo` (ritmo de 90 días con una tendencia simple). El único punto de enganche para
// cambiarla por el pronóstico del módulo Planificación es `cargarDemandaProyectada` (`demanda-plan.ts`).

import { compraAbierta, type CompraFin, type ItemCompra, type PlazoProducto } from "./compras-costos";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function sumarDiasPlan(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const mesDe = (f: string) => `${f.slice(0, 7)}-01`;

export function diasDelMesPlan(mes: string): number {
  const d = new Date(`${mes.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.getUTCDate();
}

/** Los `n` meses del plan («AAAA-MM-01»), empezando por el de hoy. */
export function mesesPlan(hoy: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Demanda proyectada (la interfaz que comparte con el pronóstico de Planificación)
// ---------------------------------------------------------------------------------------------
/**
 * Unidades por producto y mes. `meses` va del mes de hoy en adelante; el primer mes cuenta solo lo que falta desde hoy.
 * Cualquier fuente (ritmo de venta, pronóstico por tienda) se entrega con esta forma.
 */
export interface DemandaProyectada {
  meses: string[];
  /** skuId → unidades de cada mes (mismo largo que `meses`). */
  porProducto: Map<string, number[]>;
  fuente: "ritmo" | "pronostico";
  /** Cómo se armó, para mostrarlo junto al plan. */
  nota: string;
}

export interface VentasProducto {
  /** Unidades vendidas en los últimos 90 y 30 días. */
  v90: number;
  v30: number;
}

/** Tope de la tendencia mensual (±) y cuántos meses se aplica antes de quedar plana. */
export const TENDENCIA_MAXIMA = 0.15;
export const MESES_TENDENCIA = 3;
/** Ventas mínimas en 90 días para leer una tendencia (con menos, el ritmo se proyecta plano). */
export const MINIMO_TENDENCIA = 20;

/**
 * La tendencia mensual de un producto: el ritmo de los últimos 30 días contra el de 90 (sus centros están a un mes),
 * amortiguada a la mitad y con tope ±15 %. Con pocas ventas, 0.
 */
export function tendenciaMensual(v: VentasProducto): number {
  if (v.v90 < MINIMO_TENDENCIA) return 0;
  const r90 = v.v90 / 90;
  const r30 = v.v30 / 30;
  if (r90 <= 0) return 0;
  const g = (r30 / r90 - 1) / 2;
  return Math.max(-TENDENCIA_MAXIMA, Math.min(TENDENCIA_MAXIMA, Math.round(g * 10_000) / 10_000));
}

/**
 * La demanda por ritmo de venta con tendencia simple: el ritmo diario de 90 días (centrado mes y medio atrás) crece o cae
 * con su tendencia mensual hasta `MESES_TENDENCIA` meses y luego se mantiene. El primer mes cuenta los días que faltan.
 */
export function demandaPorRitmo(ventas: Map<string, VentasProducto>, meses: string[], hoy: string): DemandaProyectada {
  const porProducto = new Map<string, number[]>();
  for (const [sku, v] of ventas) {
    if (v.v90 <= 0) continue;
    const ritmo = v.v90 / 90;
    const g = tendenciaMensual(v);
    porProducto.set(
      sku,
      meses.map((mes, k) => {
        const diasMes = diasDelMesPlan(mes);
        const dias = k === 0 ? diasMes - Number(hoy.slice(8, 10)) + 1 : diasMes;
        const exponente = Math.min(k + 1.5, MESES_TENDENCIA + 1.5);
        return Math.round(ritmo * (1 + g) ** exponente * dias * 100) / 100;
      }),
    );
  }
  return {
    meses,
    porProducto,
    fuente: "ritmo",
    nota: `Ritmo de venta de 90 días con tendencia de los últimos 30 (tope ±${Math.round(TENDENCIA_MAXIMA * 100)} % por mes, ${MESES_TENDENCIA} meses)`,
  };
}

/** Lo que hace falta para pasar el pronóstico de pedidos por tienda a unidades por producto. */
export interface EntradaDemandaPronostico {
  /** unidadId → periodo (AAAA-MM-01) → pedidos pronosticados. Una tienda sin pronóstico no viene. */
  pedidos: Map<string, Map<string, number>>;
  /** Unidades entregadas de cada producto por tienda en la ventana (90 días). */
  mezcla: { unidadId: string; skuId: string; unidades: number }[];
  /** Pedidos no cancelados de cada tienda en la misma ventana. */
  pedidosVentana: Map<string, number>;
  /** Las ventas totales de cada producto (tiendas + Dropi), para lo que el pronóstico no cubre. */
  ventas: Map<string, VentasProducto>;
}

/**
 * La demanda desde el pronóstico de Planificación: cada tienda con pronóstico aporta pedidos del mes × (unidades del
 * producto ÷ pedidos de la tienda en 90 días). Lo que no sale de esas tiendas (Dropi, tiendas sin pronóstico) sigue por
 * ritmo de venta (`demandaPorRitmo` con la parte que queda). El primer mes cuenta solo los días que faltan; un mes más
 * allá del pronóstico repite su último mes. Sin ninguna tienda con pronóstico devuelve el ritmo (fuente «ritmo»).
 */
export function demandaPorPronostico(e: EntradaDemandaPronostico, meses: string[], hoy: string): DemandaProyectada {
  const factores = new Map<string, { unidadId: string; porPedido: number }[]>();
  const cubierto = new Map<string, number>();
  for (const m of e.mezcla) {
    const pedidos = e.pedidosVentana.get(m.unidadId) ?? 0;
    if (!e.pedidos.has(m.unidadId) || pedidos <= 0 || m.unidades <= 0) continue;
    const lista = factores.get(m.skuId) ?? [];
    lista.push({ unidadId: m.unidadId, porPedido: m.unidades / pedidos });
    factores.set(m.skuId, lista);
    cubierto.set(m.skuId, (cubierto.get(m.skuId) ?? 0) + m.unidades);
  }
  if (!factores.size) {
    const r = demandaPorRitmo(e.ventas, meses, hoy);
    return { ...r, nota: `${r.nota} · sin pronóstico de Planificación` };
  }
  const pedidosDelMes = (unidadId: string, mes: string): number => {
    const serie = e.pedidos.get(unidadId);
    if (!serie?.size) return 0;
    if (serie.has(mes)) return serie.get(mes) ?? 0;
    const claves = [...serie.keys()].sort();
    // Antes del primer mes pronosticado (el mes en curso cuando el último cierre es viejo): el primero.
    const previa = claves.filter((k) => k <= mes).pop() ?? claves[0];
    return serie.get(previa) ?? 0;
  };
  const resto = new Map<string, VentasProducto>();
  for (const [sku, v] of e.ventas) {
    const queda = Math.max(0, v.v90 - (cubierto.get(sku) ?? 0));
    if (queda > 0) resto.set(sku, { v90: queda, v30: v.v90 > 0 ? (v.v30 * queda) / v.v90 : 0 });
  }
  const porRitmo = demandaPorRitmo(resto, meses, hoy).porProducto;
  const porProducto = new Map<string, number[]>();
  const skus = new Set([...factores.keys(), ...porRitmo.keys()]);
  for (const sku of skus) {
    const f = factores.get(sku) ?? [];
    const ritmo = porRitmo.get(sku);
    porProducto.set(
      sku,
      meses.map((mes, k) => {
        const diasMes = diasDelMesPlan(mes);
        const parte = k === 0 ? (diasMes - Number(hoy.slice(8, 10)) + 1) / diasMes : 1;
        const pronostico = f.reduce((a, x) => a + pedidosDelMes(x.unidadId, mes) * x.porPedido, 0) * parte;
        return Math.round((pronostico + (ritmo?.[k] ?? 0)) * 100) / 100;
      }),
    );
  }
  const tiendas = new Set([...factores.values()].flat().map((x) => x.unidadId)).size;
  return {
    meses,
    porProducto,
    fuente: "pronostico",
    nota: `Pronóstico de pedidos de Planificación (${tiendas} ${tiendas === 1 ? "tienda" : "tiendas"}) × unidades por pedido de cada producto en 90 días · Dropi y tiendas sin pronóstico por ritmo de venta`,
  };
}

/** Unidades por día de cada día del plan (de hoy al último día del último mes), desde la demanda por mes. */
export function demandaDiaria(unidades: number[], meses: string[], hoy: string): number[] {
  const out: number[] = [];
  meses.forEach((mes, k) => {
    const diasMes = diasDelMesPlan(mes);
    const desde = k === 0 ? Number(hoy.slice(8, 10)) : 1;
    const dias = diasMes - desde + 1;
    const porDia = dias > 0 ? (unidades[k] ?? 0) / dias : 0;
    for (let d = 0; d < dias; d++) out.push(porDia);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lo que viene en compras abiertas, con su fecha de llegada estimada
// ---------------------------------------------------------------------------------------------
export interface Llegada {
  fecha: string;
  unidades: number;
  compra: string;
}

/** Días que se suponen para una compra ya atrasada (su fecha estimada pasó y no llegó). */
export const DIAS_ATRASO_SUPUESTO = 7;

/**
 * Lo pedido y no recibido de las compras abiertas (la misma regla que `armarReorden`: sin las de backlog y cotizar), con
 * su llegada estimada: la fecha de llegada de la compra; si no, el envío + el tránsito de su vía; si no, el primer pago (o
 * la creación) + el plazo completo. Si esa fecha ya pasó, se supone que llega en `DIAS_ATRASO_SUPUESTO` días.
 */
export function llegadasEnCamino(compras: CompraFin[], items: ItemCompra[], plazo: (skuId: string) => PlazoProducto, hoy: string): Map<string, Llegada[]> {
  const porCompra = new Map<string, ItemCompra[]>();
  for (const i of items) porCompra.set(i.compraId, [...(porCompra.get(i.compraId) ?? []), i]);
  const salida = new Map<string, Llegada[]>();
  for (const c of compras) {
    const llego = !!c.fechaLlegada && c.fechaLlegada <= hoy;
    if (!compraAbierta(c) || llego || c.etapa === "backlog" || c.etapa === "cotizar" || c.etapa === "enviado_cotizacion") continue;
    const its = porCompra.get(c.id) ?? [];
    const lineas = its.length
      ? its.map((i) => ({ sku: i.skuId, unidades: Math.max(i.cantidad - (i.recibida ?? 0), 0) }))
      : c.skuId && c.qtyTotal
        ? [{ sku: c.skuId, unidades: c.qtyTotal }]
        : [];
    for (const l of lineas) {
      if (l.unidades <= 0) continue;
      const p = plazo(l.sku);
      let fecha = c.fechaLlegada ?? (c.fechaEnvio ? sumarDiasPlan(c.fechaEnvio, p.transito) : sumarDiasPlan(c.fechaPago1 ?? c.creada ?? hoy, p.dias));
      if (!FECHA.test(fecha) || fecha < hoy) fecha = sumarDiasPlan(hoy, DIAS_ATRASO_SUPUESTO);
      salida.set(l.sku, [...(salida.get(l.sku) ?? []), { fecha, unidades: l.unidades, compra: c.codigo || c.nombre }]);
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Configuración (`fin_config.plan_compras`) y lote por producto (`fin_plan_compras_producto`)
// ---------------------------------------------------------------------------------------------
export const CLAVE_PLAN_COMPRAS = "plan_compras";

export type SaldoAl = "envio" | "llegada";

export interface ConfigPlan {
  /** Meses que cubre el plan. */
  meses: number;
  /** Anticipo al proveedor al pedir, en % del monto. */
  anticipoPct: number;
  /** El saldo se paga al envío (lo habitual con China) o a la llegada. */
  saldoAl: SaldoAl;
  /** Lote mínimo para los productos que no tienen el suyo (0 = sin mínimo). */
  loteMinimo: number;
}

export const CONFIG_PLAN_PREDETERMINADA: ConfigPlan = { meses: 6, anticipoPct: 30, saldoAl: "envio", loteMinimo: 0 };

export const LIMITES_PLAN = {
  meses: { min: 2, max: 12, etiqueta: "Meses del plan" },
  anticipoPct: { min: 0, max: 100, etiqueta: "Anticipo (%)" },
  loteMinimo: { min: 0, max: 1_000_000, etiqueta: "Lote mínimo (unidades)" },
} as const;

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function leerConfigPlan(v: unknown): ConfigPlan {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const d = CONFIG_PLAN_PREDETERMINADA;
  const en = (x: unknown, def: number, l: { min: number; max: number }) => {
    const n = numero(x);
    return n === null || n < l.min || n > l.max ? def : n;
  };
  return {
    meses: Math.round(en(o.meses, d.meses, LIMITES_PLAN.meses)),
    anticipoPct: en(o.anticipo_pct, d.anticipoPct, LIMITES_PLAN.anticipoPct),
    saldoAl: o.saldo_al === "llegada" ? "llegada" : "envio",
    loteMinimo: Math.round(en(o.lote_minimo, d.loteMinimo, LIMITES_PLAN.loteMinimo)),
  };
}

export const configPlanAGuardar = (c: ConfigPlan) => ({ meses: c.meses, anticipo_pct: c.anticipoPct, saldo_al: c.saldoAl, lote_minimo: c.loteMinimo });

/** Valida lo que manda el formulario de ajustes del plan. */
export function validarConfigPlan(leer: (campo: string) => unknown): { config: ConfigPlan } | { error: string } {
  const out: Partial<ConfigPlan> = {};
  for (const clave of ["meses", "anticipoPct", "loteMinimo"] as const) {
    const l = LIMITES_PLAN[clave];
    const n = numero(leer(clave));
    if (n === null || n < l.min || n > l.max) return { error: `${l.etiqueta}: de ${l.min} a ${l.max}.` };
    out[clave] = clave === "anticipoPct" ? Math.round(n * 100) / 100 : Math.round(n);
  }
  const saldo = leer("saldoAl");
  if (saldo !== "envio" && saldo !== "llegada") return { error: "Elige cuándo se paga el saldo." };
  return { config: { ...(out as ConfigPlan), saldoAl: saldo } };
}

export interface LoteProducto {
  /** Unidades mínimas por orden (0 = el general). */
  loteMinimo: number;
  /** La orden se redondea a múltiplos de esto (cajas); 1 = sin redondeo. */
  multiplo: number;
  /** Fuera del plan (descontinuado, se compra local). */
  excluir: boolean;
}

export function validarLoteProducto(v: unknown): LoteProducto | { error: string } {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const lote = numero(o.loteMinimo);
  const mult = numero(o.multiplo);
  if (lote === null || lote < 0 || lote > 1_000_000) return { error: "Lote mínimo: de 0 a 1.000.000 unidades." };
  if (mult === null || mult < 1 || mult > 100_000) return { error: "Múltiplo: de 1 a 100.000 unidades." };
  return { loteMinimo: Math.round(lote), multiplo: Math.round(mult), excluir: o.excluir === true };
}

/** La cantidad de una orden con el lote mínimo y el múltiplo (redondea hacia arriba). */
export function ajustarCantidad(necesaria: number, loteMinimo: number, multiplo: number): number {
  let q = Math.max(Math.ceil(necesaria), Math.max(loteMinimo, 0));
  const m = Math.max(Math.round(multiplo), 1);
  if (m > 1) q = Math.ceil(q / m) * m;
  return q;
}

// ---------------------------------------------------------------------------------------------
// El plan
// ---------------------------------------------------------------------------------------------
export interface EntradaPlan {
  skuId: string;
  codigo: string;
  producto: string;
  stock: number;
  costoUnitario: number | null;
  plazo: PlazoProducto;
  llegadas: Llegada[];
  lote: LoteProducto | null;
}

export interface OrdenPlan {
  clave: string;
  skuId: string;
  codigo: string;
  producto: string;
  via: string;
  fechaPedido: string;
  fechaEnvio: string;
  fechaLlegada: string;
  cantidad: number;
  /** Lo que hacía falta antes de aplicar el lote mínimo y el múltiplo. */
  necesaria: number;
  costoUnitario: number | null;
  monto: number | null;
  anticipo: number | null;
  fechaAnticipo: string;
  saldo: number | null;
  fechaSaldo: string;
  /** Debía pedirse antes de hoy: llega tarde y habrá días sin stock suficiente. */
  atrasada: boolean;
  /** Días que la orden llega después de cuando hacía falta (0 si a tiempo). */
  diasTarde: number;
}

export interface ResumenProductoPlan {
  skuId: string;
  codigo: string;
  producto: string;
  stock: number;
  enCamino: number;
  demanda: number;
  /** Primer día en que el stock (con lo que viene en camino, sin órdenes nuevas) no alcanza para la demanda. */
  quiebre: string | null;
  ordenes: number;
  unidades: number;
  monto: number | null;
  /** Stock al final del plan con las órdenes. */
  stockFinal: number;
}

export interface MesPlan {
  mes: string;
  ordenes: number;
  unidades: number;
  /** Monto de las órdenes que se piden en el mes. */
  pedido: number;
  anticipos: number;
  saldos: number;
  /** Lo que sale de caja ese mes por el plan (anticipos + saldos que caen en el mes). */
  pagos: number;
}

export interface ResultadoPlan {
  ordenes: OrdenPlan[];
  productos: ResumenProductoPlan[];
  meses: MesPlan[];
  /** Productos con demanda sin costo (sus órdenes van sin monto). */
  sinCosto: number;
  /** Pagos del plan después del último mes (saldos de órdenes que llegan más tarde). */
  pagosDespues: number;
}

/** Tope de órdenes por producto en el plan (evita un bucle con demanda absurda). */
export const MAX_ORDENES_PRODUCTO = 24;

/**
 * Arma el plan de cada producto con demanda. Simula el stock día a día (stock de hoy + llegadas − demanda, sin bajar de
 * cero): el primer día en que queda por debajo del stock de seguridad (ritmo del día × días de seguridad) hace falta una
 * orden que llegue ese día, pedida un plazo antes (si eso cae antes de hoy, se pide hoy y queda «atrasada»). La orden
 * cubre `coberturaDias` de demanda desde su llegada más lo que falte para volver a la seguridad, con el lote mínimo y el
 * múltiplo. Se repite hasta que el stock alcance en todo el plan.
 */
export function armarPlan(
  entradas: EntradaPlan[],
  demanda: DemandaProyectada,
  ajustes: { seguridadDias: number; coberturaDias: number },
  config: ConfigPlan,
  hoy: string,
): ResultadoPlan {
  const ordenes: OrdenPlan[] = [];
  const productos: ResumenProductoPlan[] = [];
  let sinCosto = 0;
  for (const e of entradas) {
    if (e.lote?.excluir) continue;
    const unidades = demanda.porProducto.get(e.skuId);
    if (!unidades || !unidades.some((u) => u > 0)) continue;
    const D = demandaDiaria(unidades, demanda.meses, hoy);
    const N = D.length;
    const llegadas = new Array<number>(N).fill(0);
    for (const l of e.llegadas) {
      const i = diasEntre(hoy, l.fecha);
      if (i >= 0 && i < N) llegadas[i] += l.unidades;
    }
    const seguridad = D.map((d) => d * ajustes.seguridadDias);
    const simular = () => {
      const s: number[] = [];
      let x = Math.max(e.stock, 0);
      for (let i = 0; i < N; i++) {
        x = Math.max(0, x + llegadas[i] - D[i]);
        s.push(x);
      }
      return s;
    };
    const sinOrdenes = simular();
    const iQuiebre = sinOrdenes.findIndex((x, i) => x <= 0 && D[i] > 0);
    const plazoDias = Math.max(Math.round(e.plazo.dias), 0);
    const loteMin = e.lote && e.lote.loteMinimo > 0 ? e.lote.loteMinimo : config.loteMinimo;
    const multiplo = e.lote?.multiplo ?? 1;
    if (e.costoUnitario === null) sinCosto++;
    const propias: OrdenPlan[] = [];
    // Lo que falta antes de la llegada de la última orden ya no lo arregla una orden nueva (llegaría igual o después).
    let desde = 0;
    for (let n = 0; n < MAX_ORDENES_PRODUCTO; n++) {
      const s = simular();
      let iFalta = -1;
      for (let i = desde; i < N; i++) {
        if (s[i] < seguridad[i] - 1e-9 || (s[i] <= 1e-9 && D[i] > 0)) {
          iFalta = i;
          break;
        }
      }
      if (iFalta < 0) break;
      const pedidoIdeal = iFalta - plazoDias;
      const iPedido = Math.max(pedidoIdeal, 0);
      const iLlega = iPedido + plazoDias;
      if (iLlega >= N) {
        // Llega después del plan: igual se pide (se necesita), pero no cambia la simulación del plan.
        if (iPedido < N) propias.push(orden(e, hoy, iPedido, iLlega, Math.ceil(D[N - 1] * ajustes.coberturaDias), loteMin, multiplo, config, pedidoIdeal < 0, iLlega - iFalta, propias.length));
        break;
      }
      const cubrir = D.slice(iLlega, iLlega + ajustes.coberturaDias).reduce((a, b) => a + b, 0);
      // Si el plan termina antes de la cobertura, el resto al ritmo del último día.
      const resto = Math.max(iLlega + ajustes.coberturaDias - N, 0) * D[N - 1];
      const antes = iLlega > 0 ? s[iLlega - 1] : Math.max(e.stock, 0);
      const necesaria = Math.max(cubrir + resto + seguridad[iLlega] - antes - llegadas[iLlega], 1);
      const o = orden(e, hoy, iPedido, iLlega, necesaria, loteMin, multiplo, config, pedidoIdeal < 0, iLlega - iFalta, propias.length);
      llegadas[iLlega] += o.cantidad;
      propias.push(o);
      desde = iLlega;
    }
    const final = simular();
    ordenes.push(...propias);
    const montos = propias.map((o) => o.monto);
    productos.push({
      skuId: e.skuId,
      codigo: e.codigo,
      producto: e.producto,
      stock: e.stock,
      enCamino: e.llegadas.reduce((a, l) => a + l.unidades, 0),
      demanda: Math.round(unidades.reduce((a, b) => a + b, 0)),
      quiebre: iQuiebre >= 0 ? sumarDiasPlan(hoy, iQuiebre) : null,
      ordenes: propias.length,
      unidades: propias.reduce((a, o) => a + o.cantidad, 0),
      monto: montos.some((m) => m === null) ? null : r2(montos.reduce<number>((a, m) => a + (m ?? 0), 0)),
      stockFinal: Math.round(final[N - 1] ?? 0),
    });
  }
  ordenes.sort((a, b) => a.fechaPedido.localeCompare(b.fechaPedido) || a.codigo.localeCompare(b.codigo));
  productos.sort((a, b) => (a.quiebre ?? "9999").localeCompare(b.quiebre ?? "9999") || a.codigo.localeCompare(b.codigo));
  const { meses, despues } = calendarioPagos(ordenes, demanda.meses);
  return { ordenes, productos, meses, sinCosto, pagosDespues: despues };
}

function orden(
  e: EntradaPlan,
  hoy: string,
  iPedido: number,
  iLlega: number,
  necesaria: number,
  loteMin: number,
  multiplo: number,
  config: ConfigPlan,
  atrasada: boolean,
  diasTarde: number,
  n: number,
): OrdenPlan {
  const cantidad = ajustarCantidad(necesaria, loteMin, multiplo);
  const fechaPedido = sumarDiasPlan(hoy, iPedido);
  const fechaEnvio = sumarDiasPlan(fechaPedido, Math.round(e.plazo.produccion));
  const fechaLlegada = sumarDiasPlan(hoy, iLlega);
  const monto = e.costoUnitario === null ? null : r2(cantidad * e.costoUnitario);
  const anticipo = monto === null ? null : r2((monto * config.anticipoPct) / 100);
  return {
    clave: `${e.skuId}:${n}`,
    skuId: e.skuId,
    codigo: e.codigo,
    producto: e.producto,
    via: e.plazo.via,
    fechaPedido,
    fechaEnvio,
    fechaLlegada,
    cantidad,
    necesaria: Math.ceil(necesaria),
    costoUnitario: e.costoUnitario,
    monto,
    anticipo,
    fechaAnticipo: fechaPedido,
    saldo: monto === null || anticipo === null ? null : r2(monto - anticipo),
    fechaSaldo: config.saldoAl === "envio" ? fechaEnvio : fechaLlegada,
    atrasada,
    diasTarde: Math.max(diasTarde, 0),
  };
}

/** El calendario por mes: órdenes y unidades por mes de pedido, anticipos y saldos por el mes en que se pagan. */
export function calendarioPagos(ordenes: OrdenPlan[], meses: string[]): { meses: MesPlan[]; despues: number } {
  const porMes = new Map(meses.map((m) => [m, { mes: m, ordenes: 0, unidades: 0, pedido: 0, anticipos: 0, saldos: 0, pagos: 0 } as MesPlan]));
  let despues = 0;
  const ultimo = meses[meses.length - 1] ?? "";
  for (const o of ordenes) {
    const mp = porMes.get(mesDe(o.fechaPedido));
    if (mp) {
      mp.ordenes++;
      mp.unidades += o.cantidad;
      mp.pedido = r2(mp.pedido + (o.monto ?? 0));
    }
    const ma = porMes.get(mesDe(o.fechaAnticipo));
    if (ma) ma.anticipos = r2(ma.anticipos + (o.anticipo ?? 0));
    const ms = porMes.get(mesDe(o.fechaSaldo));
    if (ms) ms.saldos = r2(ms.saldos + (o.saldo ?? 0));
    else if (mesDe(o.fechaSaldo) > ultimo) despues = r2(despues + (o.saldo ?? 0));
  }
  for (const m of porMes.values()) m.pagos = r2(m.anticipos + m.saldos);
  return { meses: [...porMes.values()], despues };
}

/**
 * Lo que se escribe en el presupuesto de compras para que la Proyección de caja reciba los pagos del plan sin contar dos
 * veces: presupuesto = lo ya comprometido del mes (saldos de compras abiertas y gastos de importación) + los pagos del
 * plan. La proyección resta lo comprometido y suma solo lo disponible, que queda igual a los pagos del plan.
 */
export function presupuestoDesdePlan(meses: MesPlan[], comprometido: Map<string, number>): { mes: string; monto: number }[] {
  return meses.map((m) => ({ mes: m.mes, monto: r2((comprometido.get(m.mes) ?? 0) + m.pagos) }));
}
