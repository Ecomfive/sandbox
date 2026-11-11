// Liquidación semanal de los repartidores (Deliverys). Lógica pura, sin Supabase: la usan las páginas, las acciones y el
// script de importación. Replica la hoja «GESTION DELIVERY II» de GESTION_DELIVERYS_<mes>.xlsx: cada entrega se paga
// según su categoría (compartida, cambio/retiro/complemento, entrega normal, fuera de ruta), un intento fallido se paga
// igual que una entrega, las propinas se suman tal cual y el cierre de la semana (de jueves a miércoles, como la hoja
// «CIERRE SEMANAL DELIVERY») es la suma por tienda. Prueba en `liquidacion.test.ts`.

export const ESTADOS = ["entregado", "fallido", "devuelto", "reprogramado"] as const;
export type EstadoEntrega = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Record<EstadoEntrega, string> = {
  entregado: "Entregado",
  fallido: "Fallido (se paga)",
  devuelto: "Devuelto",
  reprogramado: "Reprogramado",
};

export const CATEGORIAS = ["compartida", "cambio", "entrega", "fuera_ruta", "propina"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  compartida: "Entrega compartida",
  cambio: "Cambio, retiro o complemento",
  entrega: "Entrega",
  fuera_ruta: "Fuera de ruta",
  propina: "Propina",
};

/** Tarifas de la hoja (encabezados «COSTE DE ENVIO $…»). Se usan al cargar una entrega a mano si el repartidor no tiene otra. */
export const TARIFA_PREDETERMINADA: Record<Exclude<Categoria, "propina">, number> = {
  compartida: 1.83,
  cambio: 2,
  entrega: 3.65,
  fuera_ruta: 4,
};

export const METODOS_COBRO = ["efectivo", "yappy", "transferencia", "tarjeta", "prepagado"] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];

export const ETIQUETA_METODO: Record<MetodoCobro, string> = {
  efectivo: "Efectivo",
  yappy: "Yappy",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  prepagado: "Pagado en línea",
};

