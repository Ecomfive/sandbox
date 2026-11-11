// Lectura de Planificación (migraciones 0944 y 0945): historia por tienda (Postgres), EERR, balance de apertura, deuda
// programada, motores y supuestos guardados, versiones, fotos y escenarios. Arma lo que necesitan las seis pestañas; los
// cálculos viven en `pronostico.ts`, `planificacion.ts` y `metas-plan.ts`. Solo lectura; los permisos los decide quien
// llama (las tiendas permitidas se aplican aquí con `permitidas`, y la apertura del balance solo se lee si ve toda la
// empresa).

import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama, sumarMeses } from "@/lib/af4/fecha";
import { armarBalance } from "./balance";
import { cargarBalance, cargarDeudaCortes } from "./cargar-balance";
import { cargarEerr, unidadesEerr } from "./cargar-eerr";
import type { FilaEerr } from "./eerr";
import {
  CLAVE_PLANIFICACION,
  SUPUESTOS_CERO,
  aplicarEditados,
  diasDeRotacion,
  fotoDePlan,
  leerFoto,
  leerMotoresEditados,
  leerSupuestos,
  mesesDesde,
  motoresDesdeHistoria,
  proyectarPlan,
  type Apertura,
  type DatosFoto,
  type EntradaPlan,
  type HistoriaMes,
  type MesReal,
  type Motores,
  type ParametrosEscenario,
  type SupuestosPlan,
  type TipoEscenario,
  esTipoEscenario,
  leerParametros,
} from "./planificacion";
import { diaSemana, diasDelMes, explicarMetodo, factorCalendario, pesosDiaSemana, pronosticar, type Pronostico } from "./pronostico";
import { cargarValoracion } from "./valoracion";
import { acumular, filaMeta, metasDeFoto, realDeHistoria, type FilaMetaTienda, type ValoresMeta } from "./metas-plan";

export const SIN_MIGRACION_PLAN = "Falta correr las migraciones 0944 y 0945 (planificación) en Supabase.";
/** Meses de historia que se leen para el pronóstico (Holt-Winters pide 24). */
export const MESES_HISTORIA = 24;
export const HORIZONTE_PRONOSTICO = 12;

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;

export interface TiendaBase {
  id: string;
  nombre: string;
  historia: HistoriaMes[];
  ventas: Pronostico;
  pedidos: Pronostico;
  explicacion: string;
  motoresHistoria: Motores;
  editados: Partial<Motores>;
  motores: Motores;
  editadoEn: string | null;
}

export interface BasePlan {
  hoy: string;
  mesEnCurso: string;
  /** El último mes cerrado (la base de todo). */
  corte: string;
  corteDeCierre: boolean;
  /** Los meses de historia leídos (hasta el corte). */
  mesesHistoria: string[];
  tiendas: TiendaBase[];
  /** EBITDA real por tienda y mes (del EERR). */
  ebitdaTienda: Record<string, Record<string, number>>;
  veTodo: boolean;
  avisos: string[];
  /** Sin la 0158 no hay historia: las pestañas lo dicen. */
  sinHistoria: string | null;
  sinTablas: boolean;
  supuestosDatos: SupuestosPlan;
  supuestosEditados: Partial<SupuestosPlan>;
  supuestos: SupuestosPlan;
  supuestosEn: string | null;
  apertura: Apertura | null;
  deudaProgramada: Record<string, number>;
  multiplo: number;
  /** El consolidado real de los últimos meses (solo con toda la empresa). */
  reales: MesReal[];
}

async function ultimoCierre(supabase: SupabaseClient): Promise<string | null> {
  const r = await supabase.from("fin_cierres").select("periodo").eq("estado", "cerrado").order("periodo", { ascending: false }).limit(1);
  if (r.error || !r.data?.length) return null;
  return String(r.data[0].periodo).slice(0, 10);
}

