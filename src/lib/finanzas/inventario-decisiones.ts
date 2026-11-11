// Decisiones de inventario desde el lado financiero (Rentabilidad › Inventario y Reorden, migración 0935). Lógica pura,
// sin Supabase: parte del resumen del inventario valorizado (`inventario-valorizado.ts`) y suma sobrestock, inventario
// muerto con su propuesta de liquidación, costo de mantener por producto, punto de reorden financiero y la merma del
// conteo físico para el libro. Prueba en `inventario-decisiones.test.ts`.

import { diasEntre, type ProductoInventario } from "./inventario-valorizado";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Ajustes (`fin_config`)
// ---------------------------------------------------------------------------------------------
export const CLAVE_SOBRESTOCK = "inventario_sobrestock_dias";
export const CLAVE_ALERTA_COSTO = "inventario_alerta_costo";
export const CLAVE_REORDEN = "inventario_reorden";

export const SOBRESTOCK_PREDETERMINADO = 120;
export const ALERTA_COSTO_PREDETERMINADA = 0.1;
export const REORDEN_PREDETERMINADO = { seguridad: 14, cobertura: 60 };

export interface AjustesInventario {
  sobrestockDias: number;
  alertaCosto: number;
  seguridadDias: number;
  coberturaDias: number;
}

const numeroDe = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Los ajustes de inventario de `fin_config` (jsonb), con los predeterminados si faltan o no tienen sentido. */
export function leerAjustesInventario(filas: { clave: string; valor: unknown }[]): AjustesInventario {
  const de = (c: string) => filas.find((f) => f.clave === c)?.valor;
  const sob = numeroDe(de(CLAVE_SOBRESTOCK));
  const alerta = numeroDe(de(CLAVE_ALERTA_COSTO));
  const reorden = (de(CLAVE_REORDEN) ?? {}) as Record<string, unknown>;
  const seg = numeroDe(reorden.seguridad);
  const cob = numeroDe(reorden.cobertura);
  return {
    sobrestockDias: sob !== null && sob >= 15 && sob <= 730 ? Math.round(sob) : SOBRESTOCK_PREDETERMINADO,
    alertaCosto: alerta !== null && alerta > 0 && alerta <= 1 ? alerta : ALERTA_COSTO_PREDETERMINADA,
    seguridadDias: seg !== null && seg >= 0 && seg <= 180 ? Math.round(seg) : REORDEN_PREDETERMINADO.seguridad,
    coberturaDias: cob !== null && cob >= 7 && cob <= 365 ? Math.round(cob) : REORDEN_PREDETERMINADO.cobertura,
  };
}

/** Qué ajuste se puede cambiar desde la página, su rango y cómo se guarda. */
export const AJUSTES_EDITABLES = {
  sobrestock: { min: 15, max: 730, etiqueta: "Días para sobrestock" },
  alertaCosto: { min: 1, max: 100, etiqueta: "Alza de costo que alerta (%)" },
  seguridad: { min: 0, max: 180, etiqueta: "Días de seguridad" },
  cobertura: { min: 7, max: 365, etiqueta: "Días de cobertura por compra" },
} as const;
export type AjusteEditable = keyof typeof AJUSTES_EDITABLES;
export const esAjusteEditable = (v: unknown): v is AjusteEditable => typeof v === "string" && v in AJUSTES_EDITABLES;

/** Valida un ajuste que llega del navegador: el número en su rango (o un error). */
export function validarAjuste(clave: AjusteEditable, crudo: unknown): { valor: number } | { error: string } {
  const n = typeof crudo === "number" ? crudo : typeof crudo === "string" ? Number(crudo.replace(",", ".")) : NaN;
  const r = AJUSTES_EDITABLES[clave];
  if (!Number.isFinite(n) || n < r.min || n > r.max) return { error: `${r.etiqueta}: de ${r.min} a ${r.max}.` };
  return { valor: clave === "alertaCosto" ? Math.round(n * 100) / 10_000 : Math.round(n) };
}

// ---------------------------------------------------------------------------------------------
// 65. Días de inventario y sobrestock
// ---------------------------------------------------------------------------------------------
export interface Sobrestock {
  skuId: string;
  codigo: string;
  producto: string;
  unidades: number;
  valor: number;
  dio: number | null;
  /** Lo que sobra por encima del umbral de días, al costo (sin ventas: todo). */
  exceso: number;
  unidadesExceso: number;
  sinVentas: boolean;
}