export const METODOS_PAGO = ["transferencia", "efectivo", "yappy"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

/** Tasa de entrega por debajo de la cual se marca (encabezado «TASA DE ENTREGA Objetivo 52 %» de la hoja). */
export const TASA_OBJETIVO = 0.52;

/** La semana del cierre empieza el jueves (ISO: lunes = 1 … domingo = 7) y termina el miércoles. */
export const DIA_INICIO_SEMANA = 4;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const redondear = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function aFecha(iso: string): Date {
  if (!FECHA.test(iso)) throw new Error(`Fecha inválida: ${iso}`);
  return new Date(`${iso}T00:00:00Z`);
}

export function sumarDias(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Jueves de la semana de cierre de una fecha (la misma regla que la columna generada `del_entregas.semana`). */
export function inicioSemana(iso: string): string {
  const dow = aFecha(iso).getUTCDay() || 7;
  return sumarDias(iso, -((dow - DIA_INICIO_SEMANA + 7) % 7));
}

export const finSemana = (inicio: string) => sumarDias(inicio, 6);

export const esInicioSemana = (iso: string) => FECHA.test(iso) && inicioSemana(iso) === iso;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «8 al 14 de octubre de 2026»; si cruza de mes, «29 de octubre al 4 de noviembre de 2026». */
export function textoSemana(inicio: string): string {
  const fin = finSemana(inicio);
  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = fin.split("-").map(Number);
  if (a1 !== a2) return `${d1} de ${MESES[m1 - 1]} de ${a1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
  if (m1 !== m2) return `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
  return `${d1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
}

/** «08/10 – 14/10» para las listas. */
export function textoSemanaCorto(inicio: string): string {
  const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return `${f(inicio)} – ${f(finSemana(inicio))}`;
}

// ---------------------------------------------------------------------------------------------
// Liquidación
// ---------------------------------------------------------------------------------------------

export interface LineaLiquidacion {
  estado: EstadoEntrega;
  /** Sin categoría: no se paga (una devolución que no cuenta como intento). */
  categoria: Categoria | null;
  cantidad: number;
  /** Tarifa por unidad (la propina: su monto, con cantidad 1). */
  tarifa: number;
  /** Nombre de la tienda (`fin_unidades.nombre`). */
  tienda: string;
  /** La tienda paga sus envíos aparte (Clicksi): no entra al recibo ni al libro de la empresa. */
  pagoAparte: boolean;
  /** Lo que el repartidor cobró al cliente contra entrega, y cómo. */
  cobrado?: number | null;
  metodo?: MetodoCobro | null;
}

export interface Ajustes {
  adelantos: number;
  descuentos: number;
}

export interface TotalTienda {
  tienda: string;
  pagoAparte: boolean;
  entregas: number;
  fallidas: number;
  devueltas: number;
  tarifas: number;
  propinas: number;
  /** tarifas + propinas: la fila «Pagar por envíos <tienda>» de la hoja. */
  total: number;
}

export interface Liquidacion {
  enRuta: number;
  entregas: number;
  fallidas: number;
  devueltas: number;
  reprogramadas: number;
  /** Entregadas ÷ en ruta (la columna «TASA DE ENTREGA»), o null sin pedidos. */
  tasaEntrega: number | null;
  /** Tarifas de las tiendas de la empresa (sin propinas). */
  tarifas: number;
  propinas: number;
  /** Lo de las tiendas que pagan aparte (tarifas y propinas): se muestra, pero no entra al neto. */
  aparte: number;
  cobradoEfectivo: number;
  cobradoOtros: number;
  adelantos: number;
  descuentos: number;
  /** tarifas + propinas de la empresa: el «TOTAL A PAGAR» del recibo de la hoja. */
  aPagar: number;
  /** aPagar − adelantos − descuentos − efectivo cobrado. Positivo: se le paga; negativo: el repartidor entrega la diferencia. */
  neto: number;
  porTienda: TotalTienda[];
}

export const montoLinea = (l: Pick<LineaLiquidacion, "cantidad" | "tarifa" | "categoria">) =>
  l.categoria === null ? 0 : redondear(l.cantidad * l.tarifa);

/** El cierre de un repartidor en una semana a partir de sus líneas. */
export function liquidar(lineas: LineaLiquidacion[], ajustes: Ajustes = { adelantos: 0, descuentos: 0 }): Liquidacion {
  const tiendas = new Map<string, TotalTienda>();
  let enRuta = 0;
  let entregas = 0;
  let fallidas = 0;
  let devueltas = 0;
  let reprogramadas = 0;
  let tarifas = 0;
  let propinas = 0;
  let aparte = 0;
  let cobradoEfectivo = 0;
  let cobradoOtros = 0;
  for (const l of lineas) {
    const t =
      tiendas.get(l.tienda) ??
      tiendas.set(l.tienda, { tienda: l.tienda, pagoAparte: l.pagoAparte, entregas: 0, fallidas: 0, devueltas: 0, tarifas: 0, propinas: 0, total: 0 }).get(l.tienda)!;
    const monto = montoLinea(l);
    if (l.categoria === "propina") {
      t.propinas += monto;
      if (l.pagoAparte) aparte += monto;
      else propinas += monto;
    } else {
      enRuta += l.cantidad;
      if (l.estado === "entregado") {
        entregas += l.cantidad;
        t.entregas += l.cantidad;
      } else if (l.estado === "fallido") {
        fallidas += l.cantidad;
        t.fallidas += l.cantidad;
      } else if (l.estado === "devuelto") {
        devueltas += l.cantidad;
        t.devueltas += l.cantidad;
      } else reprogramadas += l.cantidad;
      t.tarifas += monto;
      if (l.pagoAparte) aparte += monto;
      else tarifas += monto;
    }
    const cobrado = l.cobrado ?? 0;
    if (cobrado) {
      if (l.metodo === "efectivo") cobradoEfectivo += cobrado;
      else cobradoOtros += cobrado;
    }
  }
  const porTienda = [...tiendas.values()]
    .map((t) => ({ ...t, tarifas: redondear(t.tarifas), propinas: redondear(t.propinas), total: redondear(t.tarifas + t.propinas) }))
    .sort((a, b) => Number(a.pagoAparte) - Number(b.pagoAparte) || b.total - a.total || a.tienda.localeCompare(b.tienda));
  return {
    ...cierreDeTotales({ enRuta, entregas, fallidas, devueltas, reprogramadas, tarifas, propinas, aparte, cobradoEfectivo }, ajustes),
    cobradoOtros: redondear(cobradoOtros),
    porTienda,
  };
}

/** Los totales de una semana como los suma la vista `del_semanas` (sin el detalle por tienda). */
export interface TotalesSemana {
  enRuta: number;
  entregas: number;
  fallidas: number;
  devueltas: number;
  reprogramadas: number;
  tarifas: number;
  propinas: number;
  aparte: number;
  cobradoEfectivo: number;
}

/**
 * La fórmula del cierre: a pagar = tarifas + propinas de las tiendas de la empresa (lo que suma el recibo de la hoja);
 * neto = a pagar − adelantos − descuentos − efectivo cobrado contra entrega. Es la misma para una semana leída de la
 * vista y para una calculada línea por línea (`liquidar`).
 */
export function cierreDeTotales(t: TotalesSemana, ajustes: Ajustes = { adelantos: 0, descuentos: 0 }): Omit<Liquidacion, "porTienda" | "cobradoOtros"> {
  const tarifas = redondear(t.tarifas);
  const propinas = redondear(t.propinas);
  const aPagar = redondear(tarifas + propinas);
  const adelantos = redondear(Math.max(0, ajustes.adelantos || 0));
  const descuentos = redondear(Math.max(0, ajustes.descuentos || 0));
  const cobradoEfectivo = redondear(t.cobradoEfectivo);
  return {
    enRuta: t.enRuta,
    entregas: t.entregas,
    fallidas: t.fallidas,
    devueltas: t.devueltas,
    reprogramadas: t.reprogramadas,
    tasaEntrega: t.enRuta ? t.entregas / t.enRuta : null,
    tarifas,
    propinas,
    aparte: redondear(t.aparte),
    cobradoEfectivo,
    adelantos,
    descuentos,
    aPagar,
    neto: redondear(aPagar - adelantos - descuentos - cobradoEfectivo),
  };
}

/** Qué hay que hacer con el neto de un cierre. */
export function sentidoNeto(neto: number): "pagar" | "rendir" | "cero" {
  if (neto > 0.004) return "pagar";
  if (neto < -0.004) return "rendir";
  return "cero";
}

/** La tarifa de una categoría para un repartidor: la suya si la tiene, si no la de la hoja. */
export function tarifaDe(categoria: Exclude<Categoria, "propina">, propias: Partial<Record<string, number>> | null | undefined): number {
  const v = propias?.[categoria];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : TARIFA_PREDETERMINADA[categoria];
}

/** Lee las tarifas propias de un repartidor (jsonb): solo categorías conocidas y montos razonables. */
export function validarTarifas(v: unknown): Partial<Record<Exclude<Categoria, "propina">, number>> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r: Partial<Record<Exclude<Categoria, "propina">, number>> = {};
  for (const k of Object.keys(TARIFA_PREDETERMINADA) as Exclude<Categoria, "propina">[]) {
    const n = (v as Record<string, unknown>)[k];
    if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100) r[k] = redondear(n);
  }
  return Object.keys(r).length ? r : null;
}

// ---------------------------------------------------------------------------------------------
// Libro de movimientos
// ---------------------------------------------------------------------------------------------

/**
 * Lo pagado (el neto) repartido entre las tiendas de la empresa en proporción a lo que suma cada una, como lo carga
 * Majo en el libro (una línea por tienda con lo que se transfirió). El centavo que sobra del redondeo va a la mayor.
 */
export function repartirEnTiendas(porTienda: Pick<TotalTienda, "tienda" | "pagoAparte" | "total">[], neto: number): { tienda: string; monto: number }[] {
  const propias = porTienda.filter((t) => !t.pagoAparte && t.total > 0);
  const base = propias.reduce((a, t) => a + t.total, 0);
  if (neto <= 0 || base <= 0) return [];
  const r = propias.map((t) => ({ tienda: t.tienda, monto: redondear((neto * t.total) / base) }));
  const resto = redondear(neto - r.reduce((a, x) => a + x.monto, 0));
  if (resto !== 0) {
    const mayor = r.reduce((m, x) => (x.monto > m.monto ? x : m), r[0]);
    mayor.monto = redondear(mayor.monto + resto);
  }
  return r.filter((x) => x.monto > 0);
}

/** «TRANSPORTE 8/10 AL 14/10 - <NOMBRE>», la misma descripción que usa el libro. */
export function descripcionLibro(semana: string, nombre: string): string {
  const f = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  return `TRANSPORTE ${f(semana)} AL ${f(finSemana(semana))} - ${nombre}`.slice(0, 500);
}