/** Cuántos días de cada día de la semana hay entre dos fechas (incluidas). */
export function contarDiasSemana(desde: string, hasta: string): number[] {
  const cuenta = Array(7).fill(0);
  const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
  const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
  const total = Math.max(0, Math.round((b - a) / 86_400_000) + 1);
  const primero = diaSemana(desde);
  for (let i = 0; i < total; i++) cuenta[(primero + i) % 7]++;
  return cuenta;
}

const finDeMes = (p: string) => `${p.slice(0, 7)}-${String(diasDelMes(p)).padStart(2, "0")}`;

const efecto = (f: FilaEerr) => f.signo * f.monto;
const gasto = (f: FilaEerr) => -f.signo * f.monto;

/**
 * El pronóstico de ventas y pedidos de una tienda desde su historia mensual. La serie empieza en el primer mes con ventas
 * (los meses anteriores a abrir la tienda no son ceros reales) y se ajusta por calendario.
 */
function pronosticarTienda(
  propia: { periodo: string; ventas: number; pedidos: number }[],
  mesesHistoria: string[],
  ventasDia: number[],
  corte: string,
  horizonte: string[],
): { meses: string[]; ventas: Pronostico; pedidos: Pronostico; aplica: boolean } {
  const primero = propia.find((h) => h.ventas > 0)?.periodo ?? null;
  const meses = primero ? mesesHistoria.filter((m) => m >= primero) : [];
  const deMes = (m: string) => propia.find((h) => h.periodo === m);
  const { pesos, aplica } = pesosDiaSemana(ventasDia, contarDiasSemana(primero ?? mesesHistoria[0], finDeMes(corte)));
  const factores = [...meses, ...horizonte].map((m) => factorCalendario(m, pesos));
  const ventas = pronosticar(meses.map((m) => deMes(m)?.ventas ?? 0), HORIZONTE_PRONOSTICO, { factores });
  const pedidos = pronosticar(meses.map((m) => deMes(m)?.pedidos ?? 0), HORIZONTE_PRONOSTICO, { factores });
  return { meses, ventas, pedidos, aplica };
}

/** El corte del pronóstico: el último mes cerrado, o el mes anterior al de hoy si el cierre no es de antes del mes en curso. */
async function corteDelPlan(supabase: SupabaseClient, mesEnCurso: string): Promise<{ corte: string; cierre: string | null }> {
  const cierre = await ultimoCierre(supabase);
  return { corte: cierre && cierre < mesEnCurso ? cierre : sumarMeses(mesEnCurso, -1), cierre };
}

/**
 * Solo el pronóstico de pedidos de cada tienda (lo que usa el Plan de compras), sin EERR ni balance: unidadId → periodo
 * → pedidos pronosticados. `null` sin la migración 0945.
 */
export async function cargarPronosticoPedidos(supabase: SupabaseClient): Promise<{ corte: string; pedidos: Map<string, Map<string, number>> } | null> {
  const mesEnCurso = `${hoyPanama().slice(0, 7)}-01`;
  const { corte } = await corteDelPlan(supabase, mesEnCurso);
  const mesesHistoria = Array.from({ length: MESES_HISTORIA }, (_, i) => sumarMeses(corte, i - MESES_HISTORIA + 1));
  const [hist, dias] = await Promise.all([
    supabase.rpc("fin_plan_historia", { p_desde: mesesHistoria[0], p_hasta: corte, p_unidades: null }),
    supabase.rpc("fin_plan_dias_semana", { p_desde: mesesHistoria[0], p_hasta: finDeMes(corte), p_unidades: null }),
  ]);
  if (hist.error) return null;
  const porTienda = new Map<string, { periodo: string; ventas: number; pedidos: number }[]>();
  for (const r of (hist.data ?? []) as Record<string, unknown>[]) {
    const periodo = String(r.periodo).slice(0, 10);
    if (periodo > corte) continue;
    const lista = porTienda.get(String(r.unidad_id)) ?? [];
    lista.push({ periodo, ventas: num(r.ventas), pedidos: num(r.pedidos) });
    porTienda.set(String(r.unidad_id), lista);
  }
  const ventasDia = new Map<string, number[]>();
  for (const d of (dias.error ? [] : (dias.data ?? [])) as { unidad_id: string; dia: number; ventas: number | string }[]) {
    const v = ventasDia.get(String(d.unidad_id)) ?? Array(7).fill(0);
    v[Number(d.dia)] = num(d.ventas);
    ventasDia.set(String(d.unidad_id), v);
  }
  const horizonte = mesesDesde(sumarMeses(corte, 1), HORIZONTE_PRONOSTICO);
  const pedidos = new Map<string, Map<string, number>>();
  for (const [id, lista] of porTienda) {
    lista.sort((a, b) => a.periodo.localeCompare(b.periodo));
    const p = pronosticarTienda(lista, mesesHistoria, ventasDia.get(id) ?? [], corte, horizonte).pedidos;
    if (p.metodo === "sin_datos" || !p.proyeccion.length) continue;
    pedidos.set(id, new Map(horizonte.map((m, k) => [m, p.proyeccion[k]?.valor ?? 0])));
  }
  return { corte, pedidos };
}

