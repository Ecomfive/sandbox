// Anuncios Meta › el análisis del historial se hace solo (24 nov 2026, pedido de Alcides: «que los datos se analicen automáticamente»). Leer todo el historial es pesado (76 000 filas y los pedidos), así que lo calcula el
// cron de Meta (3 veces al día, después de leer las cuentas) y guarda el resultado en `meta_ajustes` (`analisis_historico:<país>`): Resumen y Hallazgos lo leen de ahí, al instante. Una vez al día (con todas las IA que tengan clave)
// también lo interpreta. Si alguien abre la pantalla y todavía no hay análisis (o tiene más de un día), se prepara en segundo plano. Solo lee y escribe en la base; nunca toca Meta.

import type { SupabaseClient } from "@supabase/supabase-js";
import { modeloDeTexto, NOMBRE_PROVEEDOR, pedirIAEn, proveedoresConectados, type ProveedorIA } from "@/lib/publicaciones/ia/proveedor";
import { claveDeAnalisis, type AnalisisGuardado } from "./analisis-tipos";
import { tieneHistorialSuficiente, type AnalisisHistorico } from "./historico";
import { calcularHistorico, type HistoricoCargado } from "./historico-datos";
import { claveDeInterpretacion, leerInterpretacionGuardada, type OpinionIA } from "./interpretacion-guardada";
import { leerInterpretacion, pedidoInterpretacion } from "./interpretar-ia";
import { investigarProblemasDeEntrega } from "./investigacion-datos";
import { senalesCreativasDelDia } from "./senales-datos";
import { senalesParaIA, type SenalesCreativas } from "./senales-creativas";
import { textoParaIA, type InvestigacionProducto } from "./investigacion-entrega";
import { evaluarVigilanciasGuardadas } from "./vigilancias";

export { analisisViejo, claveDeAnalisis, HORAS_ANALISIS_VIGENTE, type AnalisisGuardado } from "./analisis-tipos";
const claveDeBloqueo = (paisId: string): string => `analisis_historico_bloqueo:${paisId}`;

/** La interpretación con IA se pide a lo sumo una vez cada tanto (cuesta crédito): lo demás del análisis se recalcula en cada lectura. */
export const HORAS_ENTRE_INTERPRETACIONES = 20;
/** Si ya hay una preparación en marcha de hace menos de esto, no se lanza otra. */
export const MINUTOS_DE_BLOQUEO = 8;
/** Lo más que se guarda de un análisis: pasado esto se recortan las tablas largas (una fila de `meta_ajustes` no es para gigas). */
const MAX_BYTES_ANALISIS = 900_000;

const horasDesde = (iso: string, ahora = Date.now()) => (ahora - Date.parse(iso)) / 3_600_000;

/** Recorta un análisis que se pasa de tamaño: quita lo que no cambia ninguna conclusión (tendencias estables o sin datos y hallazgos de más). */
export function compactarAnalisis(a: AnalisisHistorico): AnalisisHistorico {
  if (JSON.stringify(a).length <= MAX_BYTES_ANALISIS) return a;
  return { ...a, tendencias: a.tendencias.filter((t) => t.cambio.sentido === "baja" || t.cambio.sentido === "mejora"), hallazgos: a.hallazgos.slice(0, 80) };
}

export async function leerAnalisisGuardado(supabase: SupabaseClient, paisId: string): Promise<AnalisisGuardado | null> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeAnalisis(paisId)).maybeSingle();
    if (error || !data?.valor || typeof data.valor !== "object") return null;
    const v = data.valor as Partial<AnalisisGuardado>;
    if (typeof v.generadoEn !== "string" || !v.analisis || !Array.isArray(v.analisis.hallazgos)) return null;
    return { generadoEn: v.generadoEn, analisis: v.analisis, tiendas: Array.isArray(v.tiendas) ? v.tiendas : [], pedidos: Number(v.pedidos ?? 0) || 0 };
  } catch {
    return null;
  }
}

