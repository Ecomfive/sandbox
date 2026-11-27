// Anuncios Meta › vigilancias (24 nov 2026, pedido de Alcides): lo que la persona le pide al chat de Hallazgos que le indique «desde ahora», con la prioridad que diga, y lo que el sistema empieza a vigilar solo cuando una misma pregunta se repite.
// Viven en `meta_ajustes` (sin migración nueva): la lista de vigilancias (`vigilancias:<país>`) y el último resultado de evaluarlas (`vigilancias_resultado:<país>`), que se recalcula cada día con el análisis del historial y al crear una.
// Nunca toca Meta: solo lee los resultados por día que ya están guardados.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarBaseDias } from "./base-dias";
import { evaluarVigilancia, validarPrioridad, validarVigilancia, type Prioridad, type ResultadoVigilancia, type VigilanciaSpec } from "./analisis-pedido";

export const MAX_VIGILANCIAS = 15;
/** Cuántas veces se pregunta lo mismo (en 3 semanas) antes de que el sistema empiece a vigilarlo solo. */
export const VECES_PARA_VIGILAR = 3;
export const DIAS_DE_INSISTENCIA = 21;

export interface Vigilancia {
  id: string;
  spec: VigilanciaSpec;
  prioridad: Prioridad;
  origen: "chat" | "insistencia";
  activa: boolean;
  creadaPor: string;
  creadaEn: string;
  /** La pregunta o frase con que se pidió. */
  pregunta: string | null;
  /** La llave del tema de análisis del que salió (para no crear dos por insistencia). */
  tema: string | null;
}

export const claveDeVigilancias = (paisId: string) => `vigilancias:${paisId}`;
export const claveDeResultados = (paisId: string) => `vigilancias_resultado:${paisId}`;

export function leerListaVigilancias(valor: unknown): Vigilancia[] {
  const items = valor && typeof valor === "object" ? (valor as { items?: unknown }).items : null;
  if (!Array.isArray(items)) return [];
  const out: Vigilancia[] = [];
  for (const i of items) {
    if (!i || typeof i !== "object") continue;
    const o = i as Record<string, unknown>;
    const spec = validarVigilancia(o.spec);
    if (!spec || typeof o.id !== "string") continue;
    out.push({
      id: o.id,
      spec,
      prioridad: validarPrioridad(o.prioridad),
      origen: o.origen === "insistencia" ? "insistencia" : "chat",
      activa: o.activa !== false,
      creadaPor: typeof o.creadaPor === "string" ? o.creadaPor : "—",
      creadaEn: typeof o.creadaEn === "string" ? o.creadaEn : new Date(0).toISOString(),
      pregunta: typeof o.pregunta === "string" ? o.pregunta : null,
      tema: typeof o.tema === "string" ? o.tema : null,
    });
  }
  return out;
}

export interface ResultadosGuardados {
  generadoEn: string;
  resultados: ResultadoVigilancia[];
}
export function leerValorResultados(valor: unknown): ResultadosGuardados | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<ResultadosGuardados>;
  return typeof v.generadoEn === "string" && Array.isArray(v.resultados) ? { generadoEn: v.generadoEn, resultados: v.resultados } : null;
}