/**
 * Todo lo que necesitan las pestañas. `permitidas` = las tiendas que la persona puede ver (null = todas). El balance de
 * apertura, la deuda y el consolidado real solo se leen con `permitidas === null`.
 */
export async function cargarBasePlan(supabase: SupabaseClient, permitidas: string[] | null, opciones: { balance?: boolean } = {}): Promise<BasePlan | { error: string }> {
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const veTodo = permitidas === null;
  const [{ corte, cierre }, unidades, valoracion, cfg] = await Promise.all([
    corteDelPlan(supabase, mesEnCurso),
    unidadesEerr(supabase),
    cargarValoracion(supabase),
    supabase.from("fin_config").select("clave, valor, actualizado_en").in("clave", [CLAVE_PLANIFICACION, "caja_minima"]),
  ]);
  if ("error" in unidades) return { error: unidades.error };
  const mesesHistoria = Array.from({ length: MESES_HISTORIA }, (_, i) => sumarMeses(corte, i - MESES_HISTORIA + 1));
  const todas = unidades.unidades;
  const tiendasVisibles = todas.filter((u) => u.clase === "tienda" && (veTodo || permitidas.includes(u.id.toLowerCase())));
  const ids = tiendasVisibles.map((t) => t.id);
  const avisos: string[] = [];

  const [hist, dias, eerr, editados] = await Promise.all([
    supabase.rpc("fin_plan_historia", { p_desde: mesesHistoria[0], p_hasta: corte, p_unidades: veTodo ? null : ids }),
    supabase.rpc("fin_plan_dias_semana", { p_desde: mesesHistoria[0], p_hasta: finDeMes(corte), p_unidades: veTodo ? null : ids }),
    cargarEerr(supabase, null, mesesHistoria, { unidades: veTodo ? null : ids }),
    supabase.from("fin_plan_motores").select("unidad_id, valores, actualizado_en"),
  ]);
  const sinHistoria = hist.error ? SIN_MIGRACION_PLAN : null;
  if (hist.error) console.error("fin_plan_historia:", hist.error.message);
  const sinTablas = !!editados.error;
  const filasEerr = "error" in eerr ? [] : eerr.filas;
  if ("error" in eerr) avisos.push("No se pudo leer el Estado de resultados: los gastos fijos salen en cero.");

  // EERR por unidad y mes: gastos fijos (administración) y EBITDA.
  const fijos: Record<string, Record<string, number>> = {};
  const ebitdaTienda: Record<string, Record<string, number>> = {};
  const sumar = (o: Record<string, Record<string, number>>, u: string, p: string, v: number) => {
    o[u] ??= {};
    o[u][p] = r2((o[u][p] ?? 0) + v);
  };
  const periodosLibro = new Set(filasEerr.map((f) => f.periodo));
  for (const f of filasEerr) {
    if (f.seccion === "administracion") sumar(fijos, f.unidad_id, f.periodo, gasto(f));
    if (["ingresos", "costo_ventas", "administracion", "marketing"].includes(f.seccion)) sumar(ebitdaTienda, f.unidad_id, f.periodo, efecto(f));
  }

  const historia: HistoriaMes[] = ((hist.data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const unidadId = String(r.unidad_id);
      const periodo = String(r.periodo).slice(0, 10);
      return {
        periodo,
        unidadId,
        pedidos: num(r.pedidos),
        ventas: num(r.ventas),
        entregado: num(r.entregado),
        mercancia: num(r.mercancia),
        envio: num(r.envio),
        devolucion: num(r.devolucion),
        comision: num(r.comision),
        marketing: num(r.marketing),
        fijos: fijos[unidadId]?.[periodo] ?? 0,
        // Para conciliar con el libro (motor «Otros del libro»): solo los meses que el EERR tiene.
        ebitdaLibro: periodosLibro.has(periodo) ? (ebitdaTienda[unidadId]?.[periodo] ?? 0) : null,
      };
    })
    .filter((h) => h.periodo <= corte);

  const guardados = new Map(((editados.data ?? []) as { unidad_id: string; valores: unknown; actualizado_en: string }[]).map((e) => [String(e.unidad_id), e]));
  const ventasDia = new Map<string, number[]>();
  for (const d of (dias.data ?? []) as { unidad_id: string; dia: number; ventas: number | string }[]) {
    const v = ventasDia.get(String(d.unidad_id)) ?? Array(7).fill(0);
    v[Number(d.dia)] = num(d.ventas);
    ventasDia.set(String(d.unidad_id), v);
  }
  const horizonte = mesesDesde(sumarMeses(corte, 1), HORIZONTE_PRONOSTICO);

  const tiendas: TiendaBase[] = tiendasVisibles.map((u) => {
    const propia = historia.filter((h) => h.unidadId === u.id).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const deMes = (m: string) => propia.find((h) => h.periodo === m);
    const { meses, ventas, pedidos, aplica } = pronosticarTienda(propia, mesesHistoria, ventasDia.get(u.id) ?? [], corte, horizonte);
    // Una tienda sin órdenes pero con movimientos en el libro conserva su EBITDA real (fijos + otros del libro).
    const sinOrdenes = (m: string): HistoriaMes => ({ periodo: m, unidadId: u.id, pedidos: 0, ventas: 0, entregado: 0, mercancia: 0, envio: 0, devolucion: 0, comision: 0, marketing: 0, fijos: fijos[u.id]?.[m] ?? 0, ebitdaLibro: periodosLibro.has(m) ? (ebitdaTienda[u.id]?.[m] ?? 0) : null });
    const conLibro = ebitdaTienda[u.id] ? mesesHistoria.slice(-3).filter((m) => periodosLibro.has(m)) : [];
    const motoresHistoria = meses.length
      ? motoresDesdeHistoria(propia.filter((h) => meses.includes(h.periodo)), pedidos.crecimientoMensual)
      : motoresDesdeHistoria(conLibro.map(sinOrdenes), 0);
    const g = guardados.get(u.id);
    const ed = leerMotoresEditados(g?.valores);
    return {
      id: u.id,
      nombre: u.nombre,
      historia: meses.map((m) => deMes(m) ?? { periodo: m, unidadId: u.id, pedidos: 0, ventas: 0, entregado: 0, mercancia: 0, envio: 0, devolucion: 0, comision: 0, marketing: 0, fijos: fijos[u.id]?.[m] ?? 0, ebitdaLibro: periodosLibro.has(m) ? (ebitdaTienda[u.id]?.[m] ?? 0) : null }),
      ventas,
      pedidos,
      explicacion: explicarMetodo(ventas.metodo, meses.length, { diasSemana: aplica }),
      motoresHistoria,
      editados: ed,
      motores: aplicarEditados(motoresHistoria, ed),
      editadoEn: g?.actualizado_en ?? null,
    };
  });

  // Supuestos que salen de los datos (consolidado, últimos 3 meses).
  const ult3 = mesesHistoria.slice(-3);
  const enUlt3 = (f: FilaEerr) => ult3.includes(f.periodo);
  const prom = (pred: (f: FilaEerr) => boolean, v: (f: FilaEerr) => number) => r2(filasEerr.filter((f) => enUlt3(f) && pred(f)).reduce((a, f) => a + v(f), 0) / 3);
  // Todo lo que no es una tienda (corporativo, gestión y también «SIN ASIGNAR», que no sale en las unidades del EERR pero
  // sí suma en su consolidado): así el consolidado proyectado parte del mismo nivel que el real.
  const idsTienda = new Set(todas.filter((u) => u.clase === "tienda").map((u) => u.id));
  const ebitdaCorp = prom((f) => !idsTienda.has(f.unidad_id) && ["ingresos", "costo_ventas", "administracion", "marketing"].includes(f.seccion), efecto);
  const ingresos3 = prom((f) => f.seccion === "ingresos", efecto);
  const costos3 = prom((f) => f.seccion === "costo_ventas" || f.seccion === "marketing", gasto);
  const mercancia3 = r2(historia.filter((h) => ult3.includes(h.periodo)).reduce((a, h) => a + h.mercancia, 0) / 3);
  const cajaMin = (cfg.data ?? []).find((c) => c.clave === "caja_minima")?.valor;
  const filaCfg = (cfg.data ?? []).find((c) => c.clave === CLAVE_PLANIFICACION);

  let apertura: Apertura | null = null;
  const deudaProgramada: Record<string, number> = {};
  const reales: MesReal[] = [];
  if (veTodo && opciones.balance !== false) {
    const futuros = mesesDesde(sumarMeses(corte, 1), 27);
    const [bal, deuda] = await Promise.all([cargarBalance(supabase, [corte], null, mesEnCurso), cargarDeudaCortes(supabase, [corte, ...futuros])]);
    if ("error" in bal) avisos.push(`Sin balance de apertura: ${bal.error}`);
    else {
      avisos.push(...bal.avisos);
      if (bal.sinInventario.length) avisos.push("Sin la foto del inventario al cierre: el inventario de apertura sale en cero.");
      const b = armarBalance([corte], bal.insumos);
      const v = (clave: string) => num(b.filas.find((f) => f.clave === clave)?.valores[0]);
      const prestamos = v("prestamos");
      const sumaDeuda = (m: string) => (deuda?.[m] ?? []).reduce((a, d) => a + d.saldo, 0);
      const manual = r2(prestamos - sumaDeuda(corte));
      apertura = {
        corte,
        caja: v("caja"),
        cxc: v("cxc"),
        inventario: v("inventario"),
        activoFijo: v("bienes"),
        otrosActivos: r2(v("anticipos") + v("otros-activos")),
        cxp: v("cxp"),
        deuda: prestamos,
        otrosPasivos: r2(v("gastos-importacion") + v("tarjetas") + v("otros-pasivos")),
        patrimonio: v("total-patrimonio"),
      };
      if (deuda) for (const m of futuros) deudaProgramada[m] = r2(sumaDeuda(m) + manual);
      else avisos.push("Falta la migración 0932 (deuda): la deuda actual se proyecta sin amortizar.");
    }
    for (const m of mesesHistoria.slice(-6)) {
      const del = filasEerr.filter((f) => f.periodo === m);
      reales.push({
        periodo: m,
        ventas: historia.some((h) => h.periodo === m) ? r2(historia.filter((h) => h.periodo === m).reduce((a, h) => a + h.ventas, 0)) : null,
        ingresos: r2(del.filter((f) => f.seccion === "ingresos").reduce((a, f) => a + efecto(f), 0)),
        ebitda: r2(del.filter((f) => ["ingresos", "costo_ventas", "administracion", "marketing"].includes(f.seccion)).reduce((a, f) => a + efecto(f), 0)),
        caja: m === corte && apertura ? apertura.caja : null,
      });
    }
  }

  const supuestosDatos: SupuestosPlan = {
    ...SUPUESTOS_CERO,
    diasCxc: diasDeRotacion(apertura?.cxc ?? null, ingresos3),
    diasInventario: diasDeRotacion(apertura?.inventario ?? null, mercancia3, 730),
    diasCxp: diasDeRotacion(apertura?.cxp ?? null, costos3),
    tasaImpuesto: valoracion.supuestos.tasaImpuesto,
    depreciacionMes: prom((f) => f.seccion === "depreciacion", gasto),
    financierosMes: Math.max(0, prom((f) => f.seccion === "finanzas", gasto)),
    dividendosMes: Math.max(0, prom((f) => f.seccion === "otros" && /dividendo/i.test(f.tipo), gasto)),
    fijosCorporativo: Math.max(0, -ebitdaCorp),
    cajaMinima: Math.max(0, num(cajaMin)),
  };
  const supuestosEditados = leerSupuestos(filaCfg?.valor, {} as SupuestosPlan) as Partial<SupuestosPlan>;
  for (const k of Object.keys(supuestosEditados) as (keyof SupuestosPlan)[]) if (supuestosEditados[k] === undefined) delete supuestosEditados[k];

  return {
    hoy,
    mesEnCurso,
    corte,
    corteDeCierre: cierre === corte,
    mesesHistoria,
    tiendas,
    ebitdaTienda,
    veTodo,
    avisos,
    sinHistoria,
    sinTablas,
    supuestosDatos,
    supuestosEditados,
    supuestos: { ...supuestosDatos, ...supuestosEditados },
    supuestosEn: (filaCfg?.actualizado_en as string | null) ?? null,
    apertura,
    deudaProgramada,
    multiplo: valoracion.supuestos.multiplo,
    reales,
  };
}

