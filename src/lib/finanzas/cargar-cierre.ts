// Lectura de Supabase para el Cierre de mes (migración 0914): los cierres guardados, lo que mira el checklist de cada
// mes y la fotografía del EERR, el flujo y la cartera. Solo lectura; los permisos los decide quien llama. Cada fuente se
// lee por su cuenta: si una tabla no existe (migración sin correr), su tarea queda «no disponible» y lo demás sigue.

import { cuadreVentasMeses } from "@/lib/quickbooks/cargar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarIngresosLibro } from "@/lib/ventas/cargar";
import { TIPOS_SUELDO } from "@/lib/nomina/conciliacion";
import { cargarFlujo } from "./cargar-flujo";
import { cargarDatosControl } from "./cargar-cierre-control";
import { PAGOS_TARJETA, SIN_CUENTA, resumirFlujo } from "./flujo";
import { UNIDAD_SIN_ASIGNAR } from "./libro-excel";
import { resumirCartera, type TotalCartera } from "./panel";
import type { FilaEerr, Seccion } from "./eerr";
import {
  combinarTareas,
  evaluarTareas,
  finDeMes,
  juevesDelMes,
  mesDe,
  resumirEerrMes,
  type DatosMes,
  type MarcaTarea,
  type TareaCierre,
  type EstadoCierre,
  type EstadoTarea,
  type Fotografia,
  type ResultadoAuto,
} from "./cierre";

export const SIN_MIGRACION_CIERRE = "Falta correr la migración 0914 (cierre de mes) en Supabase.";

const mes = (v: unknown) => String(v).slice(0, 10);

export interface CierreGuardado {
  id: string;
  periodo: string;
  estado: EstadoCierre;
  notas: string | null;
  enviado_revision_en: string | null;
  enviado_revision_por: string | null;
  cerrado_en: string | null;
  cerrado_por: string | null;
  reabierto_en: string | null;
  reabierto_por: string | null;
  motivo_reapertura: string | null;
  veces_cerrado: number;
  fotografia: unknown;
}

export interface TareaGuardada {
  cierre_id: string;
  clave: string;
  estado: EstadoTarea;
  a_mano: boolean;
  automatico: ResultadoAuto | null;
  comentario: string | null;
  marcado_por: string | null;
  marcado_en: string | null;
}

const COLUMNAS_CIERRE =
  "id, periodo, estado, notas, enviado_revision_en, enviado_revision_por, cerrado_en, cerrado_por, reabierto_en, reabierto_por, motivo_reapertura, veces_cerrado";

/** Los cierres guardados (sin la fotografía, salvo que se pida un mes) y las marcas de su checklist. */
export async function cargarCierres(
  supabase: SupabaseClient,
  periodo?: string,
): Promise<{ error: string } | { cierres: CierreGuardado[]; tareas: TareaGuardada[] }> {
  let q = supabase.from("fin_cierres").select(periodo ? `${COLUMNAS_CIERRE}, fotografia` : COLUMNAS_CIERRE).order("periodo");
  if (periodo) q = q.eq("periodo", periodo);
  const { data, error } = await q;
  if (error) return { error: SIN_MIGRACION_CIERRE };
  const cierres = ((data ?? []) as unknown as CierreGuardado[]).map((c) => ({ ...c, periodo: mes(c.periodo), fotografia: c.fotografia ?? null }));
  if (!cierres.length) return { cierres, tareas: [] };
  const t = await supabase
    .from("fin_cierre_tareas")
    .select("cierre_id, clave, estado, a_mano, automatico, comentario, marcado_por, marcado_en")
    .in("cierre_id", cierres.map((c) => c.id));
  if (t.error) return { error: SIN_MIGRACION_CIERRE };
  return { cierres, tareas: (t.data ?? []) as TareaGuardada[] };
}

/** Nombre de cada persona (para «cerrado por…»). */
export async function nombresDePersonas(supabase: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unicos.length) return new Map();
  const { data } = await supabase.from("perfiles").select("id, nombre, email").in("id", unicos);
  return new Map((data ?? []).map((p) => [p.id as string, (p.nombre as string | null) || (p.email as string | null) || "—"]));
}

