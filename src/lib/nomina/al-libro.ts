// Nómina al libro (lógica pura; prueba en `al-libro.test.ts`). Con el interruptor «nomina_al_libro» de Estado de
// resultados › Ajustes (migración 0917), la nómina de un mes se pasa al libro de movimientos como sueldos: la planilla
// formal (neto) como SUELDOS y la externa (total USDT) como OTROS SUELDOS, un movimiento por tienda, tipo y mes de pago.
// Los sueldos que el libro trajo del Excel ese mes se reemplazan (salen del EERR y del flujo, pero quedan en el libro
// para poder devolverlos), salvo los que la nómina no cubre: pagos a la Caja de Seguro Social, liquidaciones, décimo y
// vacaciones. La escritura la hace la función SQL `fin_nomina_al_libro`, en una transacción.

import { mesCorto } from "../finanzas/eerr";
import type { TipoNomina } from "./excel";

export const ORIGEN_NOMINA = "nomina";

/** Una línea de nómina del mes, con su tienda ya resuelta (la de la línea o la de la persona; vacía = A DISTRIBUIR). */
export interface LineaAlLibro {
  tipo: TipoNomina;
  unidadId: string | null;
  neto: number;
  fechaPago: string | null;
}

/** Lo que se crea en `fin_movimientos` (lo que recibe `fin_nomina_al_libro`). */
export interface MovimientoNomina {
  origen_clave: string;
  unidad_id: string;
  tipo: TipoNomina;
  monto: number;
  fecha_pago: string | null;
  descripcion: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const mes = (fecha: string) => `${fecha.slice(0, 7)}-01`;
const indice = (p: string) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;

/** «2026-03» o «2026-03-01» → «2026-03-01»; cualquier otra cosa → null. */
export function leerPeriodo(v: unknown): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(String(v ?? "").trim());
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/**
 * El mes en que se pagó una línea, que es el que usa el flujo de caja. Una fecha de pago más de un mes antes o más de
 * dos meses después del período es un error de carga: se usa el período.
 */
export function mesDePago(periodo: string, fechaPago: string | null): string {
  if (!fechaPago || !/^\d{4}-\d{2}-\d{2}/.test(fechaPago)) return periodo;
  const d = indice(mes(fechaPago)) - indice(periodo);
  return d >= -1 && d <= 2 ? mes(fechaPago) : periodo;
}

export const claveNomina = (periodo: string, tipo: TipoNomina, unidadId: string, pago: string) =>
  `${ORIGEN_NOMINA}:${periodo.slice(0, 7)}:${tipo}:${unidadId}:${pago.slice(0, 7)}`;

const ETIQUETA_TIPO: Record<TipoNomina, string> = { formal: "Nómina formal (neto)", externa: "Nómina externa (USDT)" };

/**
 * Los movimientos de un mes: uno por tipo, tienda y mes de pago, con la fecha de pago más reciente de sus líneas. Sin
 * tienda va a la unidad de reparto (se reparte por envíos en el EERR, como el resto del libro). Lo que suma cero no se crea.
 */
export function movimientosDeNomina(periodo: string, lineas: LineaAlLibro[], unidadReparto: string): MovimientoNomina[] {
  const grupos = new Map<string, MovimientoNomina>();
  for (const l of lineas) {
    const unidad = l.unidadId ?? unidadReparto;
    const pago = mesDePago(periodo, l.fechaPago);
    const clave = claveNomina(periodo, l.tipo, unidad, pago);
    const g = grupos.get(clave) ?? {
      origen_clave: clave,
      unidad_id: unidad,
      tipo: l.tipo,
      monto: 0,
      fecha_pago: null,
      descripcion: `${ETIQUETA_TIPO[l.tipo]} · ${mesCorto(periodo)}${pago !== periodo ? ` · pagada en ${mesCorto(pago)}` : ""}`,
    };
    g.monto = r2(g.monto + l.neto);
    // Una fecha fuera de rango no se guarda: el flujo usa entonces el mes del período.
    const fecha = l.fechaPago && mes(l.fechaPago) === pago ? l.fechaPago.slice(0, 10) : null;
    if (fecha && (!g.fecha_pago || fecha > g.fecha_pago)) g.fecha_pago = fecha;
    grupos.set(clave, g);
  }
  return [...grupos.values()].filter((g) => g.monto !== 0).sort((a, b) => a.origen_clave.localeCompare(b.origen_clave));
}

/** Un sueldo del libro (SUELDOS u OTROS SUELDOS) del mes. */
export interface SueldoLibro {
  id: string;
  unidadId: string;
  /** formal = SUELDOS · externa = OTROS SUELDOS. */
  tipo: TipoNomina;
  monto: number;
  enEerr: boolean;
  origen: string;
  descripcion: string;
  reemplazadoPor: string | null;
}

/** Lo que la nómina no cubre y por eso no se reemplaza: la Caja de Seguro Social, liquidaciones, décimo, vacaciones. */
export const FUERA_DE_NOMINA = /\bCSS\b|SEGURO SOCIAL|CAJA DE SEGURO|LIQUIDACI|TERMINACION|DECIMO|XIII|VACACION|PRIMA DE ANTIG/;

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export interface SueldosDelMes {
  /** Del Excel (u otro origen) y en el EERR: se reemplazan al pasar la nómina. */
  reemplazar: SueldoLibro[];
  /** Ya reemplazados en una pasada anterior. */
  yaReemplazados: SueldoLibro[];
  /** En el EERR pero fuera de lo que cubre la nómina: se quedan. */
  quedan: SueldoLibro[];
  /** Los que ya vinieron de la nómina. */
  deNomina: SueldoLibro[];
}

export function clasificarSueldos(libro: SueldoLibro[]): SueldosDelMes {
  const out: SueldosDelMes = { reemplazar: [], yaReemplazados: [], quedan: [], deNomina: [] };
  for (const s of libro) {
    if (s.origen === ORIGEN_NOMINA) out.deNomina.push(s);
    else if (s.reemplazadoPor === ORIGEN_NOMINA) out.yaReemplazados.push(s);
    else if (!s.enEerr) continue;
    else if (FUERA_DE_NOMINA.test(normal(s.descripcion))) out.quedan.push(s);
    else out.reemplazar.push(s);
  }
  return out;
}

/** Una tienda del cuadro: lo del libro que la nómina reemplaza contra lo que se crearía. */
export interface FilaCuadro {
  unidadId: string;
  libroSueldos: number;
  nominaFormal: number;
  libroOtros: number;
  nominaExterna: number;
  /** Sueldos del libro que se quedan (CSS, liquidaciones…): no cambian. */
  seQuedan: number;
  /** Nómina − libro: cuánto cambia el gasto de sueldos de la tienda en el EERR. */
  diferencia: number;
}

/** El cuadro por tienda (sin repartir A DISTRIBUIR: es lo que se escribe en el libro). */
export function cuadroLibroNomina(sueldos: SueldosDelMes, movimientos: MovimientoNomina[]): FilaCuadro[] {
  const filas = new Map<string, FilaCuadro>();
  const fila = (u: string) => {
    const f = filas.get(u) ?? { unidadId: u, libroSueldos: 0, nominaFormal: 0, libroOtros: 0, nominaExterna: 0, seQuedan: 0, diferencia: 0 };
    filas.set(u, f);
    return f;
  };
  for (const s of [...sueldos.reemplazar, ...sueldos.yaReemplazados]) {
    const f = fila(s.unidadId);
    if (s.tipo === "formal") f.libroSueldos = r2(f.libroSueldos + s.monto);
    else f.libroOtros = r2(f.libroOtros + s.monto);
  }
  for (const s of sueldos.quedan) fila(s.unidadId).seQuedan = r2(fila(s.unidadId).seQuedan + s.monto);
  for (const m of movimientos) {
    const f = fila(m.unidad_id);
    if (m.tipo === "formal") f.nominaFormal = r2(f.nominaFormal + m.monto);
    else f.nominaExterna = r2(f.nominaExterna + m.monto);
  }
  return [...filas.values()]
    .map((f) => ({ ...f, diferencia: r2(f.nominaFormal + f.nominaExterna - f.libroSueldos - f.libroOtros) }))
    .sort((a, b) => b.nominaFormal + b.nominaExterna - (a.nominaFormal + a.nominaExterna));
}

export interface PlanAlLibro {
  periodo: string;
  movimientos: MovimientoNomina[];
  /** Ids de los sueldos del libro que esta pasada reemplaza (los ya reemplazados no se vuelven a tocar). */
  reemplazar: string[];
  cuadro: FilaCuadro[];
  /** Si el mes ya se pasó antes (hay movimientos de nómina o sueldos reemplazados). */
  yaPasado: boolean;
  totales: { libro: number; nomina: number; seQuedan: number; diferencia: number };
}

export function planNominaAlLibro(periodo: string, lineas: LineaAlLibro[], libro: SueldoLibro[], unidadReparto: string): PlanAlLibro {
  const movimientos = movimientosDeNomina(periodo, lineas, unidadReparto);
  const sueldos = clasificarSueldos(libro);
  const cuadro = cuadroLibroNomina(sueldos, movimientos);
  const sumar = (f: (x: FilaCuadro) => number) => r2(cuadro.reduce((a, x) => a + f(x), 0));
  return {
    periodo,
    movimientos,
    reemplazar: sueldos.reemplazar.map((s) => s.id),
    cuadro,
    yaPasado: sueldos.deNomina.length > 0 || sueldos.yaReemplazados.length > 0,
    totales: {
      libro: sumar((x) => x.libroSueldos + x.libroOtros),
      nomina: sumar((x) => x.nominaFormal + x.nominaExterna),
      seQuedan: sumar((x) => x.seQuedan),
      diferencia: sumar((x) => x.diferencia),
    },
  };
}

/**
 * Si una fila de `fin_cierres` (de otro módulo; puede no existir) dice que el mes está cerrado. Se lee sin conocer su
 * forma exacta: una fila del mes cuenta como cierre salvo que diga que se reabrió o que está abierta.
 */
export function estaCerrado(fila: Record<string, unknown> | null | undefined): boolean {
  if (!fila) return false;
  // `fin_cierres` (0127) guarda `estado`; un mes reabierto y vuelto a cerrar conserva su `reabierto_en`, así que
  // el estado manda sobre la fecha de reapertura.
  if (typeof fila.estado === "string") return fila.estado.trim().toLowerCase() === "cerrado";
  if (fila.reabierto_en) return false;
  if (typeof fila.cerrado === "boolean") return fila.cerrado;
  return true;
}