/**
 * Los productos con más días de inventario que el umbral. El exceso es la parte del inventario que tardaría más que el
 * umbral en venderse: valor × (DIO − umbral) ÷ DIO. Un producto con stock y sin ventas en la ventana está todo en exceso.
 * Los productos sin costo no se valorizan (exceso 0) pero se listan si sus días pasan el umbral.
 */
export function sobrestock(productos: ProductoInventario[], umbralDias: number): { filas: Sobrestock[]; exceso: number; productos: number } {
  const filas: Sobrestock[] = [];
  for (const p of productos) {
    if (p.unidades <= 0) continue;
    const sinVentas = p.vendidas <= 0;
    const dioUnidades = sinVentas ? null : Math.round(p.unidades / (p.vendidas / 90));
    const dio = p.dio ?? dioUnidades;
    if (!sinVentas && (dio === null || dio <= umbralDias)) continue;
    const parte = sinVentas || dio === null ? 1 : (dio - umbralDias) / dio;
    filas.push({
      skuId: p.skuId,
      codigo: p.codigo,
      producto: p.producto,
      unidades: p.unidades,
      valor: p.valor,
      dio,
      exceso: r2(p.valor * parte),
      unidadesExceso: Math.round(p.unidades * parte),
      sinVentas,
    });
  }
  filas.sort((a, b) => b.exceso - a.exceso || a.codigo.localeCompare(b.codigo));
  return { filas, exceso: r2(filas.reduce((a, f) => a + f.exceso, 0)), productos: filas.length };
}

// ---------------------------------------------------------------------------------------------
// 67. Costo de mantener por producto
// ---------------------------------------------------------------------------------------------
/** Capital inmovilizado × tasa anual: lo que cuesta al año y al mes tener ese inventario. */
export function costoMantener(valor: number, tasaAnual: number): { anual: number; mensual: number } {
  const anual = r2(Math.max(valor, 0) * tasaAnual);
  return { anual, mensual: r2(anual / 12) };
}

// ---------------------------------------------------------------------------------------------
// 66. Inventario muerto y liquidación
// ---------------------------------------------------------------------------------------------
export interface PrecioReferencia {
  precio: number;
  fuente: "ventas" | "lista";
}

/** Descuento sugerido por antigüedad (días sin venta), antes de topar en el que recupera el costo. */
export const ESCALA_DESCUENTO: { desde: number; descuento: number }[] = [
  { desde: 180, descuento: 0.5 },
  { desde: 90, descuento: 0.35 },
  { desde: 0, descuento: 0.2 },
];

export interface ProductoMuerto {
  skuId: string;
  codigo: string;
  producto: string;
  unidades: number;
  valor: number;
  costoUnitario: number | null;
  ultimaSalida: string | null;
  diasSinVenta: number | null;
  precio: number | null;
  fuentePrecio: "ventas" | "lista" | null;
  /** Descuento máximo que todavía recupera el costo: 1 − costo ÷ precio (0 si el precio no cubre el costo). */
  descuentoMaximo: number | null;
  descuentoSugerido: number | null;
  precioLiquidacion: number | null;
  /** Lo que entra si se vende todo al precio de liquidación (sin precio: al costo). */
  recuperacion: number;
  costoMantenerMensual: number;
}

/**
 * El inventario muerto: productos con stock que no vendieron nada en la ventana (60 o 90 días). Para cada uno, el
 * descuento sugerido sale de la escala por días sin venta, topado en el máximo que recupera al menos el costo; sin precio
 * de referencia, se propone liquidar al costo. Un precio que ya no cubre el costo deja descuento 0 (vender a ese precio).
 */
