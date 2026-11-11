// Lectura del Comité de dirección (Panel financiero › Comité, mejora 5) y del techo de pauta por tienda (mejora 6). Junta
// lo que ya tiene el portal: el EERR consolidado sin intercompañía (`fin_eerr_partes`, 0142), las tiendas por mes
// (`fin_comite_tiendas_mes`, 0155), el inventario al cierre (`fin_inventario_cortes`, 0143), la deuda de Tesorería
// (`fin_deuda_al`, 0145), los cierres (`fin_cierres`, 0127) y el acta (`fin_comite_acta`, 0155). Cada fuente que falta deja
// su indicador en «Sin datos» con lo que falta; nada se inventa. Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarMeses } from "@/lib/af4/fecha";
import type { UsuarioActual } from "@/lib/auth";
import { cargarTiendasPermitidas } from "./cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "./tiendas-permitidas";
import { cargarDeudaCortes, cargarInventarioCortes, ENTIDAD_INVENTARIO } from "./cargar-balance";
import { tasaEfectivaAnualCiclo } from "./deuda";
import { cargarEerr } from "./cargar-eerr";
import { cargarEntidades, entidadDeUnidades } from "./cargar-entidades";
import { cargarPartes } from "./cargar-partes";
import { CLAVE_COMITE, configPredeterminada, leerConfigComite, type ConfigComite, type Decision, type EstadoDecision } from "./comite";
import { armarEerr, type Eerr } from "./eerr";
import { CLAVE_TECHO_PAUTA, filaTiendaMes, leerTecho, tiendasPropias, type ConfigTecho, type FilaTiendaMes, type UnidadPauta } from "./pauta";
import { pesosReparto, repartirEerr } from "./reparto";

export const SIN_MIGRACION_COMITE = "Falta correr la migración 0942 (comité de dirección) en Supabase.";

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Quien edita el comité: abre el Panel, puede modificar el Panel o el Estado de resultados y ve toda la empresa. */
export async function puedeEditarComite(u: UsuarioActual): Promise<boolean> {
  const escribe = (m: string) => u.modulos.includes(m) && !u.modulosSoloLectura.includes(m);
  return u.modulos.includes("panel-financiero") && (escribe("panel-financiero") || escribe("estado-resultados")) && veTodaLaEmpresa(await cargarTiendasPermitidas());
}

export interface ConfigComiteGuardada {
  config: ConfigComite;
  guardada: boolean;
  actualizadoEn: string | null;
}

export async function cargarConfigComite(supabase: SupabaseClient): Promise<ConfigComiteGuardada> {
  const { data, error } = await supabase.from("fin_config").select("valor, actualizado_en").eq("clave", CLAVE_COMITE).maybeSingle();
  if (error || !data) return { config: configPredeterminada(), guardada: false, actualizadoEn: null };
  return { config: leerConfigComite(data.valor), guardada: true, actualizadoEn: (data.actualizado_en as string | null) ?? null };
}

export async function cargarTecho(supabase: SupabaseClient): Promise<{ techo: ConfigTecho; guardado: boolean }> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_TECHO_PAUTA).maybeSingle();
  return { techo: leerTecho(error ? null : data?.valor), guardado: !error && !!data };
}

/** Las unidades con su canal (sin la migración 0929, sin canal). */
export async function cargarUnidadesPauta(supabase: SupabaseClient): Promise<UnidadPauta[]> {
  let r = await supabase.from("fin_unidades").select("id, nombre, clase, canal, activo").order("orden");
  if (r.error) r = (await supabase.from("fin_unidades").select("id, nombre, clase, activo").order("orden")) as typeof r;
  if (r.error) return [];
  return ((r.data ?? []) as Record<string, unknown>[])
    .filter((u) => u.activo !== false)
    .map((u) => ({ id: String(u.id), nombre: String(u.nombre ?? ""), clase: String(u.clase ?? ""), canal: (u.canal as string | null | undefined) ?? null }));
}

/** Las tiendas por mes de `fin_comite_tiendas_mes` (0155). */
export async function cargarTiendasMes(supabase: SupabaseClient, desde: string, hasta: string, corte: string): Promise<FilaTiendaMes[] | { error: string }> {
  const { data, error } = await supabase.rpc("fin_comite_tiendas_mes", { p_desde: desde, p_hasta: hasta, p_corte: corte });
  if (error) {
    console.error("fin_comite_tiendas_mes:", error.message);
    return { error: SIN_MIGRACION_COMITE };
  }
  return ((data ?? []) as Record<string, unknown>[]).map(filaTiendaMes);
}