/** La entrada del plan desde la base: `n` meses desde el siguiente al corte. */
export function entradaDesdeBase(base: BasePlan, n: number): EntradaPlan | null {
  if (!base.apertura) return null;
  return {
    meses: mesesDesde(sumarMeses(base.corte, 1), n),
    tiendas: base.tiendas.map((t) => ({ id: t.id, nombre: t.nombre, motores: t.motores })),
    supuestos: base.supuestos,
    apertura: base.apertura,
    deudaProgramada: base.deudaProgramada,
  };
}

/** Meses a proyectar para cubrir hasta diciembre del año pedido (y al menos 18). */
export function mesesHasta(corte: string, anio: number): number {
  const fin = `${anio}-12-01`;
  const n = (Number(fin.slice(0, 4)) - Number(corte.slice(0, 4))) * 12 + Number(fin.slice(5, 7)) - Number(corte.slice(5, 7));
  return Math.max(18, n);
}

// ---------------------------------------------------------------------------------------------------------------------
// Versiones, fotos y escenarios
// ---------------------------------------------------------------------------------------------------------------------

export interface VersionPlan {
  id: string;
  anio: number;
  nombre: string;
  estado: "borrador" | "aprobado" | "reemplazado";
  corte: string;
  creadoEn: string;
  creadoPor: string | null;
  aprobadoEn: string | null;
  aprobadoPor: string | null;
  presupuestoId: string | null;
  foto: DatosFoto | null;
}