export function inventarioMuerto(
  productos: ProductoInventario[],
  vendidasVentana: Map<string, number>,
  precios: Map<string, PrecioReferencia>,
  hoy: string,
  tasaAnual: number,
): { filas: ProductoMuerto[]; valor: number; recuperacion: number; productos: number } {
  const filas: ProductoMuerto[] = [];
  for (const p of productos) {
    if (p.unidades <= 0 || (vendidasVentana.get(p.skuId) ?? 0) > 0) continue;
    const diasSinVenta = p.ultimaSalida ? diasEntre(p.ultimaSalida, hoy) : null;
    const ref = precios.get(p.skuId) ?? null;
    const costo = p.costoUnitario;
    let descuentoMaximo: number | null = null;
    let descuentoSugerido: number | null = null;
    let precioLiquidacion: number | null = null;
    if (ref && ref.precio > 0) {
      descuentoMaximo = costo === null ? null : Math.max(0, Math.floor((1 - costo / ref.precio) * 100 + 1e-9) / 100);
      const escala = ESCALA_DESCUENTO.find((e) => (diasSinVenta ?? 9999) >= e.desde)!.descuento;
      descuentoSugerido = descuentoMaximo === null ? escala : Math.min(escala, descuentoMaximo);
      precioLiquidacion = r2(ref.precio * (1 - descuentoSugerido));
    } else if (costo !== null) {
      precioLiquidacion = r2(costo);
    }
    filas.push({
      skuId: p.skuId,
      codigo: p.codigo,
      producto: p.producto,
      unidades: p.unidades,
      valor: p.valor,
      costoUnitario: costo,
      ultimaSalida: p.ultimaSalida,
      diasSinVenta,
      precio: ref?.precio ?? null,
      fuentePrecio: ref?.fuente ?? null,
      descuentoMaximo,
      descuentoSugerido,
      precioLiquidacion,
      recuperacion: r2((precioLiquidacion ?? 0) * p.unidades),
      costoMantenerMensual: costoMantener(p.valor, tasaAnual).mensual,
    });
  }
  filas.sort((a, b) => b.valor - a.valor || a.codigo.localeCompare(b.codigo));
  return {
    filas,
    valor: r2(filas.reduce((a, f) => a + f.valor, 0)),
    recuperacion: r2(filas.reduce((a, f) => a + f.recuperacion, 0)),
    productos: filas.length,
  };
}

// ---------------------------------------------------------------------------------------------
// 68. Punto de reorden financiero
// ---------------------------------------------------------------------------------------------
export interface EntradaReorden {
  skuId: string;
  codigo: string;
  producto: string;
  /** Stock físico (≥ 0) y lo que viene en compras abiertas. */
  stock: number;
  enCamino: number;
  /** Unidades vendidas en los últimos `diasVentana` días. */
  vendidas: number;
  costoUnitario: number | null;
  /** Días de producción + tránsito real de su vía. */
  plazoDias: number;
  via: string;
}