export interface BasePauta {
  filas: FilaTiendaMes[];
  unidades: UnidadPauta[];
  propias: string[];
  techo: ConfigTecho;
  config: ConfigComite;
  nombre: (id: string) => string;
}

/** Lo que hace falta para el techo de pauta: las tiendas por mes, cuáles son propias y su techo. */
export async function cargarBasePauta(supabase: SupabaseClient, desde: string, hasta: string, hoy: string): Promise<BasePauta | { error: string }> {
  const [filas, unidades, cfg, techo] = await Promise.all([cargarTiendasMes(supabase, desde, hasta, hoy), cargarUnidadesPauta(supabase), cargarConfigComite(supabase), cargarTecho(supabase)]);
  if ("error" in filas) return filas;
  const nombres = new Map(unidades.map((u) => [u.id, u.nombre]));
  return {
    filas,
    unidades,
    propias: tiendasPropias(unidades, cfg.config.tiendasPropias),
    techo: techo.techo,
    config: cfg.config,
    nombre: (id) => nombres.get(id) ?? "—",
  };
}

/**
 * El EERR consolidado sin intercompañía (con la base de reparto guardada). Sin la migración 0929, el de la vista de siempre
 * (`sinIntercompania` false: el indicador lo dice).
 */
export async function cargarEerrConsolidado(supabase: SupabaseClient, ventana: string[]): Promise<{ eerr: Eerr; sinIntercompania: boolean } | { error: string }> {
  const partes = await cargarPartes(supabase, ventana);
  if (!("error" in partes)) {
    const rep = repartirEerr(partes.partes, pesosReparto(partes.basePredeterminada, partes.partes, partes.envios, partes.unidades), { sinIntercompania: true });
    return { eerr: armarEerr(rep.filas, ventana), sinIntercompania: true };
  }
  const r = await cargarEerr(supabase, null, ventana);
  if ("error" in r) return r;
  return { eerr: armarEerr(r.filas, ventana), sinIntercompania: false };
}

/** El costo de lo vendido por mes de Panamá (mercancía + otros costos de venta, de `fin_rentabilidad_libro`). */
export async function cargarCostoVendidoMes(supabase: SupabaseClient, desde: string, hasta: string): Promise<Record<string, number> | null> {
  const [r, entidades, deUnidad] = await Promise.all([
    supabase.from("fin_rentabilidad_libro").select("periodo, unidad_id, mercancia, otros_variables").gte("periodo", desde).lte("periodo", hasta).limit(5000),
    cargarEntidades(supabase),
    entidadDeUnidades(supabase),
  ]);
  if (r.error) return null;
  const pa = entidades.find((e) => e.codigo === ENTIDAD_INVENTARIO)?.id ?? null;
  const out: Record<string, number> = {};
  for (const f of (r.data ?? []) as Record<string, unknown>[]) {
    const ent = deUnidad.get(String(f.unidad_id));
    if (pa && ent && ent !== pa) continue;
    const m = String(f.periodo).slice(0, 10);
    out[m] = (out[m] ?? 0) + num(f.mercancia) + num(f.otros_variables);
  }
  return out;
}

export interface DeudaComite {
  /** Saldo total al cierre de cada mes. */
  porMes: Record<string, number>;
  /** Las líneas al último corte con su tasa (fracción anual), para la tasa contractual. */
  lineas: { saldo: number; tasaAnual: number | null }[];
}

export async function cargarDeudaComite(supabase: SupabaseClient, meses: string[]): Promise<DeudaComite | null> {
  const [cortes, prestamos, lineas, ciclos] = await Promise.all([
    cargarDeudaCortes(supabase, meses),
    supabase.from("fin_prestamos").select("id, tasa_anual"),
    supabase.from("fin_lineas_credito").select("id, tasa_anual"),
    supabase.from("fin_financiamientos_ciclo").select("id, tasa_ciclo, dias_ciclo"),
  ]);
  if (!cortes) return null;
  const tasas = new Map<string, number>();
  for (const p of [...(prestamos.error ? [] : (prestamos.data ?? [])), ...(lineas.error ? [] : (lineas.data ?? []))] as Record<string, unknown>[]) {
    tasas.set(String(p.id), num(p.tasa_anual));
  }
  // Los giros por ciclo (0159) entran en la deuda de `fin_deuda_al`: su tasa contractual es la efectiva anual del ciclo.
  for (const c of (ciclos.error ? [] : (ciclos.data ?? [])) as Record<string, unknown>[]) {
    tasas.set(String(c.id), tasaEfectivaAnualCiclo(num(c.tasa_ciclo), num(c.dias_ciclo)));
  }
  const porMes = Object.fromEntries(Object.entries(cortes).map(([m, ls]) => [m, ls.reduce((a, l) => a + l.saldo, 0)]));
  const ultimo = [...meses].reverse().find((m) => cortes[m]);
  return { porMes, lineas: ultimo ? cortes[ultimo].map((l) => ({ saldo: l.saldo, tasaAnual: tasas.get(l.id) ?? null })) : [] };
}