const filaVersion = (v: Record<string, unknown>, conFoto: boolean): VersionPlan => ({
  id: String(v.id),
  anio: Number(v.anio),
  nombre: String(v.nombre),
  estado: v.estado as VersionPlan["estado"],
  corte: String(v.corte).slice(0, 10),
  creadoEn: String(v.creado_en),
  creadoPor: (v.creado_por as string | null) ?? null,
  aprobadoEn: (v.aprobado_en as string | null) ?? null,
  aprobadoPor: (v.aprobado_por as string | null) ?? null,
  presupuestoId: (v.presupuesto_id as string | null) ?? null,
  foto: conFoto ? leerFoto((v.datos as { foto?: unknown } | null)?.foto) : null,
});

export async function cargarVersiones(supabase: SupabaseClient, anio: number | null = null): Promise<VersionPlan[] | { error: string }> {
  let q = supabase.from("fin_plan_versiones").select("id, anio, nombre, estado, corte, creado_en, creado_por, aprobado_en, aprobado_por, presupuesto_id").order("creado_en", { ascending: false });
  if (anio) q = q.eq("anio", anio);
  const { data, error } = await q;
  if (error) return { error: SIN_MIGRACION_PLAN };
  return (data ?? []).map((v) => filaVersion(v as Record<string, unknown>, false));
}