export interface Reorden extends EntradaReorden {
  ritmoDiario: number;
  puntoReorden: number;
  /** Días que faltan para llegar al punto de reorden (≤ 0: ya hay que comprar). */
  diasParaComprar: number;
  fechaCompra: string;
  cantidad: number;
  monto: number | null;
  /** Semana de la proyección en que cae la compra (null: fuera de las 13 semanas). */
  semana: number | null;
  /** Caja proyectada al final de esa semana después de esta compra y las anteriores; null fuera de la proyección. */
  cajaDespues: number | null;
  estado: "comprar_ya" | "pronto" | "cubierto";
  caja: "alcanza" | "no_alcanza" | "sin_proyeccion";
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lo que se lee de la proyección de caja: los lunes de las semanas y la caja final sin la reposición al ritmo. */
export interface CajaProyectada {
  semanas: string[];
  cajaFinal: number[];
  cajaMinima: number;
}

/** Días antes del punto de reorden en que un producto pasa a «pronto». */
export const DIAS_PRONTO = 14;

/**
 * El punto de reorden de cada producto con ventas: ritmo diario × (plazo + seguridad). Los días para comprar son lo que
 * tarda (stock + en camino − punto) en venderse a ese ritmo; la compra sugerida cubre `coberturaDias` de venta. Las
 * compras se ordenan por fecha y se restan una tras otra de la caja proyectada (sin la reposición al ritmo, que estas
 * compras reemplazan): «alcanza» si la caja de esa semana queda sobre la caja mínima.
 */
export function puntosDeReorden(
  entradas: EntradaReorden[],
  ajustes: Pick<AjustesInventario, "seguridadDias" | "coberturaDias">,
  hoy: string,
  caja: CajaProyectada | null,
  diasVentana = 90,
): Reorden[] {
  const base = entradas
    .filter((e) => e.vendidas > 0)
    .map((e) => {
      const ritmoDiario = e.vendidas / diasVentana;
      const puntoReorden = Math.ceil(ritmoDiario * (e.plazoDias + ajustes.seguridadDias));
      const disponible = Math.max(e.stock, 0) + Math.max(e.enCamino, 0);
      const diasParaComprar = Math.floor((disponible - puntoReorden) / ritmoDiario);
      const fechaCompra = sumarDias(hoy, Math.max(diasParaComprar, 0));
      const cantidad = Math.ceil(ritmoDiario * ajustes.coberturaDias);
      const monto = e.costoUnitario === null ? null : r2(cantidad * e.costoUnitario);
      return { ...e, ritmoDiario: Math.round(ritmoDiario * 100) / 100, puntoReorden, diasParaComprar, fechaCompra, cantidad, monto };
    })
    .sort((a, b) => a.diasParaComprar - b.diasParaComprar || a.codigo.localeCompare(b.codigo));
  const usado = caja ? caja.cajaFinal.map(() => 0) : [];
  return base.map((b) => {
    const estado: Reorden["estado"] = b.diasParaComprar <= 0 ? "comprar_ya" : b.diasParaComprar <= DIAS_PRONTO ? "pronto" : "cubierto";
    let semana: number | null = null;
    let cajaDespues: number | null = null;
    let estadoCaja: Reorden["caja"] = "sin_proyeccion";
    if (caja && caja.semanas.length) {
      const i = Math.floor(diasEntre(caja.semanas[0], b.fechaCompra) / 7);
      if (i >= 0 && i < caja.semanas.length) {
        semana = i;
        // La compra baja la caja de su semana y de todas las siguientes.
        if (b.monto) for (let k = i; k < usado.length; k++) usado[k] += b.monto;
        cajaDespues = r2(Math.min(...caja.cajaFinal.slice(i).map((v, k) => v - usado[i + k])));
        estadoCaja = cajaDespues >= caja.cajaMinima ? "alcanza" : "no_alcanza";
      }
    }
    return { ...b, semana, cajaDespues, estado, caja: estadoCaja };
  });
}

/**
 * La caja final de la proyección sin la reposición de mercancía al ritmo del libro (la línea `mercancia` acumulada): las
 * compras sugeridas por el punto de reorden la reemplazan, así no se cuenta dos veces.
 */
export function cajaSinReposicion(cajaFinal: number[], reposicion: number[][]): number[] {
  let acumulado = 0;
  return cajaFinal.map((v, i) => {
    for (const l of reposicion) acumulado += l[i] ?? 0;
    return r2(v + acumulado);
  });
}

// ---------------------------------------------------------------------------------------------
// 74. Merma y faltantes del conteo físico
// ---------------------------------------------------------------------------------------------
export interface FilaMerma {
  mes: string;
  skuId: string;
  codigo: string;
  producto: string;
  faltante: number;
  sobrante: number;
  valorFaltante: number;
  valorSobrante: number;
  sinCosto: boolean;
}

export interface MermaMes {
  mes: string;
  productos: number;
  faltante: number;
  sobrante: number;
  valorFaltante: number;
  valorSobrante: number;
  neto: number;
  sinCosto: number;
  /** Lo que ya está en el libro para ese mes (null: nada). */
  enLibro: number | null;
}

export type ModoMerma = "faltantes" | "neto";
export const esModoMerma = (v: unknown): v is ModoMerma => v === "faltantes" || v === "neto";

/** Lo que se lleva al libro: solo los faltantes, o faltantes menos sobrantes (un neto negativo resta costo). */
export const montoMerma = (m: Pick<MermaMes, "valorFaltante" | "valorSobrante">, modo: ModoMerma) =>
  r2(modo === "neto" ? m.valorFaltante - m.valorSobrante : m.valorFaltante);

/** La huella del movimiento del libro de un mes (un solo movimiento por mes: volver a llevarlo lo actualiza). */
export const claveMerma = (mes: string) => `merma-inventario:${mes.slice(0, 7)}`;

/** Agrupa la merma por mes (el más reciente primero) y le pone lo que ya está en el libro. */
export function mermaPorMes(filas: FilaMerma[], enLibro: Map<string, number>): MermaMes[] {
  const meses = new Map<string, MermaMes>();
  for (const f of filas) {
    const m =
      meses.get(f.mes) ??
      meses.set(f.mes, { mes: f.mes, productos: 0, faltante: 0, sobrante: 0, valorFaltante: 0, valorSobrante: 0, neto: 0, sinCosto: 0, enLibro: enLibro.get(f.mes) ?? null }).get(f.mes)!;
    m.productos++;
    m.faltante += f.faltante;
    m.sobrante += f.sobrante;
    m.valorFaltante = r2(m.valorFaltante + f.valorFaltante);
    m.valorSobrante = r2(m.valorSobrante + f.valorSobrante);
    if (f.sinCosto) m.sinCosto++;
  }
  for (const m of meses.values()) m.neto = r2(m.valorFaltante - m.valorSobrante);
  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}
