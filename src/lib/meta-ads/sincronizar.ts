// Anuncios Meta: la lectura de una cuenta publicitaria. Primero los resultados por anuncio y día (lo que de verdad gastó), luego la estructura de esos anuncios (campaña, conjunto, video, texto y landing) y, si Meta lo
// deja, el registro de actividad. Solo consulta Meta y guarda aquí; no escribe nada en Meta. Los problemas no tumban la lectura: lo que sí se pudo leer se guarda y lo demás queda dicho en `ultimo_error`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pedirMeta, pedirPorIds, pedirTodo, tokenDeMeta } from "./api";
import { etiquetasDeNombre } from "./nombre";
import { actividadDe, anuncioDe, campanaDe, conjuntoDe, esCreacionDeCampana, resultadoDiaDe, type ActividadMeta, type AnuncioMeta, type CampanaMeta, type ConjuntoMeta, type ResultadoDia } from "./normalizar";

export interface CuentaMeta {
  id: string;
  nombre: string;
  act_id: string;
  ultima_lectura_en: string | null;
}

export interface ResumenLectura {
  cuenta: string;
  ok: boolean;
  campanas: number;
  anuncios: number;
  filas: number;
  actividad: number;
  desde: string;
  hasta: string;
  avisos: string[];
  error: string | null;
}

const DIA = 86_400_000;
export const hoyEnPanama = (): string => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
export const restarDias = (fecha: string, n: number): string => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * DIA).toISOString().slice(0, 10);

/** Los días que se leen: la primera vez, 30; después, 7 (Meta corrige las cifras de los últimos días). */
export const DIAS_PRIMERA_LECTURA = 30;
export const DIAS_LECTURA = 7;

const CAMPOS_CAMPANA = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,created_time";
const CAMPOS_CONJUNTO = "id,name,campaign_id,status,effective_status,daily_budget,bid_strategy";
const CAMPOS_ANUNCIO = "id,name,campaign_id,adset_id,status,effective_status,creative{video_id,thumbnail_url,body,title,link_url,object_story_spec}";
const CAMPOS_RESULTADOS = "ad_id,adset_id,campaign_id,spend,impressions,inline_link_clicks,actions,action_values,video_thruplay_watched_actions";

const TROZO = 200;
async function guardarPorTrozos<T>(filas: T[], guardar: (trozo: T[]) => PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  for (let i = 0; i < filas.length; i += TROZO) {
    const { error } = await guardar(filas.slice(i, i + TROZO));
    if (error) return error.message;
  }
  return null;
}