/** La versión aprobada de un año, con su foto (null si no hay o falta la migración). */
export async function cargarPlanAprobado(supabase: SupabaseClient, anio: number): Promise<VersionPlan | null> {
  const { data, error } = await supabase.from("fin_plan_versiones").select("*").eq("anio", anio).eq("estado", "aprobado").maybeSingle();
  if (error || !data) return null;
  return filaVersion(data as Record<string, unknown>, true);
}

/** Las fotos aprobadas de los años pedidos, juntas (para comparar un tramo que cruza de año). */
export async function cargarPlanesAprobados(supabase: SupabaseClient, anios: number[]): Promise<DatosFoto | null> {
  const lista = (await Promise.all(anios.map((a) => cargarPlanAprobado(supabase, a)))).filter((v): v is VersionPlan => !!v?.foto);
  if (!lista.length) return null;
  const consolidado = lista.flatMap((v) => v.foto!.consolidado.filter((m) => m.periodo.startsWith(String(v.anio))));
  const porTienda = new Map<string, DatosFoto["tiendas"][number]>();
  for (const v of lista)
    for (const t of v.foto!.tiendas) {
      const previo = porTienda.get(t.id) ?? { id: t.id, nombre: t.nombre, meses: [] };
      previo.meses.push(...t.meses.filter((m) => m.periodo.startsWith(String(v.anio))));
      porTienda.set(t.id, previo);
    }
  return { consolidado, tiendas: [...porTienda.values()] };
}

