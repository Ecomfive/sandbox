// Portal AF4 360° › Cierre de mes. Lógica pura (sin Supabase): el checklist automático, cómo se combina con lo que una
// persona marca a mano, cuándo se puede cerrar, la fotografía al cerrar y qué filas de una importación caen en un mes
// cerrado. La migración 0914 bloquea en la base los meses cerrados; aquí vive la misma regla para saltar esas filas antes
// de mandarlas. Prueba en `cierre.test.ts`.

import { dinero } from "@/lib/af4/formato";
import { armarEerr, sobre, type FilaEerr } from "./eerr";
import { evaluarCuadre, evaluarDevengos, evaluarProvisiones, evaluarVariaciones, type CuadreGuardado } from "./cierre-control";

// ---------------------------------------------------------------------------------------------
// Estados del cierre
// ---------------------------------------------------------------------------------------------
export type EstadoCierre = "abierto" | "en_revision" | "cerrado";

export const ETIQUETA_ESTADO_CIERRE: Record<EstadoCierre, string> = {
  abierto: "Abierto",
  en_revision: "En revisión",
  cerrado: "Cerrado",
};

export const esEstadoCierre = (v: unknown): v is EstadoCierre => v === "abierto" || v === "en_revision" || v === "cerrado";

/** Los pasos permitidos. Cerrado → abierto es «reabrir» (exige poder modificar Usuarios y roles y un motivo). */
const TRANSICIONES: Record<EstadoCierre, EstadoCierre[]> = {
  abierto: ["en_revision"],
  en_revision: ["abierto", "cerrado"],
  cerrado: ["abierto"],
};

export function transicionValida(de: EstadoCierre, a: EstadoCierre): boolean {
  return TRANSICIONES[de].includes(a);
}

// ---------------------------------------------------------------------------------------------
// Meses
// ---------------------------------------------------------------------------------------------
const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;

/** «AAAA-MM-01» válido, o null. */
export function leerPeriodo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.length === 7 ? `${v}-01` : v;
  return MES.test(s) ? s : null;
}

/** El mes («AAAA-MM-01») de una fecha «AAAA-MM-DD», o null. */
export function mesDe(fecha: string | null | undefined): string | null {
  return fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha) ? `${fecha.slice(0, 7)}-01` : null;
}

/** «julio de 2026». */
export function nombreMes(periodo: string): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${MESES[Number(periodo.slice(5, 7)) - 1]} de ${periodo.slice(0, 4)}`;
}

/** El mes anterior y el último día de un mes. */
export function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
}

export function finDeMes(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${periodo.slice(0, 7)}-${String(dias).padStart(2, "0")}`;
}