/** Los cierres (fecha de cierre en hora de Panamá) de los meses dados. null sin la migración 0914. */
export async function cargarCierresComite(supabase: SupabaseClient, meses: string[]): Promise<Record<string, string | null> | null> {
  const { data, error } = await supabase.from("fin_cierres").select("periodo, estado, cerrado_en").in("periodo", meses);
  if (error) return null;
  const out: Record<string, string | null> = Object.fromEntries(meses.map((m) => [m, null]));
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    if (c.estado !== "cerrado" || !c.cerrado_en) continue;
    out[String(c.periodo).slice(0, 10)] = new Date(String(c.cerrado_en)).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  }
  return out;
}

/** El acta: todas las decisiones (las más nuevas primero, hasta 500). null sin la migración 0942. */
export async function cargarActa(supabase: SupabaseClient): Promise<Decision[] | null> {
  const { data, error } = await supabase
    .from("fin_comite_acta")
    .select("id, periodo, decision, responsable, fecha_compromiso, estado, seguimiento, actualizado_en")
    .order("periodo", { ascending: false })
    .order("creado_en")
    .limit(500);
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    periodo: String(d.periodo).slice(0, 10),
    decision: String(d.decision ?? ""),
    responsable: (d.responsable as string | null) ?? null,
    fechaCompromiso: d.fecha_compromiso ? String(d.fecha_compromiso).slice(0, 10) : null,
    estado: (d.estado as EstadoDecision) ?? "pendiente",
    seguimiento: (d.seguimiento as string | null) ?? null,
    actualizadoEn: String(d.actualizado_en ?? ""),
  }));
}

export interface DatosComite {
  /** Los 12 meses de la serie, el último es el del comité. */
  meses: string[];
  eerr: { eerr: Eerr; sinIntercompania: boolean } | null;
  base: BasePauta | { error: string };
  inventario: { valores: Record<string, number | null>; vivo: number | null; faltaMigracion: boolean };
  costoVendido: Record<string, number> | null;
  deuda: DeudaComite | null;
  cierres: Record<string, string | null> | null;
  acta: Decision[] | null;
  config: ConfigComiteGuardada;
}

/** Todo lo del comité de un mes, en paralelo. `mesEnCurso` deja pedir también el techo de pauta del mes en curso. */
export async function cargarDatosComite(supabase: SupabaseClient, mesComite: string, mesEnCurso: string, hoy: string): Promise<DatosComite> {
  const meses = Array.from({ length: 12 }, (_, i) => sumarMeses(mesComite, i - 11));
  const desde = sumarMeses(meses[0], -2);
  const conPrevios = [sumarMeses(meses[0], -1), ...meses];
  const ventanaEerr = Array.from({ length: 14 }, (_, i) => sumarMeses(desde, i));
  const hastaTiendas = mesEnCurso > mesComite ? mesEnCurso : mesComite;
  const [eerr, base, inventario, costoVendido, deuda, cierres, acta, config] = await Promise.all([
    cargarEerrConsolidado(supabase, ventanaEerr),
    cargarBasePauta(supabase, desde, hastaTiendas, hoy),
    cargarInventarioCortes(supabase, [...meses, ...(meses.includes(mesEnCurso) ? [] : [mesEnCurso])], mesEnCurso),
    cargarCostoVendidoMes(supabase, desde, mesComite),
    cargarDeudaComite(supabase, conPrevios),
    cargarCierresComite(supabase, meses),
    cargarActa(supabase),
    cargarConfigComite(supabase),
  ]);
  return { meses, eerr: "error" in eerr ? null : eerr, base, inventario, costoVendido, deuda, cierres, acta, config };
}
