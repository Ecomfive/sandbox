// Portal AF4 360° › Cierre y control (migración 0927). Lógica pura que completa el Cierre de mes: los ajustes del cierre
// (`fin_config.cierre`), la fecha objetivo y el semáforo de atraso de cada tarea, la aprobación en dos pasos, las
// variaciones contra el mes anterior que exigen explicación y los cuadres de inventario y de Dropi. No importa
// `cierre.ts` (que sí importa este archivo para evaluar sus tareas nuevas). Prueba en `cierre-control.test.ts`.

import { dinero } from "@/lib/af4/formato";
import { filasEstado } from "./eerr-filas";
import type { Eerr } from "./eerr";
import { diaHabilDelMes, diasHabilesEntre } from "./dias-habiles";

// ---------------------------------------------------------------------------------------------
// Ajustes del cierre
// ---------------------------------------------------------------------------------------------
export interface ConfigCierre {
  /** Día hábil del mes siguiente en que el mes debe quedar cerrado. */
  diaHabil: number;
  /** Variación contra el mes anterior que exige explicación: los dos umbrales a la vez (% y monto en USD). */
  umbralPct: number;
  umbralMonto: number;
  /** Diferencia que se acepta sin explicación en cada cuadre (USD). */
  toleranciaInventario: number;
  toleranciaDropi: number;
  /** Cómo se llama Dropi en la cartera por cobrar (se busca dentro del nombre de la contraparte). */
  contraparteDropi: string;
}