export interface FotoGuardada {
  periodo: string;
  creadoEn: string;
  foto: DatosFoto;
}

export async function cargarFotos(supabase: SupabaseClient, limite = 13): Promise<FotoGuardada[] | null> {
  const { data, error } = await supabase.from("fin_plan_fotos").select("periodo, datos, creado_en").order("periodo", { ascending: false }).limit(limite);
  if (error) return null;
  return (data ?? []).flatMap((f) => {
    const foto = leerFoto(f.datos);
    return foto ? [{ periodo: String(f.periodo).slice(0, 10), creadoEn: String(f.creado_en), foto }] : [];
  });
}

export interface EscenarioGuardado {
  id: string;
  nombre: string;
  tipo: TipoEscenario;
  parametros: ParametrosEscenario;
  creadoEn: string;
}

export async function cargarEscenarios(supabase: SupabaseClient): Promise<EscenarioGuardado[] | null> {
  const { data, error } = await supabase.from("fin_plan_escenarios").select("id, nombre, tipo, parametros, creado_en").order("creado_en");
  if (error) return null;
  return (data ?? []).flatMap((e) => {
    if (!esTipoEscenario(e.tipo)) return [];
    const p = leerParametros(e.tipo, (e.parametros ?? {}) as Record<string, unknown>);
    return "error" in p ? [] : [{ id: String(e.id), nombre: String(e.nombre), tipo: e.tipo, parametros: p, creadoEn: String(e.creado_en) }];
  });
}