/** Los meses de `desde` a `hasta` (los dos incluidos). */
export function rangoMeses(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  for (let m = desde; m <= hasta && meses.length < 600; ) {
    meses.push(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01-01` : `${a}-${String(mm + 1).padStart(2, "0")}-01`;
  }
  return meses;
}

/** Los jueves (inicio de la semana de deliverys, de jueves a miércoles) que caen dentro del mes. */
export function juevesDelMes(periodo: string): string[] {
  const [a, m] = periodo.split("-").map(Number);
  const jueves: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1) break;
    if (f.getUTCDay() === 4) jueves.push(f.toISOString().slice(0, 10));
  }
  return jueves;
}

// ---------------------------------------------------------------------------------------------
// Bloqueo (la misma regla que el disparador de la migración 0914)
// ---------------------------------------------------------------------------------------------
/** Los meses que toca un movimiento: el del libro (EERR) y el de pago (flujo; si no tiene, el del libro). */
export function mesesDeMovimiento(m: { periodo: string; fecha_pago?: string | null }): string[] {
  return [m.periodo, mesDe(m.fecha_pago) ?? m.periodo];
}

/** Separa las filas que caen en un mes cerrado (no se pueden guardar) de las demás. */
export function separarPorCierre<T>(filas: T[], cerrados: Set<string>, meses: (f: T) => string[]): { abiertas: T[]; enCerrado: T[] } {
  const abiertas: T[] = [];
  const enCerrado: T[] = [];
  for (const f of filas) (cerrados.size && meses(f).some((m) => cerrados.has(m)) ? enCerrado : abiertas).push(f);
  return { abiertas, enCerrado };
}

/** El error que devuelve la base al tocar un mes cerrado (código propio de la migración 0914). */
export const CODIGO_MES_CERRADO = "FC001";

// ---------------------------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------------------------
export type ResultadoAuto = "ok" | "revisar" | "falta" | "no_disponible";
export type EstadoTarea = "pendiente" | "hecho" | "no_aplica";
export type ColorTarea = "verde" | "ambar" | "rojo";

export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea, string> = { pendiente: "Pendiente", hecho: "Hecho", no_aplica: "No aplica" };
export const esEstadoTarea = (v: unknown): v is EstadoTarea => v === "pendiente" || v === "hecho" || v === "no_aplica";

/** Costo de ventas sobre ingresos esperado (en %): fuera de este rango la tarea pide revisar. */
export const COSTO_VENTAS_MIN = 15;
export const COSTO_VENTAS_MAX = 60;
/** Cuadre de ventas entregadas contra ingresos del libro: lo que sea mayor de un dólar o el 1 % de los ingresos. */
export const TOLERANCIA_CUADRE_USD = 1;
export const TOLERANCIA_CUADRE_PCT = 1;
/** Nómina contra el libro (libro − nómina), en dólares. */
export const TOLERANCIA_NOMINA = 1;

export interface DefTarea {
  clave: string;
  titulo: string;
  /** El módulo donde se resuelve (para el enlace). */
  modulo: string;
  href: (periodo: string) => string;
  /** La migración que crea los datos que mira (para decir qué falta si no está). */
  migracion: string;
}

export const TAREAS: DefTarea[] = [
  { clave: "sin-tipo", titulo: "Movimientos sin tipo", modulo: "libro-movimientos", href: () => "/libro-movimientos/pendientes", migracion: "0901" },
  { clave: "sin-tienda", titulo: "Movimientos sin tienda", modulo: "libro-movimientos", href: () => "/libro-movimientos/pendientes", migracion: "0901" },
  { clave: "base-reparto", titulo: "Base de reparto del mes", modulo: "ventas-tiendas", href: () => "/ventas-tiendas/cuadre", migracion: "0901" },
  { clave: "ventas", titulo: "Ventas por tienda importadas", modulo: "ventas-tiendas", href: () => "/ventas-tiendas/importar", migracion: "0909" },
  { clave: "cuadre-ventas", titulo: "Ventas entregadas contra ingresos del libro", modulo: "ventas-tiendas", href: () => "/ventas-tiendas/cuadre", migracion: "0909" },
  { clave: "conciliacion", titulo: "Conciliación bancaria del mes", modulo: "conciliacion-bancaria", href: () => "/conciliacion-bancaria", migracion: "0910" },
  { clave: "nomina", titulo: "Nómina del mes importada", modulo: "nomina", href: () => "/nomina/importar", migracion: "0906" },
  { clave: "nomina-libro", titulo: "Nómina conciliada con el libro", modulo: "nomina", href: (p) => `/nomina/conciliacion?mes=${p}`, migracion: "0906" },
  { clave: "deliverys", titulo: "Cierres de deliverys pagados", modulo: "deliverys", href: () => "/deliverys/cierres", migracion: "0911" },
  { clave: "costo-ventas", titulo: "Costo de ventas cargado", modulo: "estado-resultados", href: () => "/estado-resultados", migracion: "0901" },
  { clave: "saldos", titulo: "Saldos iniciales de las cuentas con movimiento", modulo: "flujo-caja", href: () => "/flujo-caja/saldos", migracion: "0904" },
  // Cierre y control (migración 0927).
  { clave: "devengos", titulo: "Devengo de gastos prepagados", modulo: "cierre-mes", href: (p) => `/cierre-mes/ajustes?periodo=${p.slice(0, 7)}`, migracion: "0927" },
  { clave: "provisiones", titulo: "Provisiones laborales de la planilla", modulo: "cierre-mes", href: (p) => `/cierre-mes/ajustes?periodo=${p.slice(0, 7)}`, migracion: "0927" },
  { clave: "cuadre-inventario", titulo: "Inventario contable contra el WMS", modulo: "cierre-mes", href: (p) => `/cierre-mes/${p.slice(0, 7)}#cuadres`, migracion: "0927" },
  { clave: "cuadre-dropi", titulo: "Cartera por cobrar contra Dropi", modulo: "cierre-mes", href: (p) => `/cierre-mes/${p.slice(0, 7)}#cuadres`, migracion: "0927" },
  { clave: "variaciones", titulo: "Variaciones contra el mes anterior explicadas", modulo: "cierre-mes", href: (p) => `/cierre-mes/${p.slice(0, 7)}#variaciones`, migracion: "0927" },
  // QuickBooks Online (migración 0950): solo aparece con QuickBooks conectado o con algo leído.
  { clave: "quickbooks", titulo: "Ventas conciliadas con QuickBooks (< 1 %)", modulo: "cierre-mes", href: (p) => `/cierre-mes/quickbooks?mes=${p.slice(0, 7)}`, migracion: "0950" },
];

/** Tareas que solo existen si su fuente está conectada (`DatosMes[campo]` distinto de `undefined`). */
const TAREAS_OPCIONALES: Record<string, keyof DatosMes> = { quickbooks: "quickbooks" };

/**
 * Tareas que no se marcan a mano: se resuelven solo con los datos (las variaciones, escribiendo la explicación de cada
 * línea). Sin ellas no se cierra el mes aunque una persona quiera darlas por hechas.
 */
export const TAREAS_SIN_MARCA = new Set(["variaciones"]);

export const CLAVES_TAREAS = new Set(TAREAS.map((t) => t.clave));

/**
 * Lo que el checklist necesita saber de un mes. Cada campo es `null` cuando su fuente no se pudo leer (migración sin
 * correr): la tarea queda «no disponible» y no rompe las demás.
 */
export interface DatosMes {
  sinTipo: number | null;
  sinTienda: number | null;
  /** Monto cargado a A DISTRIBUIR sin base de envíos y envíos de la base del mes. */
  reparto: { sinRepartir: number; envios: number } | null;
  ventas: { ordenes: number; tiendas: number } | null;
  /** Por tienda con ventas: ventas entregadas e ingresos brutos que el libro le imputa (null si el libro no tiene). */
  cuadreVentas: { tienda: string; ventas: number; ingresos: number | null }[] | null;
  /** Cuentas que se concilian (tienen extractos): líneas del mes y cuántas quedan por conciliar. */
  conciliacion: { cuenta: string; lineas: number; porConciliar: number }[] | null;
  /** Tipos de nómina que se usan (alguna vez importados) y los importados para el mes. */
  nomina: { esperados: string[]; importados: string[] } | null;
  /** Nómina del mes (formal neto + externa) contra SUELDOS + OTROS SUELDOS del libro (EERR = SI). */
  nominaLibro: { nomina: number; libro: number } | null;
  /** Cierres semanales con jueves en el mes (o semanas con entregas) y los que no están pagados. */
  deliverys: { semanas: number; sinPagar: number } | null;
  /** Consolidado del EERR del mes: ingresos netos y costo de ventas (positivo). */
  costoVentas: { ingresos: number; costo: number } | null;
  /** Cuentas con movimiento de caja en el mes y sin ningún saldo inicial cargado. */
  saldos: { conMovimiento: number; sinSaldo: string[] } | null;
  /** Prepagos con algo que devengar en el mes y cuántos de ellos ya tienen su ajuste (migración 0927). */
  devengos: { esperados: number; registrados: number } | null;
  /** Si hubo planilla formal en el mes y cuántas de las tres provisiones están registradas. */
  provisiones: { conPlanilla: boolean; registradas: number } | null;
  /** Cuadres guardados (null dentro = sin registrar) y su tolerancia. */
  cuadreInventario: { cuadre: CuadreGuardado | null; tolerancia: number } | null;
  cuadreDropi: { cuadre: CuadreGuardado | null; tolerancia: number } | null;
  /** Líneas del EERR que superan el umbral contra el mes anterior y cuántas siguen sin explicar. */
  variaciones: { superan: number; sinExplicar: number } | null;
  /** Ventas netas del EERR contra QuickBooks (`undefined` = QuickBooks sin conectar: la tarea no se muestra; `qbo` null = sin lectura del mes). */
  quickbooks?: { portal: number; qbo: number | null; desviacion: number | null } | null;
}

export interface TareaEvaluada {
  clave: string;
  titulo: string;
  modulo: string;
  href: string;
  resultado: ResultadoAuto;
  detalle: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("en-US")} ${n === 1 ? uno : varios}`;
const pct = (v: number) => `${v.toFixed(1)} %`;

/** ¿Cuadran las ventas entregadas de una tienda con sus ingresos del libro? */
export function cuadraVentas(ventas: number, ingresos: number | null): boolean {
  const tolerancia = Math.max(TOLERANCIA_CUADRE_USD, (Math.abs(ingresos ?? 0) * TOLERANCIA_CUADRE_PCT) / 100);
  return Math.abs(ventas - (ingresos ?? 0)) <= tolerancia + 0.005;
}

type Evaluacion = Pick<TareaEvaluada, "resultado" | "detalle">;

const EVALUAR: Record<string, (d: DatosMes) => Evaluacion | null> = {
  "sin-tipo": (d) =>
    d.sinTipo === null ? null : d.sinTipo === 0 ? { resultado: "ok", detalle: "Ninguno" } : { resultado: "falta", detalle: plural(d.sinTipo, "movimiento sin tipo", "movimientos sin tipo") },
  "sin-tienda": (d) =>
    d.sinTienda === null
      ? null
      : d.sinTienda === 0
        ? { resultado: "ok", detalle: "Ninguno" }
        : { resultado: "falta", detalle: plural(d.sinTienda, "movimiento en SIN ASIGNAR", "movimientos en SIN ASIGNAR") },
  "base-reparto": (d) => {
    if (!d.reparto) return null;
    if (d.reparto.sinRepartir !== 0) return { resultado: "falta", detalle: `${usd(d.reparto.sinRepartir)} en A DISTRIBUIR sin base de envíos` };
    if (d.reparto.envios === 0) return { resultado: "ok", detalle: "Nada que repartir" };
    return { resultado: "ok", detalle: plural(d.reparto.envios, "envío en la base", "envíos en la base") };
  },
  ventas: (d) => {
    if (!d.ventas) return null;
    if (d.ventas.ordenes === 0) return { resultado: "falta", detalle: "Sin órdenes del mes" };
    return { resultado: "ok", detalle: `${plural(d.ventas.ordenes, "orden", "órdenes")} de ${plural(d.ventas.tiendas, "tienda", "tiendas")}` };
  },
  "cuadre-ventas": (d) => {
    if (!d.cuadreVentas) return null;
    if (!d.cuadreVentas.length) return { resultado: "falta", detalle: "Sin ventas del mes para cuadrar" };
    const distintas = d.cuadreVentas.filter((c) => !cuadraVentas(c.ventas, c.ingresos));
    if (!distintas.length) return { resultado: "ok", detalle: `${plural(d.cuadreVentas.length, "tienda cuadra", "tiendas cuadran")}` };
    const dif = r2(distintas.reduce((a, c) => a + c.ventas - (c.ingresos ?? 0), 0));
    return {
      resultado: "revisar",
      detalle: `${distintas.map((c) => c.tienda).join(", ")} no ${distintas.length === 1 ? "cuadra" : "cuadran"} (ventas − libro ${usd(dif)})`,
    };
  },
  conciliacion: (d) => {
    if (!d.conciliacion) return null;
    if (!d.conciliacion.length) return { resultado: "falta", detalle: "Sin extractos bancarios cargados" };
    const problemas = d.conciliacion
      .filter((c) => c.lineas === 0 || c.porConciliar > 0)
      .map((c) => (c.lineas === 0 ? `${c.cuenta}: sin extracto del mes` : `${c.cuenta}: ${plural(c.porConciliar, "línea", "líneas")} por conciliar`));
    if (problemas.length) return { resultado: "falta", detalle: problemas.join(" · ") };
    return { resultado: "ok", detalle: `${plural(d.conciliacion.length, "cuenta conciliada", "cuentas conciliadas")}` };
  },
  nomina: (d) => {
    if (!d.nomina) return null;
    const NOMBRE: Record<string, string> = { formal: "planilla formal", externa: "nómina externa" };
    if (!d.nomina.esperados.length) return { resultado: "falta", detalle: "Sin nómina cargada" };
    const faltan = d.nomina.esperados.filter((t) => !d.nomina!.importados.includes(t));
    if (faltan.length) return { resultado: "falta", detalle: `Falta ${faltan.map((t) => NOMBRE[t] ?? t).join(" y ")}` };
    return { resultado: "ok", detalle: d.nomina.importados.map((t) => NOMBRE[t] ?? t).join(" y ") };
  },
  "nomina-libro": (d) => {
    if (!d.nominaLibro) return null;
    const { nomina, libro } = d.nominaLibro;
    if (nomina === 0) return { resultado: "falta", detalle: "Sin nómina del mes para conciliar" };
    const dif = r2(libro - nomina);
    if (Math.abs(dif) <= TOLERANCIA_NOMINA) return { resultado: "ok", detalle: `Cuadra (${usd(nomina)})` };
    return { resultado: "revisar", detalle: `Libro − nómina ${usd(dif)}` };
  },
  deliverys: (d) => {
    if (!d.deliverys) return null;
    if (d.deliverys.semanas === 0) return { resultado: "revisar", detalle: "Sin cierres de deliverys en el mes" };
    if (d.deliverys.sinPagar > 0) return { resultado: "falta", detalle: `${d.deliverys.sinPagar} de ${plural(d.deliverys.semanas, "cierre", "cierres")} sin pagar` };
    return { resultado: "ok", detalle: `${plural(d.deliverys.semanas, "cierre pagado", "cierres pagados")}` };
  },
  "costo-ventas": (d) => {
    if (!d.costoVentas) return null;
    const { ingresos, costo } = d.costoVentas;
    if (ingresos <= 0) return { resultado: "revisar", detalle: "Sin ingresos en el EERR del mes" };
    if (costo <= 0) return { resultado: "falta", detalle: "Sin costo de ventas en el mes" };
    const p = sobre(costo, ingresos)!;
    if (p < COSTO_VENTAS_MIN || p > COSTO_VENTAS_MAX)
      return { resultado: "revisar", detalle: `${pct(p)} de los ingresos (se espera ${COSTO_VENTAS_MIN} % a ${COSTO_VENTAS_MAX} %)` };
    return { resultado: "ok", detalle: `${pct(p)} de los ingresos` };
  },
  saldos: (d) => {
    if (!d.saldos) return null;
    if (d.saldos.sinSaldo.length) return { resultado: "falta", detalle: `Sin saldo inicial: ${d.saldos.sinSaldo.join(", ")}` };
    if (d.saldos.conMovimiento === 0) return { resultado: "ok", detalle: "Sin movimiento de caja" };
    return { resultado: "ok", detalle: `${plural(d.saldos.conMovimiento, "cuenta", "cuentas")} con saldo` };
  },
  devengos: (d) => (d.devengos ? evaluarDevengos(d.devengos) : null),
  provisiones: (d) => (d.provisiones ? evaluarProvisiones(d.provisiones) : null),
  "cuadre-inventario": (d) => (d.cuadreInventario ? evaluarCuadre(d.cuadreInventario.cuadre, d.cuadreInventario.tolerancia) : null),
  "cuadre-dropi": (d) => (d.cuadreDropi ? evaluarCuadre(d.cuadreDropi.cuadre, d.cuadreDropi.tolerancia) : null),
  variaciones: (d) => (d.variaciones ? evaluarVariaciones(d.variaciones) : null),
  quickbooks: (d) => {
    if (!d.quickbooks) return null;
    const { portal, qbo, desviacion } = d.quickbooks;
    if (qbo === null) return { resultado: "falta", detalle: "QuickBooks todavía no tiene leído este mes" };
    if (desviacion === null) return { resultado: "revisar", detalle: `QuickBooks en cero y el portal con ${usd(portal)}` };
    const texto = `Portal ${usd(portal)} · QuickBooks ${usd(qbo)} · desviación ${desviacion.toFixed(2)} %`;
    return Math.abs(desviacion) < TOLERANCIA_CUADRE_PCT ? { resultado: "ok", detalle: texto } : { resultado: "revisar", detalle: texto };
  },
};

/** Evalúa cada tarea del checklist contra los datos del mes. */
export function evaluarTareas(periodo: string, d: DatosMes): TareaEvaluada[] {
  return TAREAS.filter((t) => !(t.clave in TAREAS_OPCIONALES) || d[TAREAS_OPCIONALES[t.clave]] !== undefined).map((t) => {
    const e = EVALUAR[t.clave]?.(d) ?? { resultado: "no_disponible" as const, detalle: `No disponible (migración ${t.migracion})` };
    return { clave: t.clave, titulo: t.titulo, modulo: t.modulo, href: t.href(periodo), ...e };
  });
}

/** Lo que una persona marcó a mano en una tarea. */
export interface MarcaTarea {
  clave: string;
  estado: EstadoTarea;
  aMano: boolean;
  comentario: string | null;
  marcadoPor?: string | null;
  marcadoEn?: string | null;
}

export interface TareaCierre extends TareaEvaluada {
  estado: EstadoTarea;
  aMano: boolean;
  comentario: string | null;
  marcadoPor: string | null;
  marcadoEn: string | null;
  color: ColorTarea;
  /** No deja cerrar el mes: ni el sistema la ve resuelta ni hay una marca a mano justificada. */
  bloquea: boolean;
}

const conTexto = (s: string | null | undefined) => Boolean(s && s.trim());

/**
 * Una marca a mano es válida si «no aplica» lleva comentario y si «hecho» lleva comentario cuando el sistema no la ve
 * resuelta. Devuelve el motivo del rechazo o null.
 */
export function validarMarca(estado: EstadoTarea, comentario: string | null, resultado: ResultadoAuto, clave?: string): string | null {
  // Sin la migración que la alimenta («no disponible») sí se puede justificar a mano, para no trabar el cierre.
  if (clave && TAREAS_SIN_MARCA.has(clave) && estado !== "pendiente" && resultado !== "no_disponible") return "Esta tarea no se marca a mano: se resuelve con los datos.";
  if (estado === "no_aplica" && !conTexto(comentario)) return "Escribe por qué no aplica.";
  if (estado === "hecho" && resultado !== "ok" && !conTexto(comentario)) return "Escribe por qué se da por hecha: el sistema no la ve resuelta.";
  return null;
}

/** Junta la evaluación automática con las marcas a mano: color de cada tarea y si deja cerrar. */
export function combinarTareas(evaluadas: TareaEvaluada[], marcas: MarcaTarea[]): TareaCierre[] {
  const porClave = new Map(marcas.map((m) => [m.clave, m]));
  return evaluadas.map((t) => {
    const m = porClave.get(t.clave);
    const manual = m?.aMano && m.estado !== "pendiente" && !(TAREAS_SIN_MARCA.has(t.clave) && t.resultado !== "no_disponible") ? m : null;
    const justificada = manual ? validarMarca(manual.estado, manual.comentario, t.resultado) === null : false;
    const color: ColorTarea =
      t.resultado === "ok" || justificada ? "verde" : t.resultado === "falta" ? "rojo" : "ambar";
    return {
      ...t,
      estado: manual ? manual.estado : t.resultado === "ok" ? "hecho" : "pendiente",
      aMano: Boolean(manual),
      comentario: m?.comentario ?? null,
      marcadoPor: manual ? (m?.marcadoPor ?? null) : null,
      marcadoEn: manual ? (m?.marcadoEn ?? null) : null,
      color,
      bloquea: color !== "verde",
    };
  });
}

/** El color de un mes: el peor de sus tareas. */
export function colorDelMes(tareas: Pick<TareaCierre, "color">[]): ColorTarea {
  return tareas.some((t) => t.color === "rojo") ? "rojo" : tareas.some((t) => t.color === "ambar") ? "ambar" : "verde";
}

export function avance(tareas: Pick<TareaCierre, "color">[]): { listas: number; total: number } {
  return { listas: tareas.filter((t) => t.color === "verde").length, total: tareas.length };
}

/** Si el mes se puede cerrar ahora (debe estar en revisión y con todo el checklist en verde o justificado). */
export function puedeCerrar(estado: EstadoCierre, tareas: Pick<TareaCierre, "bloquea" | "titulo">[]): { ok: true } | { ok: false; motivo: string } {
  if (estado !== "en_revision") return { ok: false, motivo: "Primero hay que enviar el mes a revisión." };
  const faltan = tareas.filter((t) => t.bloquea);
  if (faltan.length) return { ok: false, motivo: `Falta resolver o justificar: ${faltan.map((t) => t.titulo).join(", ")}.` };
  return { ok: true };
}

/**
 * La fila del mes en «Necesita tu atención» (Panel financiero): cerrado = al día (0); si no, cuántas tareas faltan
 * (al menos 1: aunque todo esté en verde, falta cerrarlo).
 */
export function filaPanel(estado: EstadoCierre, tareas: Pick<TareaCierre, "bloquea">[]): { cantidad: number; descripcion: string; accion: string } {
  if (estado === "cerrado") return { cantidad: 0, descripcion: "Cerrado", accion: "Ver" };
  const faltan = tareas.filter((t) => t.bloquea).length;
  if (!faltan) return { cantidad: 1, descripcion: estado === "en_revision" ? "Checklist en verde, en revisión: falta cerrarlo" : "Checklist en verde: falta enviarlo a revisión", accion: "Cerrar" };
  return { cantidad: faltan, descripcion: `${faltan === 1 ? "1 tarea" : `${faltan} tareas`} del checklist sin resolver${estado === "en_revision" ? " · en revisión" : ""}`, accion: "Revisar" };
}

// ---------------------------------------------------------------------------------------------
// Fotografía al cerrar
// ---------------------------------------------------------------------------------------------
export interface ResumenEerr {
  ingresos: number;
  costoVentas: number;
  margenBruto: number;
  ebitda: number;
  resultadoNeto: number;
}

export interface Fotografia {
  version: 1;
  tomadaEn: string;
  eerr: { consolidado: ResumenEerr; tiendas: { unidadId: string; nombre: string; resumen: ResumenEerr }[] } | null;
  flujo: {
    entradas: number;
    salidas: number;
    neto: number;
    operativo: number;
    inversion: number;
    financiamiento: number;
    cajaFinal: number;
    cuentas: { cuentaId: string; nombre: string; final: number }[];
  } | null;
  cartera: { porCobrar: number; cobrarVencido: number; porPagar: number; pagarVencido: number } | null;
}

/** EERR del mes, consolidado y por tienda, a partir de las filas de `fin_eerr_mensual`. */
export function resumirEerrMes(filas: FilaEerr[], periodo: string, nombres: Map<string, string>): NonNullable<Fotografia["eerr"]> {
  const resumen = (fs: FilaEerr[]): ResumenEerr => {
    const e = armarEerr(fs, [periodo]);
    const costo = e.secciones.find((s) => s.seccion === "costo_ventas")!.efecto[periodo];
    return {
      ingresos: r2(e.ingresosNetos[periodo]),
      costoVentas: r2(0 - costo),
      margenBruto: r2(e.margenBruto[periodo]),
      ebitda: r2(e.ebitda[periodo]),
      resultadoNeto: r2(e.resultadoNeto[periodo]),
    };
  };
  const delMes = filas.filter((f) => f.periodo === periodo);
  const porUnidad = new Map<string, FilaEerr[]>();
  for (const f of delMes) porUnidad.set(f.unidad_id, [...(porUnidad.get(f.unidad_id) ?? []), f]);
  return {
    consolidado: resumen(delMes),
    tiendas: [...porUnidad]
      .map(([unidadId, fs]) => ({ unidadId, nombre: nombres.get(unidadId) ?? "—", resumen: resumen(fs) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

export interface FilaComparacion {
  grupo: string;
  concepto: string;
  alCerrar: number | null;
  hoy: number | null;
  diferencia: number;
  cambio: boolean;
}

const CONCEPTOS_EERR: { campo: keyof ResumenEerr; etiqueta: string }[] = [
  { campo: "ingresos", etiqueta: "Ingresos netos" },
  { campo: "costoVentas", etiqueta: "Costo de ventas" },
  { campo: "margenBruto", etiqueta: "Margen bruto" },
  { campo: "ebitda", etiqueta: "EBITDA" },
  { campo: "resultadoNeto", etiqueta: "Resultado neto" },
];

/** Compara la fotografía guardada al cerrar con la de hoy, concepto por concepto (cambio = más de medio centavo). */
export function compararFotografia(guardada: Fotografia, actual: Fotografia): FilaComparacion[] {
  const filas: FilaComparacion[] = [];
  const fila = (grupo: string, concepto: string, a: number | null | undefined, h: number | null | undefined) => {
    const alCerrar = a ?? null;
    const hoy = h ?? null;
    const diferencia = r2((hoy ?? 0) - (alCerrar ?? 0));
    filas.push({ grupo, concepto, alCerrar, hoy, diferencia, cambio: Math.abs(diferencia) > 0.005 || (alCerrar === null) !== (hoy === null) });
  };
  for (const c of CONCEPTOS_EERR) fila("Consolidado", c.etiqueta, guardada.eerr?.consolidado[c.campo], actual.eerr?.consolidado[c.campo]);
  const tiendas = new Map<string, string>();
  for (const t of [...(guardada.eerr?.tiendas ?? []), ...(actual.eerr?.tiendas ?? [])]) tiendas.set(t.unidadId, t.nombre);
  for (const [id, nombre] of [...tiendas].sort((a, b) => a[1].localeCompare(b[1]))) {
    const g = guardada.eerr?.tiendas.find((t) => t.unidadId === id)?.resumen;
    const h = actual.eerr?.tiendas.find((t) => t.unidadId === id)?.resumen;
    fila(nombre, "Ingresos netos", g?.ingresos, h?.ingresos);
    fila(nombre, "EBITDA", g?.ebitda, h?.ebitda);
    fila(nombre, "Resultado neto", g?.resultadoNeto, h?.resultadoNeto);
  }
  if (guardada.flujo || actual.flujo) {
    fila("Flujo de caja", "Entradas", guardada.flujo?.entradas, actual.flujo?.entradas);
    fila("Flujo de caja", "Salidas", guardada.flujo?.salidas, actual.flujo?.salidas);
    fila("Flujo de caja", "Flujo operativo", guardada.flujo?.operativo, actual.flujo?.operativo);
    fila("Flujo de caja", "Flujo neto", guardada.flujo?.neto, actual.flujo?.neto);
    fila("Flujo de caja", "Caja al cierre", guardada.flujo?.cajaFinal, actual.flujo?.cajaFinal);
  }
  if (guardada.cartera || actual.cartera) {
    fila("Cartera al cierre", "Por cobrar", guardada.cartera?.porCobrar, actual.cartera?.porCobrar);
    fila("Cartera al cierre", "Por cobrar vencido", guardada.cartera?.cobrarVencido, actual.cartera?.cobrarVencido);
    fila("Cartera al cierre", "Por pagar", guardada.cartera?.porPagar, actual.cartera?.porPagar);
    fila("Cartera al cierre", "Por pagar vencido", guardada.cartera?.pagarVencido, actual.cartera?.pagarVencido);
  }
  return filas;
}

/** Revisa la forma de una fotografía leída de la base (jsonb): si no es la esperada, null. */
export function leerFotografia(v: unknown): Fotografia | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Partial<Fotografia>;
  if (f.version !== 1 || typeof f.tomadaEn !== "string") return null;
  return { version: 1, tomadaEn: f.tomadaEn, eerr: f.eerr ?? null, flujo: f.flujo ?? null, cartera: f.cartera ?? null };
}