async function leerValor(supabase: SupabaseClient, clave: string): Promise<unknown> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor").eq("clave", clave).maybeSingle();
    return error ? null : (data?.valor ?? null);
  } catch {
    return null;
  }
}
async function guardar(supabase: SupabaseClient, clave: string, valor: unknown, quien: string): Promise<boolean> {
  const { error } = await supabase.from("meta_ajustes").upsert({ clave, valor, actualizado_por_nombre: quien, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  return !error;
}

export const leerVigilancias = async (supabase: SupabaseClient, paisId: string): Promise<Vigilancia[]> => leerListaVigilancias(await leerValor(supabase, claveDeVigilancias(paisId)));

function resultadoVacio(v: Vigilancia): ResultadoVigilancia {
  return { id: v.id, titulo: v.spec.titulo, prioridad: v.prioridad, origen: v.origen, activa: v.activa, metrica: v.spec.metrica, ventanaDias: v.spec.ventanaDias, umbralPct: v.spec.umbralPct, estado: "sin_datos", resumen: "Todavía no se evalúa.", filas: [], gasto: 0, evaluadaEn: new Date().toISOString() };
}

/**
 * Evalúa las vigilancias de un país contra los resultados por día y deja el resultado guardado (Hallazgos y las sugerencias lo leen de ahí). Las que están en pausa quedan en la lista sin evaluarse. Nunca lanza.
 * `soloIds` evalúa solo esas y conserva el último resultado de las demás (al crear una no hace falta recalcular todo).
 */
export async function evaluarVigilanciasGuardadas(supabase: SupabaseClient, o: { paisId: string; hoy: string; soloIds?: string[] }): Promise<ResultadoVigilancia[]> {
  try {
    const lista = await leerVigilancias(supabase, o.paisId);
    const previos = new Map((leerValorResultados(await leerValor(supabase, claveDeResultados(o.paisId)))?.resultados ?? []).map((r) => [r.id, r]));
    const aEvaluar = lista.filter((v) => v.activa && (!o.soloIds || o.soloIds.includes(v.id)));
    const base = aEvaluar.length ? await cargarBaseDias({ paisId: o.paisId, cuentaId: null }, supabase) : null;
    const resultados: ResultadoVigilancia[] = lista.map((v) => {
      const previo = previos.get(v.id);
      const datos = { prioridad: v.prioridad, origen: v.origen, activa: v.activa, titulo: v.spec.titulo };
      if (!v.activa) return { ...(previo ?? resultadoVacio(v)), ...datos };
      if (o.soloIds && !o.soloIds.includes(v.id) && previo) return { ...previo, ...datos };
      return base ? evaluarVigilancia(v, base, o.hoy) : { ...(previo ?? resultadoVacio(v)), ...datos };
    });
    await guardar(supabase, claveDeResultados(o.paisId), { generadoEn: new Date().toISOString(), resultados }, "Sistema");
    return resultados;
  } catch {
    return [];
  }
}

const mismaSpec = (a: VigilanciaSpec, b: VigilanciaSpec) => a.metrica === b.metrica && a.agrupar === b.agrupar && JSON.stringify(Object.entries(a.filtros).sort()) === JSON.stringify(Object.entries(b.filtros).sort());

/**
 * Crea una vigilancia (o, si ya existe una igual, solo le cambia la prioridad y la reactiva) y la evalúa en el acto para que aparezca ya en Hallazgos. `{ error }` si ya hay demasiadas.
 */
export async function crearVigilancia(
  supabase: SupabaseClient,
  o: { paisId: string; hoy: string; spec: VigilanciaSpec; prioridad: Prioridad; origen: Vigilancia["origen"]; quien: string; pregunta: string | null; tema: string | null },
): Promise<{ vigilancia: Vigilancia; resultado: ResultadoVigilancia | null; yaExistia: boolean } | { error: string }> {
  const lista = await leerVigilancias(supabase, o.paisId);
  const igual = lista.find((v) => mismaSpec(v.spec, o.spec));
  let vigilancia: Vigilancia;
  let nueva = lista;
  if (igual) {
    vigilancia = { ...igual, prioridad: o.prioridad, activa: true, spec: { ...igual.spec, umbralPct: o.spec.umbralPct, ventanaDias: o.spec.ventanaDias } };
    nueva = lista.map((v) => (v.id === igual.id ? vigilancia : v));
  } else {
    if (lista.length >= MAX_VIGILANCIAS) return { error: `Ya hay ${MAX_VIGILANCIAS} vigilancias: quita alguna en Hallazgos › Lo que estás vigilando para poder agregar otra.` };
    vigilancia = { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, spec: o.spec, prioridad: o.prioridad, origen: o.origen, activa: true, creadaPor: o.quien, creadaEn: new Date().toISOString(), pregunta: o.pregunta, tema: o.tema };
    nueva = [...lista, vigilancia];
  }
  if (!(await guardar(supabase, claveDeVigilancias(o.paisId), { items: nueva }, o.quien))) return { error: "No se pudo guardar la vigilancia (falta la migración 0347 de Anuncios Meta)." };
  const resultados = await evaluarVigilanciasGuardadas(supabase, { paisId: o.paisId, hoy: o.hoy, soloIds: [vigilancia.id] });
  return { vigilancia, resultado: resultados.find((r) => r.id === vigilancia.id) ?? null, yaExistia: Boolean(igual) };
}

/** Cambia la prioridad, pausa o reanuda una vigilancia, o la quita. */
export async function cambiarVigilancia(supabase: SupabaseClient, o: { paisId: string; hoy: string; id: string; prioridad?: Prioridad; activa?: boolean; quitar?: boolean; quien: string }): Promise<{ ok: true } | { error: string }> {
  const lista = await leerVigilancias(supabase, o.paisId);
  if (!lista.some((v) => v.id === o.id)) return { error: "Esa vigilancia ya no existe." };
  const nueva = o.quitar ? lista.filter((v) => v.id !== o.id) : lista.map((v) => (v.id === o.id ? { ...v, prioridad: o.prioridad ?? v.prioridad, activa: o.activa ?? v.activa } : v));
  if (!(await guardar(supabase, claveDeVigilancias(o.paisId), { items: nueva }, o.quien))) return { error: "No se pudo guardar el cambio." };
  await evaluarVigilanciasGuardadas(supabase, { paisId: o.paisId, hoy: o.hoy, soloIds: o.activa === true ? [o.id] : [] });
  return { ok: true };
}