/** La foto del pronóstico de 18 meses al corte actual (lo que guarda el cierre o el botón). */
export async function fotoPronosticoActual(supabase: SupabaseClient): Promise<{ periodo: string; foto: DatosFoto } | { error: string }> {
  const base = await cargarBasePlan(supabase, null);
  if ("error" in base) return base;
  if (base.sinHistoria) return { error: base.sinHistoria };
  const entrada = entradaDesdeBase(base, 18);
  if (!entrada) return { error: "Sin balance de apertura no se puede proyectar." };
  return { periodo: base.corte, foto: fotoDePlan(proyectarPlan(entrada)) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Metas por tienda (Planificación › Metas, Comité y Rentabilidad)
// ---------------------------------------------------------------------------------------------------------------------

export interface MetasMes {
  anio: number;
  mes: string;
  version: { id: string; nombre: string; aprobadoEn: string | null };
  nombres: Record<string, string>;
  /** El mes elegido. */
  delMes: FilaMetaTienda[];
  /** De enero al mes elegido. */
  acumulado: FilaMetaTienda[];
  totalMes: FilaMetaTienda;
  totalAcumulado: FilaMetaTienda;
}

/**
 * Las metas del plan aprobado del año de `mes` contra lo real, por tienda (las permitidas). `{ sinPlan }` si el año no
 * tiene plan aprobado; `{ error }` sin las migraciones.
 */
export async function cargarMetasMes(supabase: SupabaseClient, permitidas: string[] | null, mes: string): Promise<MetasMes | { sinPlan: true; anio: number } | { error: string }> {
  const anio = Number(mes.slice(0, 4));
  const plan = await cargarPlanAprobado(supabase, anio);
  if (!plan?.foto) return { sinPlan: true, anio };
  const tiendas = plan.foto.tiendas.filter((t) => permitidas === null || permitidas.includes(t.id.toLowerCase()));
  const ids = tiendas.map((t) => t.id);
  const meses = mesesDesde(`${anio}-01-01`, Number(mes.slice(5, 7)));
  const [hist, eerr] = await Promise.all([
    supabase.rpc("fin_plan_historia", { p_desde: meses[0], p_hasta: mes, p_unidades: ids.length ? ids : ["00000000-0000-0000-0000-000000000000"] }),
    cargarEerr(supabase, null, meses, { unidades: ids }),
  ]);
  if (hist.error) return { error: SIN_MIGRACION_PLAN };
  const historia = new Map<string, HistoriaMes>();
  for (const r of (hist.data ?? []) as Record<string, unknown>[]) {
    const h: HistoriaMes = {
      periodo: String(r.periodo).slice(0, 10),
      unidadId: String(r.unidad_id),
      pedidos: num(r.pedidos),
      ventas: num(r.ventas),
      entregado: num(r.entregado),
      mercancia: num(r.mercancia),
      envio: num(r.envio),
      devolucion: num(r.devolucion),
      comision: num(r.comision),
      marketing: num(r.marketing),
      fijos: 0,
    };
    historia.set(`${h.unidadId}|${h.periodo}`, h);
  }
  const ebitda = new Map<string, number>();
  for (const f of "error" in eerr ? [] : eerr.filas)
    if (["ingresos", "costo_ventas", "administracion", "marketing"].includes(f.seccion)) ebitda.set(`${f.unidad_id}|${f.periodo}`, r2((ebitda.get(`${f.unidad_id}|${f.periodo}`) ?? 0) + efecto(f)));
  const metas = metasDeFoto({ consolidado: [], tiendas });
  const sinMeta: ValoresMeta = { ventas: null, pedidos: null, tasaEntrega: null, pauta: null, ebitda: null };
  const realDe = (id: string, m: string) => realDeHistoria(historia.get(`${id}|${m}`), "error" in eerr ? null : (ebitda.get(`${id}|${m}`) ?? null));
  const delMes = tiendas.map((t) => filaMeta(t.id, metas.get(t.id)?.get(mes) ?? sinMeta, realDe(t.id, mes)));
  const acumulado = tiendas.map((t) =>
    filaMeta(
      t.id,
      acumular(meses.map((m) => metas.get(t.id)?.get(m) ?? sinMeta)),
      acumular(meses.map((m) => realDe(t.id, m))),
    ),
  );
  const total = (filas: FilaMetaTienda[]) => filaMeta("total", acumular(filas.map((f) => f.meta)), acumular(filas.map((f) => f.real)));
  return {
    anio,
    mes,
    version: { id: plan.id, nombre: plan.nombre, aprobadoEn: plan.aprobadoEn },
    nombres: Object.fromEntries(tiendas.map((t) => [t.id, t.nombre])),
    delMes,
    acumulado,
    totalMes: total(delMes),
    totalAcumulado: total(acumulado),
  };
}
