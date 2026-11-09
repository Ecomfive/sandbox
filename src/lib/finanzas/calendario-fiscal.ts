// Portal AF4 360° › Cierre de mes › Calendario fiscal de Panamá (migración 0928). Lógica pura: cuándo vence cada
// obligación para cada período, en qué estado está (presentada, vencida, por vencer, pendiente) y qué avisos dejar. Un
// vencimiento que cae en fin de semana o feriado pasa al siguiente día hábil. Prueba en `calendario-fiscal.test.ts`.

import { siguienteDiaHabil, sumarDias } from "./dias-habiles";

export interface Obligacion {
  id: string;
  clave: string;
  nombre: string;
  entidad: string | null;
  periodicidad: "mensual" | "anual";
  dia: number;
  mes: number | null;
  anioSiguiente: boolean;
  diasAviso: number;
  activo: boolean;
}

export interface Presentacion {
  obligacionId: string;
  periodo: string;
  presentadoEn: string;
  referencia: string | null;
  monto: number | null;
}

export type EstadoObligacion = "presentada" | "vencida" | "por_vencer" | "pendiente";

export const ETIQUETA_ESTADO_OBLIGACION: Record<EstadoObligacion, string> = {
  presentada: "Presentada",
  vencida: "Vencida",
  por_vencer: "Por vencer",
  pendiente: "Pendiente",
};

export interface FilaCalendario {
  obligacion: Obligacion;
  /** Mes declarado («AAAA-MM-01») o año («AAAA-01-01»). */
  periodo: string;
  vence: string;
  estado: EstadoObligacion;
  /** Días calendario hasta el vencimiento (negativo si ya pasó). */
  dias: number;
  presentacion: Presentacion | null;
}

const fechaDe = (anio: number, mes: number, dia: number) => {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
};

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** El vencimiento de una obligación para un período (mensual: el mes siguiente; anual: según `anioSiguiente`). */
export function vencimiento(o: Pick<Obligacion, "periodicidad" | "dia" | "mes" | "anioSiguiente">, periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  if (o.periodicidad === "mensual") {
    const m = Number(periodo.slice(5, 7));
    const [a2, m2] = m === 12 ? [anio + 1, 1] : [anio, m + 1];
    return siguienteDiaHabil(fechaDe(a2, m2, o.dia));
  }
  return siguienteDiaHabil(fechaDe(o.anioSiguiente ? anio + 1 : anio, o.mes ?? 12, o.dia));
}

/** El período «normalizado» de una obligación: el mes (mensual) o el 1 de enero del año (anual). */
export function periodoDe(o: Pick<Obligacion, "periodicidad">, periodo: string): string {
  return o.periodicidad === "anual" ? `${periodo.slice(0, 4)}-01-01` : `${periodo.slice(0, 7)}-01`;
}

export function estadoObligacion(vence: string, presentada: boolean, hoy: string, diasAviso: number): { estado: EstadoObligacion; dias: number } {
  const dias = diasEntre(hoy, vence);
  if (presentada) return { estado: "presentada", dias };
  if (dias < 0) return { estado: "vencida", dias };
  if (dias <= diasAviso) return { estado: "por_vencer", dias };
  return { estado: "pendiente", dias };
}

/**
 * Las filas del calendario con vencimiento entre `hoy − diasAtras` y `hoy + diasAdelante`, más todas las vencidas sin
 * presentar de los últimos 400 días. Ordenadas por vencimiento.
 */
export function filasCalendario(obligaciones: Obligacion[], presentaciones: Presentacion[], hoy: string, diasAtras = 62, diasAdelante = 100): FilaCalendario[] {
  const desde = sumarDias(hoy, -400);
  const hasta = sumarDias(hoy, diasAdelante);
  const visibleDesde = sumarDias(hoy, -diasAtras);
  const porClave = new Map(presentaciones.map((p) => [`${p.obligacionId}|${p.periodo}`, p]));
  const filas: FilaCalendario[] = [];
  const anioHoy = Number(hoy.slice(0, 4));
  for (const o of obligaciones.filter((x) => x.activo)) {
    const periodos: string[] = [];
    if (o.periodicidad === "mensual") {
      for (let i = -15; i <= 4; i++) {
        const t = anioHoy * 12 + Number(hoy.slice(5, 7)) - 1 + i;
        periodos.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`);
      }
    } else {
      for (let a = anioHoy - 2; a <= anioHoy + 1; a++) periodos.push(`${a}-01-01`);
    }
    for (const periodo of periodos) {
      const vence = vencimiento(o, periodo);
      if (vence < desde || vence > hasta) continue;
      const presentacion = porClave.get(`${o.id}|${periodo}`) ?? null;
      const e = estadoObligacion(vence, Boolean(presentacion), hoy, o.diasAviso);
      if (vence < visibleDesde && e.estado !== "vencida") continue;
      filas.push({ obligacion: o, periodo, vence, estado: e.estado, dias: e.dias, presentacion });
    }
  }
  return filas.sort((a, b) => a.vence.localeCompare(b.vence) || a.obligacion.nombre.localeCompare(b.obligacion.nombre));
}

/** El período legible: «septiembre de 2026» o «año 2026». */
export function nombrePeriodoFiscal(o: Pick<Obligacion, "periodicidad">, periodo: string): string {
  if (o.periodicidad === "anual") return `año ${periodo.slice(0, 4)}`;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${MESES[Number(periodo.slice(5, 7)) - 1]} de ${periodo.slice(0, 4)}`;
}

export interface AlertaFiscal {
  clave: string;
  severidad: "aviso" | "critica";
  mensaje: string;
}

/** Los avisos de hoy: una por obligación y período vencido o por vencer sin presentar. */
export function alertasFiscales(filas: FilaCalendario[]): AlertaFiscal[] {
  const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return filas
    .filter((f) => f.estado === "vencida" || f.estado === "por_vencer")
    .map((f) => ({
      clave: `fiscal:${f.obligacion.clave}:${f.periodo.slice(0, 7)}`,
      severidad: f.estado === "vencida" ? ("critica" as const) : ("aviso" as const),
      mensaje:
        f.estado === "vencida"
          ? `${f.obligacion.nombre} de ${nombrePeriodoFiscal(f.obligacion, f.periodo)} venció el ${corta(f.vence)} y no está marcada como presentada`
          : `${f.obligacion.nombre} de ${nombrePeriodoFiscal(f.obligacion, f.periodo)} vence el ${corta(f.vence)}`,
    }));
}

/** Valida los ajustes de una obligación que llegan del formulario. */
export function validarObligacion(d: Record<string, unknown>, periodicidad: "mensual" | "anual"): { error: string } | { dia: number; mes: number | null; dias_aviso: number; activo: boolean } {
  const n = (v: unknown) => (typeof v === "string" && /^\d{1,2}$/.test(v.trim()) ? Number(v) : typeof v === "number" ? v : NaN);
  const dia = n(d.dia);
  const avisos = n(d.dias_aviso);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: "El día debe estar entre 1 y 31." };
  if (!Number.isInteger(avisos) || avisos < 0 || avisos > 60) return { error: "Los días de aviso deben estar entre 0 y 60." };
  let mes: number | null = null;
  if (periodicidad === "anual") {
    mes = n(d.mes);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { error: "El mes debe estar entre 1 y 12." };
  }
  return { dia, mes, dias_aviso: avisos, activo: d.activo === true || d.activo === "on" || d.activo === "true" };
}