async function guardar(supabase: SupabaseClient, clave: string, valor: unknown, quien: string): Promise<boolean> {
  const { error } = await supabase.from("meta_ajustes").upsert({ clave, valor, actualizado_por_nombre: quien, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  return !error;
}

/** Las IA con clave, la principal primero (Claude razona mejor sobre tablas; OpenAI queda de segunda opinión). */
export function iasParaInterpretar(conectadas: readonly ProveedorIA[]): ProveedorIA[] {
  return [...conectadas].sort((a, b) => (a === b ? 0 : a === "anthropic" ? -1 : b === "anthropic" ? 1 : 0));
}

/** Pide la interpretación a cada IA conectada, a la vez; las que fallan se saltan. */
async function interpretarConTodas(analisis: AnalisisHistorico, paisNombre: string, investigaciones: readonly InvestigacionProducto[], senales: readonly SenalesCreativas[]): Promise<OpinionIA[]> {
  const { instrucciones, texto } = pedidoInterpretacion(analisis, investigaciones.map(textoParaIA), senales.map(senalesParaIA));
  const opiniones = await Promise.all(
    iasParaInterpretar(proveedoresConectados()).map(async (proveedor): Promise<OpinionIA | null> => {
      const r = await pedirIAEn(proveedor, { instrucciones, texto, imagenes: [] }, { operacion: "meta_interpretacion", modulo: "anuncios-meta", referencia: `Análisis automático · ${paisNombre}` }, "analisis");
      if ("error" in r) return null;
      const interpretacion = leerInterpretacion(r.texto);
      return interpretacion ? { proveedor: NOMBRE_PROVEEDOR[proveedor], modelo: modeloDeTexto(proveedor === "anthropic" ? "crm" : "general"), interpretacion } : null;
    }),
  );
  return opiniones.filter((o): o is OpinionIA => o !== null);
}

export interface ResultadoRefresco {
  analizado: boolean;
  interpretado: boolean;
  /** Por qué no se hizo algo, en palabras (para el registro del cron). */
  motivo?: string;
}

/**
 * Prepara el análisis del historial de un país: lo calcula, lo guarda y, si ya toca (una vez al día) y hay IA conectada, lo interpreta con todas las IA que tengan clave. Nunca lanza.
 * `bloqueo` evita que dos personas que abren la pantalla a la vez lancen dos cálculos; el cron no lo necesita.
 */
export async function refrescarAnalisisMeta(supabase: SupabaseClient, o: { paisId: string; paisNombre: string; hoy: string; interpretar?: boolean; bloqueo?: boolean }): Promise<ResultadoRefresco> {
  try {
    if (o.bloqueo) {
      const { data } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeBloqueo(o.paisId)).maybeSingle();
      const en = (data?.valor as { en?: string } | null)?.en;
      if (en && horasDesde(en) * 60 < MINUTOS_DE_BLOQUEO) return { analizado: false, interpretado: false, motivo: "Ya se está preparando." };
      await guardar(supabase, claveDeBloqueo(o.paisId), { en: new Date().toISOString() }, "Sistema");
    }
    const h: HistoricoCargado = await calcularHistorico({ paisId: o.paisId, cuentaId: null, hoy: o.hoy }, supabase);
    if (h.vacio) return { analizado: false, interpretado: false, motivo: "Sin cuentas ni historial." };
    const valor: AnalisisGuardado = { generadoEn: new Date().toISOString(), analisis: compactarAnalisis(h.analisis), tiendas: h.tiendas, pedidos: h.pedidos };
    if (!(await guardar(supabase, claveDeAnalisis(o.paisId), valor, "Sistema"))) return { analizado: false, interpretado: false, motivo: "Falta la migración 0347 (meta_ajustes): no se puede guardar." };
    // Las vigilancias que pidió la gente se evalúan con los mismos resultados (cada día y al abrir la pantalla si el análisis era viejo).
    await evaluarVigilanciasGuardadas(supabase, { paisId: o.paisId, hoy: o.hoy });
    if (!o.interpretar) return { analizado: true, interpretado: false };
    if (!tieneHistorialSuficiente(h.analisis)) return { analizado: true, interpretado: false, motivo: "Poco historial para interpretar." };
    if (!proveedoresConectados().length) return { analizado: true, interpretado: false, motivo: "Ninguna IA de texto conectada." };
    const previa = await leerInterpretacionGuardada(supabase, o.paisId);
    if (previa && horasDesde(previa.generadaEn) < HORAS_ENTRE_INTERPRETACIONES) return { analizado: true, interpretado: false, motivo: "La interpretación de hoy ya está hecha." };
    // Antes de interpretar se investiga por qué no se entregan los productos con problema, para que las recomendaciones usen causas encontradas y no «revisa por qué».
    const investigaciones = await investigarProblemasDeEntrega(supabase, { paisId: o.paisId, hoy: o.hoy, analisis: h.analisis, tiendas: h.tiendas });
    const senales = await senalesCreativasDelDia(supabase, { paisId: o.paisId, hoy: o.hoy, analisis: h.analisis });
    const opiniones = await interpretarConTodas(h.analisis, o.paisNombre, investigaciones, senales);
    if (!opiniones.length) return { analizado: true, interpretado: false, motivo: "Las IA no devolvieron una interpretación que sirva." };
    await guardar(supabase, claveDeInterpretacion(o.paisId), { generadaEn: new Date().toISOString(), opiniones }, "Sistema");
    return { analizado: true, interpretado: true };
  } catch (e) {
    return { analizado: false, interpretado: false, motivo: e instanceof Error ? e.message : "No se pudo preparar el análisis." };
  }
}