export const CONFIG_CIERRE_DEFECTO: ConfigCierre = {
  diaHabil: 5,
  umbralPct: 10,
  umbralMonto: 500,
  toleranciaInventario: 100,
  toleranciaDropi: 100,
  contraparteDropi: "dropi",
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

const LIMITES = {
  diaHabil: [1, 20],
  umbralPct: [0, 1000],
  umbralMonto: [0, 10_000_000],
  toleranciaInventario: [0, 10_000_000],
  toleranciaDropi: [0, 10_000_000],
} as const;

/** Limpia el texto de la contraparte: solo letras, números y espacios (va dentro de un `ilike`). */
export function limpiarContraparte(v: unknown): string {
  return typeof v === "string" ? v.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
}

/** Lee `fin_config.cierre` (jsonb): lo que falte o no sirva toma el valor por defecto. */
export function leerConfigCierre(valor: unknown): ConfigCierre {
  const v = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const de = (clave: keyof typeof LIMITES, campo: string) => {
    const n = num(v[campo]);
    const [min, max] = LIMITES[clave];
    return n === null || n < min || n > max ? CONFIG_CIERRE_DEFECTO[clave] : clave === "diaHabil" ? Math.round(n) : n;
  };
  return {
    diaHabil: de("diaHabil", "dia_habil"),
    umbralPct: de("umbralPct", "umbral_pct"),
    umbralMonto: de("umbralMonto", "umbral_monto"),
    toleranciaInventario: de("toleranciaInventario", "tolerancia_inventario"),
    toleranciaDropi: de("toleranciaDropi", "tolerancia_dropi"),
    contraparteDropi: limpiarContraparte(v.contraparte_dropi) || CONFIG_CIERRE_DEFECTO.contraparteDropi,
  };
}

/** Valida lo que llega del formulario de ajustes y devuelve el jsonb a guardar, o el error. */
export function validarConfigCierre(entrada: Record<string, unknown>): { error: string } | { config: ConfigCierre; valor: Record<string, unknown> } {
  const campos: [keyof typeof LIMITES, string, string][] = [
    ["diaHabil", "dia_habil", "El día hábil"],
    ["umbralPct", "umbral_pct", "El umbral en %"],
    ["umbralMonto", "umbral_monto", "El umbral en dólares"],
    ["toleranciaInventario", "tolerancia_inventario", "La tolerancia del inventario"],
    ["toleranciaDropi", "tolerancia_dropi", "La tolerancia de Dropi"],
  ];
  const valor: Record<string, unknown> = {};
  for (const [clave, campo, nombre] of campos) {
    const n = num(entrada[campo]);
    const [min, max] = LIMITES[clave];
    if (n === null || n < min || n > max) return { error: `${nombre} debe estar entre ${min} y ${max.toLocaleString("en-US")}.` };
    if (clave === "diaHabil" && !Number.isInteger(n)) return { error: "El día hábil es un número entero." };
    valor[campo] = Math.round(n * 100) / 100;
  }
  const contraparte = limpiarContraparte(entrada.contraparte_dropi);
  if (contraparte.length < 2) return { error: "Escribe cómo se llama Dropi en la cartera por cobrar." };
  valor.contraparte_dropi = contraparte;
  return { config: leerConfigCierre(valor), valor };
}

// ---------------------------------------------------------------------------------------------
// Fecha objetivo y atraso
// ---------------------------------------------------------------------------------------------
export function mesSiguiente(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** La fecha en que el mes debe quedar cerrado: el día hábil N del mes siguiente. */
export function fechaObjetivo(periodo: string, diaHabil: number): string {
  return diaHabilDelMes(mesSiguiente(periodo), diaHabil);
}

/** Días hábiles antes de la fecha límite desde los que una tarea se ve «por vencer». */
export const DIAS_POR_VENCER = 2;

export type Atraso = "resuelta" | "en_plazo" | "por_vencer" | "vencida";

export const ETIQUETA_ATRASO: Record<Atraso, string> = {
  resuelta: "Resuelta",
  en_plazo: "En plazo",
  por_vencer: "Por vencer",
  vencida: "Atrasada",
};

/**
 * El semáforo de una tarea: resuelta (en verde), vencida (pasó su fecha límite sin resolver), por vencer (le quedan
 * `DIAS_POR_VENCER` días hábiles o menos) o en plazo. `dias` = días hábiles que faltan (negativo si ya venció).
 */
export function atrasoTarea(resuelta: boolean, fechaLimite: string, hoy: string): { atraso: Atraso; dias: number } {
  const dias = diasHabilesEntre(hoy, fechaLimite);
  if (resuelta) return { atraso: "resuelta", dias };
  if (hoy > fechaLimite) return { atraso: "vencida", dias };
  if (dias <= DIAS_POR_VENCER) return { atraso: "por_vencer", dias };
  return { atraso: "en_plazo", dias };
}

/** El texto corto del plazo: «Vence hoy», «Faltan 3 días hábiles», «Atrasada 2 días hábiles». */
export function textoPlazo(a: { atraso: Atraso; dias: number }): string {
  const d = (n: number) => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;
  if (a.atraso === "resuelta") return "Resuelta";
  if (a.atraso === "vencida") return a.dias === 0 ? "Venció hoy" : `Atrasada ${d(Math.abs(a.dias))}`;
  if (a.dias === 0) return "Vence hoy";
  return `Faltan ${d(a.dias)}`;
}

// ---------------------------------------------------------------------------------------------
// Aprobación en dos pasos
// ---------------------------------------------------------------------------------------------
/** Quien preparó el cierre (lo envió a revisión) no puede aprobarlo (cerrarlo). */
export function puedeAprobar(preparadoPor: string | null | undefined, usuarioId: string): { ok: true } | { ok: false; motivo: string } {
  if (preparadoPor && preparadoPor === usuarioId) {
    return { ok: false, motivo: "Tú preparaste este cierre: lo aprueba y lo cierra otra persona." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Variaciones contra el mes anterior
// ---------------------------------------------------------------------------------------------
export interface LineaVariacion {
  clave: string;
  etiqueta: string;
  tipo: "seccion" | "detalle" | "resultado";
  actual: number;
  anterior: number;
  diferencia: number;
  /** Variación en % sobre el mes anterior (null si el anterior es cero). */
  pct: number | null;
  supera: boolean;
  explicacion: string | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** ¿Supera el umbral? Los dos a la vez: el monto y el % (sin mes anterior, basta el monto). */
export function superaUmbral(actual: number, anterior: number, c: Pick<ConfigCierre, "umbralPct" | "umbralMonto">): boolean {
  const dif = Math.abs(actual - anterior);
  if (dif < c.umbralMonto || dif < 0.005) return false;
  if (Math.abs(anterior) < 0.005) return true;
  return (dif / Math.abs(anterior)) * 100 >= c.umbralPct;
}

/**
 * Las líneas del EERR consolidado (secciones, tipos y resultados; sin los %) del mes contra el anterior, con si superan
 * el umbral y la explicación guardada. `eerr` debe traer los dos meses.
 */
export function lineasVariacion(
  eerr: Eerr,
  periodo: string,
  anterior: string,
  c: Pick<ConfigCierre, "umbralPct" | "umbralMonto">,
  explicaciones: Map<string, string>,
): LineaVariacion[] {
  return filasEstado(eerr)
    .filter((f) => f.tipo !== "porcentaje")
    .map((f) => {
      const actual = r2(f.valores[periodo] ?? 0);
      const ant = r2(f.valores[anterior] ?? 0);
      return {
        clave: f.clave,
        etiqueta: f.etiqueta,
        tipo: f.tipo as LineaVariacion["tipo"],
        actual,
        anterior: ant,
        diferencia: r2(actual - ant),
        pct: Math.abs(ant) < 0.005 ? null : Math.round(((actual - ant) / Math.abs(ant)) * 1000) / 10,
        supera: superaUmbral(actual, ant, c),
        explicacion: explicaciones.get(f.clave) ?? null,
      };
    });
}

/** Cuántas líneas superan el umbral y cuántas de ellas siguen sin explicación. */
export function resumenVariaciones(lineas: Pick<LineaVariacion, "supera" | "explicacion">[]): { superan: number; sinExplicar: number } {
  const superan = lineas.filter((l) => l.supera);
  return { superan: superan.length, sinExplicar: superan.filter((l) => !l.explicacion || !l.explicacion.trim()).length };
}

// ---------------------------------------------------------------------------------------------
// Cuadres
// ---------------------------------------------------------------------------------------------
export type ClaseCuadre = "inventario" | "cartera_dropi";
export const ETIQUETA_CUADRE: Record<ClaseCuadre, string> = { inventario: "Inventario contable contra el WMS", cartera_dropi: "Cartera por cobrar contra Dropi" };

export interface CuadreGuardado {
  libros: number;
  sistema: number;
  diferencia: number;
  explicacion: string | null;
}

/** ¿Cuadra? La diferencia (libros − sistema) dentro de la tolerancia. */
export function cuadra(diferencia: number, tolerancia: number): boolean {
  return Math.abs(diferencia) <= tolerancia + 0.005;
}

/** Lo que Dropi tiene pendiente (lado del sistema del cuadre de cartera) y sus partes. */
export interface PartesDropi {
  wallet: number;
  walletFecha: string | null;
  retirosTransito: number;
  retirosAbiertos: number;
  entregadosSinLiquidar: number;
  pedidosSinLiquidar: number;
  carteraLibros: number;
  documentosLibros: number;
}

/** Lo que Dropi nos debe: wallet + retiros en tránsito + entregados sin acreditar. */
export const pendienteDropi = (p: Pick<PartesDropi, "wallet" | "retirosTransito" | "entregadosSinLiquidar">) =>
  r2(p.wallet + p.retirosTransito + p.entregadosSinLiquidar);

/** Lee la fila de `fin_cuadre_dropi_al`. */
export function leerPartesDropi(f: Record<string, unknown> | null | undefined): PartesDropi | null {
  if (!f) return null;
  const n = (k: string) => Number(f[k] ?? 0) || 0;
  return {
    wallet: n("wallet"),
    walletFecha: f.wallet_fecha ? String(f.wallet_fecha).slice(0, 10) : null,
    retirosTransito: n("retiros_transito"),
    retirosAbiertos: n("retiros_abiertos"),
    entregadosSinLiquidar: n("entregados_sin_liquidar"),
    pedidosSinLiquidar: n("pedidos_sin_liquidar"),
    carteraLibros: n("cartera_libros"),
    documentosLibros: n("documentos_libros"),
  };
}

/** La explicación automática de una diferencia con Dropi: qué parte del pendiente la puede explicar. */
export function explicarDiferenciaDropi(p: PartesDropi): string[] {
  const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
  const dif = r2(p.carteraLibros - pendienteDropi(p));
  const partes: string[] = [];
  if (!p.walletFecha) partes.push("No hay saldo de wallet cargado a esa fecha.");
  if (p.retirosAbiertos > 0) partes.push(`${p.retirosAbiertos} ${p.retirosAbiertos === 1 ? "retiro pedido" : "retiros pedidos"} sin recibir: ${usd(p.retirosTransito)}.`);
  if (p.pedidosSinLiquidar > 0) partes.push(`${p.pedidosSinLiquidar} ${p.pedidosSinLiquidar === 1 ? "pedido entregado" : "pedidos entregados"} que Dropi no acreditó: ${usd(p.entregadosSinLiquidar)}.`);
  if (Math.abs(dif) > 0.005) {
    const cerca = [
      { nombre: "los retiros en tránsito", v: p.retirosTransito },
      { nombre: "los entregados sin acreditar", v: p.entregadosSinLiquidar },
      { nombre: "el saldo de la wallet", v: p.wallet },
    ].find((x) => x.v > 0 && Math.abs(Math.abs(dif) - x.v) <= Math.max(1, x.v * 0.02));
    if (cerca) partes.push(`La diferencia es casi igual a ${cerca.nombre}: puede que los libros no los cuenten.`);
  }
  return partes;
}

// ---------------------------------------------------------------------------------------------
// Evaluación de las tareas nuevas del checklist (las llama `cierre.ts`)
// ---------------------------------------------------------------------------------------------
export type ResultadoControl = "ok" | "revisar" | "falta";
export interface EvaluacionControl {
  resultado: ResultadoControl;
  detalle: string;
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("en-US")} ${n === 1 ? uno : varios}`;

export function evaluarCuadre(c: CuadreGuardado | null, tolerancia: number): EvaluacionControl {
  const usd = (v: number) => dinero(v, "USD", { decimales: 2, conSigno: true });
  if (!c) return { resultado: "falta", detalle: "Sin cuadre registrado" };
  if (cuadra(c.diferencia, tolerancia)) return { resultado: "ok", detalle: `Cuadra (diferencia ${usd(c.diferencia)})` };
  if (c.explicacion && c.explicacion.trim()) return { resultado: "ok", detalle: `Diferencia ${usd(c.diferencia)} explicada` };
  return { resultado: "revisar", detalle: `Diferencia ${usd(c.diferencia)} sin explicar` };
}

export function evaluarVariaciones(v: { superan: number; sinExplicar: number }): EvaluacionControl {
  if (!v.superan) return { resultado: "ok", detalle: "Ninguna línea supera el umbral" };
  if (!v.sinExplicar) return { resultado: "ok", detalle: `${plural(v.superan, "línea explicada", "líneas explicadas")}` };
  return { resultado: "falta", detalle: `${plural(v.sinExplicar, "línea", "líneas")} sin explicar de ${v.superan}` };
}

export function evaluarDevengos(d: { esperados: number; registrados: number }): EvaluacionControl {
  if (!d.esperados) return { resultado: "ok", detalle: "Sin gastos prepagados en el mes" };
  if (d.registrados >= d.esperados) return { resultado: "ok", detalle: `${plural(d.esperados, "devengo registrado", "devengos registrados")}` };
  return { resultado: "falta", detalle: `Faltan ${d.esperados - d.registrados} de ${plural(d.esperados, "devengo", "devengos")}` };
}

export function evaluarProvisiones(p: { conPlanilla: boolean; registradas: number }): EvaluacionControl {
  if (!p.conPlanilla) return { resultado: "ok", detalle: "Sin planilla formal en el mes" };
  if (p.registradas >= 3) return { resultado: "ok", detalle: "XIII mes, vacaciones y prima registradas" };
  if (p.registradas > 0) return { resultado: "falta", detalle: `${p.registradas} de 3 provisiones registradas` };
  return { resultado: "falta", detalle: "Falta registrar las provisiones de la planilla" };
}

/**
 * Si hay que avisar hoy al responsable de una tarea: cuando pasa a «por vencer» o a «vencida» (una vez por estado; el
 * último aviso enviado queda en `fin_cierre_tareas.aviso_estado`). Devuelve el estado a avisar o null.
 */
export function avisoPendiente(atraso: Atraso, ultimoAviso: string | null): "por_vencer" | "vencida" | null {
  if (atraso !== "por_vencer" && atraso !== "vencida") return null;
  return ultimoAviso === atraso ? null : atraso;
}
