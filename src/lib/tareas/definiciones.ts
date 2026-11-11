// Tareas programadas diarias de Finanzas (migración 0921). Lógica pura: qué tareas hay, a qué hora corren (Panamá es
// UTC−5 todo el año, sin cambio de hora) y cómo se reparte el trabajo para no pasar el tope de tiempo de una función de
// Vercel. La ejecución vive en `ejecutar.ts`; las rutas en `src/app/api/cron/<tarea>/route.ts`. Prueba en
// `definiciones.test.ts`.

export const CLAVES_TAREA = [
  "efectivo-repartidores",
  "conciliacion",
  "cierre-mes",
  "proyeccion-caja",
  "alertas",
  "informe-mensual",
  "resumen-semanal",
  "dropi-finanzas",
  "shopify-ventas",
  "respaldo-finanzas",
  "quickbooks",
  "monday",
] as const;
export type ClaveTarea = (typeof CLAVES_TAREA)[number];

export const esClaveTarea = (v: unknown): v is ClaveTarea => typeof v === "string" && (CLAVES_TAREA as readonly string[]).includes(v);

export interface DefTareaProgramada {
  clave: ClaveTarea;
  titulo: string;
  /** Horas de Panamá en que corre (la segunda, si la hay, sigue lo que la primera no alcanzó a terminar). */
  horas: { hora: number; minuto: number }[];
  /** Días de la semana (0 = domingo); vacío = todos los días. */
  dias: number[];
  /** Día del mes (1–28) en que corre; sin él, según `dias`. */
  diaMes?: number;
}

/** Desfase de Panamá respecto de UTC, en horas (UTC−5, sin horario de verano). */
export const DESFASE_PANAMA = -5;

export const TAREAS_PROGRAMADAS: DefTareaProgramada[] = [
  { clave: "efectivo-repartidores", titulo: "Efectivo de repartidores de la semana", horas: [{ hora: 5, minuto: 0 }], dias: [] },
  { clave: "conciliacion", titulo: "Sugerencias de conciliación (2 meses abiertos)", horas: [{ hora: 5, minuto: 10 }, { hora: 5, minuto: 40 }], dias: [] },
  { clave: "cierre-mes", titulo: "Checklist del cierre (mes anterior y actual)", horas: [{ hora: 5, minuto: 20 }], dias: [] },
  { clave: "proyeccion-caja", titulo: "Foto semanal de la proyección de caja", horas: [{ hora: 6, minuto: 0 }], dias: [1] },
  { clave: "alertas", titulo: "Alertas financieras", horas: [{ hora: 6, minuto: 30 }], dias: [] },
  { clave: "dropi-finanzas", titulo: "Dropi al portal financiero (entregados, ganancias y billetera)", horas: [{ hora: 4, minuto: 30 }], dias: [] },
  { clave: "shopify-ventas", titulo: "Órdenes y reembolsos de Shopify", horas: [{ hora: 4, minuto: 40 }], dias: [] },
  { clave: "quickbooks", titulo: "QuickBooks: plan de cuentas, resultados y ventas", horas: [{ hora: 4, minuto: 50 }], dias: [] },
  { clave: "monday", titulo: "Monday: despachos y entregas", horas: [{ hora: 5, minuto: 30 }, { hora: 5, minuto: 40 }, { hora: 5, minuto: 50 }], dias: [] },
  { clave: "informe-mensual", titulo: "Informe mensual por correo", horas: [{ hora: 7, minuto: 0 }], dias: [], diaMes: 5 },
  { clave: "resumen-semanal", titulo: "Resumen semanal por WhatsApp", horas: [{ hora: 7, minuto: 30 }], dias: [1] },
  { clave: "respaldo-finanzas", titulo: "Respaldo semanal de los datos financieros", horas: [{ hora: 3, minuto: 0 }, { hora: 3, minuto: 10 }, { hora: 3, minuto: 20 }], dias: [0] },
];

export const TITULO_TAREA = Object.fromEntries(TAREAS_PROGRAMADAS.map((t) => [t.clave, t.titulo])) as Record<ClaveTarea, string>;

/**
 * La expresión cron (UTC) de una hora de Panamá. Si al pasar a UTC cambia de día, corre los días de la semana (o el día
 * del mes, que va de 1 a 28 para no cruzar de mes).
 */
export function cronUtc(hora: number, minuto: number, dias: number[] = [], diaMes?: number): string {
  const total = hora - DESFASE_PANAMA;
  const h = ((total % 24) + 24) % 24;
  const corrimiento = Math.floor(total / 24);
  const d = dias.length ? dias.map((x) => (((x + corrimiento) % 7) + 7) % 7).sort((a, b) => a - b).join(",") : "*";
  const dm = diaMes ? String(diaMes + corrimiento) : "*";
  return `${minuto} ${h} ${dm} * ${d}`;
}

/** Los crons de `vercel.json` para estas tareas. */
export function cronsVercel(): { path: string; schedule: string }[] {
  return TAREAS_PROGRAMADAS.flatMap((t) => t.horas.map((h) => ({ path: `/api/cron/${t.clave}`, schedule: cronUtc(h.hora, h.minuto, t.dias, t.diaMes) })));
}

/** Hoy en Panamá (AAAA-MM-DD). */
import { hoyPanama } from "@/lib/af4/fecha";
export { hoyPanama };

/**
 * Los últimos `n` meses abiertos hasta el mes en curso (primer día de cada mes, del más nuevo al más viejo), mirando
 * hasta `buscar` meses hacia atrás: un mes cerrado no se vuelve a tocar.
 */
export function mesesAbiertos(mesEnCurso: string, cerrados: Set<string>, n = 2, buscar = 6): string[] {
  const salida: string[] = [];
  const [a, m] = mesEnCurso.split("-").map(Number);
  for (let i = 0; i < buscar && salida.length < n; i++) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 10);
    if (!cerrados.has(d)) salida.push(d);
  }
  return salida;
}

/** Tiempo de trabajo de una ejecución: el tope de la función (60 s) menos un margen para guardar el resultado. */
export const PRESUPUESTO_MS = 45_000;

/** ¿Una ejecución sin terminar todavía cuenta como «corriendo»? (después de esto se da por cortada). */
export const CORRIENDO_MS = 5 * 60_000;

/** Lo que una ejecución anterior dejó por hacer, si es de hoy (la siguiente sigue de ahí). */
export function pendienteDeHoy(ultima: { inicio: string; pendiente: unknown } | null, hoy: string): unknown {
  if (!ultima || ultima.pendiente === null || ultima.pendiente === undefined) return null;
  return hoyPanama(new Date(ultima.inicio)) === hoy ? ultima.pendiente : null;
}

/** El texto del resumen, recortado al largo de la columna. */
export const resumenCorto = (s: string) => (s.length > 1000 ? `${s.slice(0, 997)}…` : s);