// ---------------------------------------------------------------------------------------------
// Datos del checklist
// ---------------------------------------------------------------------------------------------
type Lectura<T> = { data: T[] | null; error: unknown };

const sumarPor = <T>(filas: T[], clave: (f: T) => string, valor: (f: T) => number) => {
  const m = new Map<string, number>();
  for (const f of filas) m.set(clave(f), (m.get(clave(f)) ?? 0) + valor(f));
  return m;
};

/** Lo que mira el checklist, para cada mes pedido. */
export async function cargarDatosMeses(supabase: SupabaseClient, meses: string[]): Promise<Map<string, DatosMes>> {
  const salida = new Map<string, DatosMes>();
  if (!meses.length) return salida;
  const desde = meses[0];
  const hasta = meses[meses.length - 1];
  const jueves = meses.flatMap(juevesDelMes);
  const juevesDesde = jueves[0] ?? desde;
  const juevesHasta = jueves[jueves.length - 1] ?? finDeMes(hasta);

  const [unidades, cuentas, tiposSueldo] = await Promise.all([
    supabase.from("fin_unidades").select("id, nombre"),
    supabase.from("fin_cuentas").select("id, nombre"),
    supabase.from("fin_tipos").select("id").in("nombre", TIPOS_SUELDO),
  ]);
  const nombreUnidad = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  const nombreCuenta = new Map((cuentas.data ?? []).map((c) => [c.id as string, c.nombre as string]));
  const idsSueldo = (tiposSueldo.data ?? []).map((t) => t.id as string);

  // Las tareas de Cierre y control (migración 0927) se leen en paralelo.
  const controlP = cargarDatosControl(supabase, meses).catch(() => new Map<string, never>());
  // Ventas contra QuickBooks (migración 0950): `undefined` sin conectar (la tarea no aparece).
  const qboP = cuadreVentasMeses(supabase, meses).catch(() => undefined);
  const [sinTipo, sinTienda, reparto, base, ventas, ingresosLibro, conc, nomPeriodos, nomCostos, sueldosLibro, cierresDel, semanasDel, eerr, flujo] =
    await Promise.all([
      supabase.from("fin_movimientos_sin_tipo").select("periodo, movimientos").gte("periodo", desde).lte("periodo", hasta),
      traerTodasConError<{ periodo: string }>((d, h) =>
        supabase
          .from("fin_movimientos")
          .select("periodo, fin_unidades!inner(nombre)")
          .eq("fin_unidades.nombre", UNIDAD_SIN_ASIGNAR)
          .gte("periodo", desde)
          .lte("periodo", hasta)
          .order("id")
          .range(d, h) as unknown as PromiseLike<Lectura<{ periodo: string }>>,
      ),
      supabase.from("fin_reparto_pendiente").select("periodo, monto").gte("periodo", desde).lte("periodo", hasta),
      supabase
        .from("fin_base_distribucion")
        .select("periodo, envios, fin_unidades!inner(recibe_reparto)")
        .eq("fin_unidades.recibe_reparto", true)
        .gte("periodo", desde)
        .lte("periodo", hasta),
      traerTodasConError<{ periodo: string; unidad_id: string; ordenes: number; ventas_entregadas: number | string }>((d, h) =>
        supabase
          .from("ven_resumen_mensual")
          .select("periodo, unidad_id, ordenes, ventas_entregadas")
          .gte("periodo", desde)
          .lte("periodo", hasta)
          .order("periodo")
          .order("unidad_id")
          .range(d, h),
      ),
      cargarIngresosLibro(supabase, desde),
      // Todos los meses: de aquí sale desde cuándo se concilia cada cuenta.
      supabase.from("conc_resumen_mensual").select("cuenta_id, mes, lineas, pendientes, sugeridas"),
      supabase.from("nom_periodos").select("periodo, tipo"),
      supabase.from("nom_costo_mensual").select("periodo, neto").gte("periodo", desde).lte("periodo", hasta),
      idsSueldo.length
        ? traerTodasConError<{ periodo: string; monto: number | string }>((d, h) =>
            supabase
              .from("fin_movimientos")
              .select("periodo, monto")
              .in("tipo_id", idsSueldo)
              .eq("en_eerr", true)
              .gte("periodo", desde)
              .lte("periodo", hasta)
              .order("id")
              .range(d, h),
          )
        : Promise.resolve({ data: [], error: tiposSueldo.error }),
      supabase.from("del_cierres").select("repartidor_id, semana, estado").gte("semana", juevesDesde).lte("semana", juevesHasta),
      supabase.from("del_semanas").select("repartidor_id, semana").gte("semana", juevesDesde).lte("semana", juevesHasta),
      traerTodasConError<{ periodo: string; seccion: string; signo: number; monto: number | string }>((d, h) =>
        supabase
          .from("fin_eerr_mensual")
          .select("periodo, seccion, signo, monto")
          .in("seccion", ["ingresos", "costo_ventas"])
          .gte("periodo", desde)
          .lte("periodo", hasta)
          .order("periodo")
          .order("unidad_id")
          .order("tipo_id")
          .range(d, h),
      ),
      cargarFlujo(supabase),
    ]);
  const control = await controlP;
  const qbo = await qboP;

  // Por mes
  const sinTipoMes = sinTipo.error ? null : sumarPor(sinTipo.data ?? [], (r) => mes(r.periodo), (r) => Number(r.movimientos));
  const sinTiendaMes = sinTienda.error ? null : sumarPor(sinTienda.data ?? [], (r) => mes(r.periodo), () => 1);
  const repartoMes = reparto.error ? null : sumarPor(reparto.data ?? [], (r) => mes(r.periodo), (r) => Number(r.monto));
  const enviosMes = base.error ? null : sumarPor(base.data ?? [], (r) => mes(r.periodo), (r) => Number(r.envios));
  const ventasFilas = ventas.error ? null : (ventas.data ?? []).map((v) => ({ ...v, periodo: mes(v.periodo) }));
  const ingresos = new Map(ingresosLibro.map((l) => [`${l.periodo}|${l.unidad_id}`, l.bruto]));

  const concFilas = conc.error ? null : (conc.data ?? []).map((c) => ({ ...c, mes: mes(c.mes) }));
  const primerMesCuenta = new Map<string, string>();
  for (const c of concFilas ?? []) if (!primerMesCuenta.has(c.cuenta_id) || c.mes < primerMesCuenta.get(c.cuenta_id)!) primerMesCuenta.set(c.cuenta_id, c.mes);

  const nomFilas = nomPeriodos.error ? null : (nomPeriodos.data ?? []).map((p) => ({ periodo: mes(p.periodo), tipo: String(p.tipo) }));
  const primerMesTipo = new Map<string, string>();
  for (const p of nomFilas ?? []) if (!primerMesTipo.has(p.tipo) || p.periodo < primerMesTipo.get(p.tipo)!) primerMesTipo.set(p.tipo, p.periodo);
  const nominaMes = nomCostos.error ? null : sumarPor(nomCostos.data ?? [], (r) => mes(r.periodo), (r) => Number(r.neto));
  const sueldosMes = sueldosLibro.error ? null : sumarPor(sueldosLibro.data ?? [], (r) => mes(r.periodo), (r) => Number(r.monto));

  // Deliverys: cada repartidor y semana (de los cierres o de las entregas sin cierre), con el mes de su jueves.
  const semanas = cierresDel.error ? null : new Map<string, { mes: string; pagado: boolean }>();
  if (semanas) {
    for (const c of cierresDel.data ?? []) semanas.set(`${c.repartidor_id}|${mes(c.semana)}`, { mes: mesDe(mes(c.semana))!, pagado: c.estado === "pagado" });
    for (const s of semanasDel.error ? [] : (semanasDel.data ?? [])) {
      const k = `${s.repartidor_id}|${mes(s.semana)}`;
      if (!semanas.has(k)) semanas.set(k, { mes: mesDe(mes(s.semana))!, pagado: false });
    }
  }

  const eerrMes = eerr.error ? null : new Map<string, { ingresos: number; costo: number }>();
  if (eerrMes) {
    for (const f of eerr.data ?? []) {
      const m = mes(f.periodo);
      const x = eerrMes.get(m) ?? { ingresos: 0, costo: 0 };
      const efecto = Number(f.monto) * Number(f.signo);
      if (f.seccion === "ingresos") x.ingresos += efecto;
      else x.costo -= efecto;
      eerrMes.set(m, x);
    }
  }

  for (const m of meses) {
    const ventasDelMes = ventasFilas?.filter((v) => v.periodo === m && Number(v.ordenes) > 0) ?? [];
    let saldos: DatosMes["saldos"] = null;
    if (!("error" in flujo)) {
      const r = resumirFlujo(flujo.filas, flujo.saldos, flujo.cuentas, [m]);
      const reales = r.cuentas.filter((c) => c.id !== SIN_CUENTA && c.id !== PAGOS_TARJETA && (c.entradas[m] || c.salidas[m] || c.traspasos[m]));
      saldos = { conMovimiento: reales.length, sinSaldo: reales.filter((c) => !c.conSaldo).map((c) => c.nombre) };
    }
    const semanasMes = semanas ? [...semanas.values()].filter((s) => s.mes === m) : null;
    salida.set(m, {
      sinTipo: sinTipoMes ? (sinTipoMes.get(m) ?? 0) : null,
      sinTienda: sinTiendaMes ? (sinTiendaMes.get(m) ?? 0) : null,
      reparto: repartoMes && enviosMes ? { sinRepartir: Math.round((repartoMes.get(m) ?? 0) * 100) / 100, envios: enviosMes.get(m) ?? 0 } : null,
      ventas: ventasFilas ? { ordenes: ventasDelMes.reduce((a, v) => a + Number(v.ordenes), 0), tiendas: new Set(ventasDelMes.map((v) => v.unidad_id)).size } : null,
      cuadreVentas: ventasFilas
        ? ventasDelMes.map((v) => ({
            tienda: nombreUnidad.get(v.unidad_id) ?? "—",
            ventas: Number(v.ventas_entregadas),
            ingresos: ingresos.get(`${m}|${v.unidad_id}`) ?? null,
          }))
        : null,
      conciliacion: concFilas
        ? [...primerMesCuenta]
            .filter(([, primero]) => primero <= m)
            .map(([cuentaId]) => {
              const f = concFilas.find((c) => c.cuenta_id === cuentaId && c.mes === m);
              return { cuenta: nombreCuenta.get(cuentaId) ?? "—", lineas: Number(f?.lineas ?? 0), porConciliar: Number(f?.pendientes ?? 0) + Number(f?.sugeridas ?? 0) };
            })
            .sort((a, b) => a.cuenta.localeCompare(b.cuenta))
        : null,
      nomina: nomFilas
        ? {
            esperados: [...primerMesTipo].filter(([, primero]) => primero <= m).map(([tipo]) => tipo).sort(),
            importados: [...new Set(nomFilas.filter((p) => p.periodo === m).map((p) => p.tipo))].sort(),
          }
        : null,
      nominaLibro: nominaMes && sueldosMes ? { nomina: Math.round((nominaMes.get(m) ?? 0) * 100) / 100, libro: Math.round((sueldosMes.get(m) ?? 0) * 100) / 100 } : null,
      deliverys: semanasMes ? { semanas: semanasMes.length, sinPagar: semanasMes.filter((s) => !s.pagado).length } : null,
      costoVentas: eerrMes ? (eerrMes.get(m) ?? { ingresos: 0, costo: 0 }) : null,
      saldos,
      devengos: control.get(m)?.devengos ?? null,
      provisiones: control.get(m)?.provisiones ?? null,
      cuadreInventario: control.get(m)?.cuadreInventario ?? null,
      cuadreDropi: control.get(m)?.cuadreDropi ?? null,
      variaciones: control.get(m)?.variaciones ?? null,
      ...(qbo ? { quickbooks: qbo.get(m) ?? null } : {}),
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Fotografía
// ---------------------------------------------------------------------------------------------
/** El EERR consolidado y por tienda, el flujo y la cartera del mes, como se ven ahora. */
export async function tomarFotografia(supabase: SupabaseClient, periodo: string): Promise<Fotografia> {
  const [eerr, tipos, unidades, flujo, cartera] = await Promise.all([
    traerTodasConError<{ periodo: string; unidad_id: string; tipo_id: string; seccion: Seccion; signo: number; monto: number | string }>((d, h) =>
      supabase
        .from("fin_eerr_mensual")
        .select("periodo, unidad_id, tipo_id, seccion, signo, monto")
        .eq("periodo", periodo)
        .order("unidad_id")
        .order("tipo_id")
        .range(d, h),
    ),
    supabase.from("fin_tipos").select("id, nombre, orden"),
    supabase.from("fin_unidades").select("id, nombre"),
    cargarFlujo(supabase),
    supabase.rpc("fin_cartera_al", { p_corte: finDeMes(periodo) }),
  ]);

  let fotoEerr: Fotografia["eerr"] = null;
  if (!eerr.error && !tipos.error) {
    const porId = new Map((tipos.data ?? []).map((t) => [t.id as string, { nombre: t.nombre as string, orden: t.orden as number }]));
    const filas: FilaEerr[] = (eerr.data ?? []).map((f) => ({
      periodo: mes(f.periodo),
      unidad_id: f.unidad_id,
      tipo: porId.get(f.tipo_id)?.nombre ?? "—",
      orden: porId.get(f.tipo_id)?.orden ?? 999,
      seccion: f.seccion,
      signo: Number(f.signo),
      monto: Number(f.monto),
    }));
    fotoEerr = resumirEerrMes(filas, periodo, new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string])));
  }

  let fotoFlujo: Fotografia["flujo"] = null;
  if (!("error" in flujo)) {
    const r = resumirFlujo(flujo.filas, flujo.saldos, flujo.cuentas, [periodo]);
    const neto = (b: string) => r.estado.bloques.find((x) => x.bloque === b)?.neto[periodo] ?? 0;
    fotoFlujo = {
      entradas: r.estado.entradas[periodo] ?? 0,
      salidas: r.estado.salidas[periodo] ?? 0,
      neto: r.estado.neto[periodo] ?? 0,
      operativo: neto("operativo"),
      inversion: neto("inversion"),
      financiamiento: neto("financiamiento"),
      cajaFinal: r.caja.final[periodo] ?? 0,
      cuentas: r.cuentas.map((c) => ({ cuentaId: c.id, nombre: c.nombre, final: c.final[periodo] ?? 0 })),
    };
  }

  let fotoCartera: Fotografia["cartera"] = null;
  if (!cartera.error) {
    const c = resumirCartera((cartera.data ?? []) as TotalCartera[]);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    fotoCartera = { porCobrar: r2(c.porCobrar), cobrarVencido: r2(c.cobrarVencido), porPagar: r2(c.porPagar), pagarVencido: r2(c.pagarVencido) };
  }

  return { version: 1, tomadaEn: new Date().toISOString(), eerr: fotoEerr, flujo: fotoFlujo, cartera: fotoCartera };
}

// ---------------------------------------------------------------------------------------------
// Estado de cada mes (lista, detalle y Panel financiero)
// ---------------------------------------------------------------------------------------------
export interface MesCierre {
  periodo: string;
  cierre: CierreGuardado | null;
  estado: EstadoCierre;
  tareas: TareaCierre[];
}

/** Cada mes pedido con su cierre (si existe) y su checklist evaluado ahora y combinado con las marcas a mano. */
export async function cargarMesesCierre(supabase: SupabaseClient, meses: string[], periodo?: string): Promise<{ error: string } | MesCierre[]> {
  const [guardados, datos] = await Promise.all([cargarCierres(supabase, periodo), cargarDatosMeses(supabase, meses)]);
  if ("error" in guardados) return guardados;
  return meses.map((m) => {
    const cierre = guardados.cierres.find((c) => c.periodo === m) ?? null;
    const marcas: MarcaTarea[] = cierre
      ? guardados.tareas
          .filter((t) => t.cierre_id === cierre.id)
          .map((t) => ({ clave: t.clave, estado: t.estado, aMano: t.a_mano, comentario: t.comentario, marcadoPor: t.marcado_por, marcadoEn: t.marcado_en }))
      : [];
    return { periodo: m, cierre, estado: cierre?.estado ?? "abierto", tareas: combinarTareas(evaluarTareas(m, datos.get(m)!), marcas) };
  });
}

/** El primer mes con movimientos en el libro (o null). */
export async function primerMesDelLibro(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1);
  return error || !data?.length ? null : mes(data[0].periodo);
}