export async function sincronizarCuenta(supabase: SupabaseClient, cuenta: CuentaMeta, opciones: { limiteMs?: number } = {}): Promise<ResumenLectura> {
  const inicio = Date.now();
  const limite = opciones.limiteMs ?? 90_000;
  const hasta = hoyEnPanama();
  const desde = restarDias(hasta, (cuenta.ultima_lectura_en ? DIAS_LECTURA : DIAS_PRIMERA_LECTURA) - 1);
  const r: ResumenLectura = { cuenta: cuenta.nombre, ok: false, campanas: 0, anuncios: 0, filas: 0, actividad: 0, desde, hasta, avisos: [], error: null };

  const token = tokenDeMeta();
  const terminar = async (error: string | null) => {
    r.error = error;
    r.ok = !error;
    await supabase.from("meta_cuentas").update({ ultimo_error: error ?? (r.avisos.length ? r.avisos.join(" ") : null), ...(error ? {} : { ultima_lectura_en: new Date().toISOString() }) }).eq("id", cuenta.id);
    return r;
  };
  if (!token) return terminar("Falta el acceso a Meta (META_ADS_ACCESS_TOKEN) en el servidor: ver «Cuentas».");

  // 1. Resultados por anuncio y día.
  const resultados = await pedirTodo(`/${cuenta.act_id}/insights`, { level: "ad", time_increment: 1, time_range: JSON.stringify({ since: desde, until: hasta }), fields: CAMPOS_RESULTADOS, limit: 500 }, token, 60);
  if (resultados.error && !resultados.filas.length) return terminar(resultados.error);
  if (resultados.error) r.avisos.push(`La lectura de resultados quedó a medias: ${resultados.error}`);
  const dias: ResultadoDia[] = [];
  const campanaDeAnuncio = new Map<string, string>();
  const conjuntoDeAnuncio = new Map<string, string>();
  for (const f of resultados.filas) {
    const d = resultadoDiaDe(f);
    if (!d) continue;
    dias.push(d);
    const o = f as { campaign_id?: unknown; adset_id?: unknown };
    if (typeof o.campaign_id === "string") campanaDeAnuncio.set(d.anuncioMetaId, o.campaign_id);
    if (typeof o.adset_id === "string") conjuntoDeAnuncio.set(d.anuncioMetaId, o.adset_id);
  }
  if (resultados.incompleta) r.avisos.push("Hay más resultados de los que se leyeron en esta vuelta; el resto llega en la próxima lectura.");

  // 2. La estructura de lo que gastó (y de las campañas tocadas hace poco, aunque todavía no hayan gastado).
  const idsAnuncios = [...new Set(dias.map((d) => d.anuncioMetaId))];
  const idsCampanas = new Set(campanaDeAnuncio.values());
  const idsConjuntos = new Set(conjuntoDeAnuncio.values());
  const recientes = await pedirTodo(`/${cuenta.act_id}/campaigns`, { fields: CAMPOS_CAMPANA, filtering: JSON.stringify([{ field: "updated_time", operator: "GREATER_THAN", value: Math.floor(new Date(`${desde}T00:00:00Z`).getTime() / 1000) }]), limit: 200 }, token, 10);
  if (recientes.error) r.avisos.push(`No se leyeron las campañas nuevas: ${recientes.error}`);
  const campanasRaw = new Map<string, unknown>();
  for (const c of recientes.filas) {
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string") campanasRaw.set(id, c);
    if (typeof id === "string") idsCampanas.add(id);
  }
  const faltanCampanas = [...idsCampanas].filter((id) => !campanasRaw.has(id));
  const [porCampana, porConjunto, porAnuncio] = await Promise.all([pedirPorIds(faltanCampanas, CAMPOS_CAMPANA, token), pedirPorIds([...idsConjuntos], CAMPOS_CONJUNTO, token), pedirPorIds(idsAnuncios, CAMPOS_ANUNCIO, token)]);
  for (const e of [porCampana.error, porConjunto.error, porAnuncio.error]) if (e) r.avisos.push(`No se pudo leer parte de la estructura: ${e}`);
  for (const [id, v] of porCampana.objetos) campanasRaw.set(id, v);
  if (Date.now() - inicio > limite) r.avisos.push("Se acabó el tiempo de esta lectura: el resto sigue en la próxima.");

  const campanas = new Map<string, CampanaMeta>();
  for (const v of campanasRaw.values()) {
    const c = campanaDe(v);
    if (c) campanas.set(c.metaId, c);
  }
  const conjuntos = new Map<string, ConjuntoMeta>();
  for (const v of porConjunto.objetos.values()) {
    const c = conjuntoDe(v);
    if (c) conjuntos.set(c.metaId, c);
  }
  const anuncios = new Map<string, AnuncioMeta>();
  for (const v of porAnuncio.objetos.values()) {
    const a = anuncioDe(v);
    if (a) anuncios.set(a.metaId, a);
  }

  // 3. Campañas: lo corregido a mano no se pisa; la puja de una ABO sale de sus conjuntos.
  const { data: existentes } = await supabase.from("meta_campanas").select("meta_id, producto, angulo, etapa, manual").eq("cuenta_id", cuenta.id);
  const previas = new Map((existentes ?? []).map((e) => [e.meta_id as string, e as { producto: string | null; angulo: string | null; etapa: string | null; manual: string[] | null }]));
  const pujaDeConjuntos = (idCampana: string) => [...conjuntos.values()].find((c) => c.campanaMetaId === idCampana && c.puja)?.puja ?? null;
  const filasCampana = [...campanas.values()].map((c) => {
    const e = etiquetasDeNombre(c.nombre);
    const p = previas.get(c.metaId);
    const manual = p?.manual ?? [];
    return {
      cuenta_id: cuenta.id,
      meta_id: c.metaId,
      nombre: c.nombre,
      objetivo: c.objetivo,
      estado: c.estado,
      estructura: c.estructura,
      puja: c.puja ?? pujaDeConjuntos(c.metaId) ?? e.puja,
      presupuesto_diario: c.presupuestoDiario,
      creada_meta_en: c.creadaEn,
      producto: manual.includes("producto") ? (p?.producto ?? null) : e.producto,
      angulo: manual.includes("angulo") ? (p?.angulo ?? null) : e.angulo,
      etapa: manual.includes("etapa") ? (p?.etapa ?? null) : e.etapa,
      actualizado_en: new Date().toISOString(),
    };
  });
  let falla = await guardarPorTrozos(filasCampana, (t) => supabase.from("meta_campanas").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) return terminar(`No se pudieron guardar las campañas: ${falla}`);
  r.campanas = filasCampana.length;
  const { data: idsC } = await supabase.from("meta_campanas").select("id, meta_id").eq("cuenta_id", cuenta.id);
  const idDeCampana = new Map((idsC ?? []).map((c) => [c.meta_id as string, c.id as string]));

  // 4. Conjuntos y anuncios (solo los que tienen campaña guardada).
  const filasConjunto = [...conjuntos.values()].filter((c) => idDeCampana.has(c.campanaMetaId)).map((c) => ({ cuenta_id: cuenta.id, campana_id: idDeCampana.get(c.campanaMetaId)!, meta_id: c.metaId, nombre: c.nombre, estado: c.estado, presupuesto_diario: c.presupuestoDiario, puja: c.puja }));
  falla = await guardarPorTrozos(filasConjunto, (t) => supabase.from("meta_conjuntos").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) r.avisos.push(`No se pudieron guardar los conjuntos: ${falla}`);
  const { data: idsJ } = await supabase.from("meta_conjuntos").select("id, meta_id").eq("cuenta_id", cuenta.id);
  const idDeConjunto = new Map((idsJ ?? []).map((c) => [c.meta_id as string, c.id as string]));

  const filasAnuncio = [...anuncios.values()]
    .filter((a) => idDeCampana.has(a.campanaMetaId))
    .map((a) => ({ cuenta_id: cuenta.id, campana_id: idDeCampana.get(a.campanaMetaId)!, conjunto_id: a.conjuntoMetaId ? (idDeConjunto.get(a.conjuntoMetaId) ?? null) : null, meta_id: a.metaId, nombre: a.nombre, estado: a.estado, video_id: a.videoId, miniatura: a.miniatura, copy: a.copy, titulo: a.titulo, landing: a.landing }));
  falla = await guardarPorTrozos(filasAnuncio, (t) => supabase.from("meta_anuncios").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) return terminar(`No se pudieron guardar los anuncios: ${falla}`);
  r.anuncios = filasAnuncio.length;
  const { data: idsA } = await supabase.from("meta_anuncios").select("id, meta_id, campana_id").eq("cuenta_id", cuenta.id);
  const anuncioPorMeta = new Map((idsA ?? []).map((a) => [a.meta_id as string, { id: a.id as string, campana: a.campana_id as string }]));

  // 5. Resultados por día.
  const filasDia = dias
    .map((d) => {
      const a = anuncioPorMeta.get(d.anuncioMetaId);
      return a ? { anuncio_id: a.id, cuenta_id: cuenta.id, campana_id: a.campana, fecha: d.fecha, gasto: d.gasto, impresiones: d.impresiones, clics: d.clics, video_3s: d.video3s, video_15s: d.video15s, vio_landing: d.vioLanding, carrito: d.carrito, pago: d.pago, compras: d.compras, valor: d.valor } : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  falla = await guardarPorTrozos(filasDia, (t) => supabase.from("meta_resultados_dia").upsert(t, { onConflict: "anuncio_id,fecha" }));
  if (falla) return terminar(`No se pudieron guardar los resultados: ${falla}`);
  r.filas = filasDia.length;
  if (filasDia.length < dias.length) r.avisos.push(`${dias.length - filasDia.length} filas de resultados quedaron sin anuncio (se completan en la próxima lectura).`);

  // 6. Registro de actividad: quién creó o cambió qué. Si Meta no lo deja con este acceso, se avisa y todo lo demás sigue.
  const actividad = await pedirTodo(`/${cuenta.act_id}/activities`, { fields: "event_type,event_time,actor_id,actor_name,object_id,object_name,object_type,extra_data", since: `${desde}`, until: `${hasta}`, limit: 200 }, token, 10);
  if (actividad.error) r.avisos.push(`No se pudo leer el registro de actividad (Equipo queda sin datos de quién montó qué): ${actividad.error}`);
  const eventos = actividad.filas.map(actividadDe).filter((a): a is ActividadMeta => a !== null);
  if (eventos.length) {
    const filasEv = eventos.map((a) => ({ cuenta_id: cuenta.id, clave: a.clave.slice(0, 300), fecha: a.fecha, actor_id: a.actorId, actor_nombre: a.actorNombre, tipo: a.tipo, objeto_tipo: a.objetoTipo, objeto_meta_id: a.objetoMetaId, objeto_nombre: a.objetoNombre, detalle: a.detalle }));
    const e = await guardarPorTrozos(filasEv, (t) => supabase.from("meta_actividad").upsert(t, { onConflict: "cuenta_id,clave" }));
    if (e) r.avisos.push(`No se pudo guardar el registro de actividad: ${e}`);
    else r.actividad = eventos.length;
    // «Quién la montó»: el actor del evento de creación de cada campaña.
    for (const a of eventos.filter((x) => esCreacionDeCampana(x) && x.objetoMetaId && x.actorNombre)) {
      const id = idDeCampana.get(a.objetoMetaId!);
      if (id) await supabase.from("meta_campanas").update({ creada_por: a.actorNombre }).eq("id", id).is("creada_por", null);
    }
  }

  return terminar(null);
}

/** Pregunta a Meta quién es el acceso y qué cuentas ve (para «Probar conexión»): no guarda nada. */
export async function probarAccesoMeta(): Promise<{ ok: boolean; mensaje: string; cuentas: { id: string; nombre: string }[] }> {
  const token = tokenDeMeta();
  if (!token) return { ok: false, mensaje: "Falta META_ADS_ACCESS_TOKEN en el servidor (Vercel).", cuentas: [] };
  const yo = await pedirMeta("/me", { fields: "id,name" }, token);
  if (!yo.ok) return { ok: false, mensaje: yo.error, cuentas: [] };
  const lista = await pedirTodo("/me/adaccounts", { fields: "account_id,name,account_status", limit: 100 }, token, 5);
  const cuentas = lista.filas.map((c) => c as { account_id?: unknown; name?: unknown }).filter((c) => typeof c.account_id === "string").map((c) => ({ id: `act_${c.account_id}`, nombre: typeof c.name === "string" ? c.name : "Sin nombre" }));
  const nombre = (yo.datos as { name?: unknown }).name;
  return { ok: true, mensaje: `Conectado como «${typeof nombre === "string" ? nombre : "usuario del sistema"}»: ve ${cuentas.length} ${cuentas.length === 1 ? "cuenta publicitaria" : "cuentas publicitarias"}.`, cuentas };
}
