// Anuncios Meta: la lectura de una cuenta publicitaria. Primero los resultados por anuncio y día (lo que de verdad gastó), luego la estructura de esos anuncios (campaña, conjunto, video, texto y landing) y, si Meta lo
// deja, el registro de actividad. Solo consulta Meta y guarda aquí; no escribe nada en Meta. Los problemas no tumban la lectura: lo que sí se pudo leer se guarda y lo demás queda dicho en `ultimo_error`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { pedirMeta, pedirPorIds, pedirTodo, tokenDeMeta } from "./api";
import { partirTramo } from "./cobertura";
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
  /** Con `rango`: el tramo trae más datos de los que caben en una lectura o Meta tardó demasiado; no se guardó nada y conviene leerlo en partes más chicas. */
  partir?: boolean;
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
const CAMPOS_RESULTADOS = "ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions";

const TROZO = 200;
async function guardarPorTrozos<T>(filas: T[], guardar: (trozo: T[]) => PromiseLike<{ error: { message: string } | null }>): Promise<string | null> {
  for (let i = 0; i < filas.length; i += TROZO) {
    const { error } = await guardar(filas.slice(i, i + TROZO));
    if (error) return error.message;
  }
  return null;
}

export async function sincronizarCuenta(supabase: SupabaseClient, cuenta: CuentaMeta, opciones: { limiteMs?: number; /** Leer una ventana de fechas concreta (para traer el historial de a tramos) en vez de los últimos días. */ rango?: { desde: string; hasta: string } } = {}): Promise<ResumenLectura> {
  const inicio = Date.now();
  const limite = opciones.limiteMs ?? 90_000;
  const hasta = opciones.rango?.hasta ?? hoyEnPanama();
  const desde = opciones.rango?.desde ?? restarDias(hasta, (cuenta.ultima_lectura_en ? DIAS_LECTURA : DIAS_PRIMERA_LECTURA) - 1);
  const r: ResumenLectura = { cuenta: cuenta.nombre, ok: false, campanas: 0, anuncios: 0, filas: 0, actividad: 0, desde, hasta, avisos: [], error: null };
  // El reloj de la lectura (20 nov 2026: un mes de una cuenta grande pedía más páginas de las que caben en una llamada y quedaba colgado hasta que Vercel la cortaba, sin decir nada):
  // los resultados se piden hasta el 55 % del tiempo y la estructura hasta el 90 %; lo que no cabe se avisa en vez de seguir.
  const finResultados = inicio + Math.round(limite * 0.55);
  const finEstructura = inicio + Math.round(limite * 0.9);

  const token = tokenDeMeta();
  const terminar = async (error: string | null) => {
    r.error = error;
    r.ok = !error;
    await supabase.from("meta_cuentas").update({ ultimo_error: error ?? (r.avisos.length ? r.avisos.join(" ") : null), ...(error ? {} : { ultima_lectura_en: new Date().toISOString() }) }).eq("id", cuenta.id);
    return r;
  };
  if (!token) return terminar("Falta el acceso a Meta (META_ADS_ACCESS_TOKEN) en el servidor: ver «Cuentas».");

  // 1. Resultados por anuncio y día.
  const resultados = await pedirTodo(`/${cuenta.act_id}/insights`, { level: "ad", time_increment: 1, time_range: JSON.stringify({ since: desde, until: hasta }), fields: CAMPOS_RESULTADOS, limit: 500 }, token, 60, finResultados);
  if (resultados.error && !resultados.filas.length) {
    if (opciones.rango && /tardó demasiado|esperar/i.test(resultados.error)) r.partir = true;
    return terminar(resultados.error);
  }
  // Un tramo del historial se guarda entero o no se guarda: si no cupo, no se guarda y se lee en partes más chicas.
  if (opciones.rango && (resultados.incompleta || resultados.error)) {
    r.partir = true;
    return terminar(resultados.error ? `Meta no terminó de entregar los resultados de ${desde} a ${hasta}: ${resultados.error}` : `Los resultados de ${desde} a ${hasta} son demasiados para una sola lectura.`);
  }
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
  const recientes = await pedirTodo(`/${cuenta.act_id}/campaigns`, { fields: CAMPOS_CAMPANA, filtering: JSON.stringify([{ field: "updated_time", operator: "GREATER_THAN", value: Math.floor(new Date(`${desde}T00:00:00Z`).getTime() / 1000) }]), limit: 200 }, token, 10, finEstructura);
  if (recientes.error) r.avisos.push(`No se leyeron las campañas nuevas: ${recientes.error}`);
  const campanasRaw = new Map<string, unknown>();
  for (const c of recientes.filas) {
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string") campanasRaw.set(id, c);
    if (typeof id === "string") idsCampanas.add(id);
  }
  const faltanCampanas = [...idsCampanas].filter((id) => !campanasRaw.has(id));
  const [porCampana, porConjunto, porAnuncio] = await Promise.all([pedirPorIds(faltanCampanas, CAMPOS_CAMPANA, token, finEstructura), pedirPorIds([...idsConjuntos], CAMPOS_CONJUNTO, token, finEstructura), pedirPorIds(idsAnuncios, CAMPOS_ANUNCIO, token, finEstructura)]);
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
  // Supabase entrega como mucho 1000 filas por consulta: una cuenta con historial largo tiene más campañas, conjuntos y anuncios que eso, así que se leen por páginas (20 nov 2026: «24 filas sin anuncio» que nunca se completaban).
  const existentes = await traerTodasLasFilas<{ meta_id: string; producto: string | null; angulo: string | null; etapa: string | null; manual: string[] | null }>((a, b) => supabase.from("meta_campanas").select("meta_id, producto, angulo, etapa, manual").eq("cuenta_id", cuenta.id).order("id").range(a, b));
  const previas = new Map(existentes.map((e) => [e.meta_id as string, e as { producto: string | null; angulo: string | null; etapa: string | null; manual: string[] | null }]));
  const pujaDeConjuntos = (idCampana: string) => [...conjuntos.values()].find((c) => c.campanaMetaId === idCampana && c.puja)?.puja ?? null;
  const aFilaCampana = (c: CampanaMeta) => {
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
      mercado: e.mercado,
      videos: e.videos,
      persona_nombre: e.persona,
      angulo: manual.includes("angulo") ? (p?.angulo ?? null) : e.angulo,
      etapa: manual.includes("etapa") ? (p?.etapa ?? null) : e.etapa,
      actualizado_en: new Date().toISOString(),
    };
  };
  const filasCampana = [...campanas.values()].map(aFilaCampana);
  let falla = await guardarPorTrozos(filasCampana, (t) => supabase.from("meta_campanas").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) return terminar(`No se pudieron guardar las campañas: ${falla}`);
  // Las campañas que Meta no dejó leer (borradas o sin permiso) se guardan con lo que dice el reporte de resultados, para que ningún resultado quede sin dónde colgarse. Solo si no existen: nunca pisan una campaña ya leída bien.
  const provisionalesC: CampanaMeta[] = [];
  for (const d of dias) {
    if (d.campanaMetaId && d.campanaNombre && !campanas.has(d.campanaMetaId) && !provisionalesC.some((c) => c.metaId === d.campanaMetaId)) {
      provisionalesC.push({ metaId: d.campanaMetaId, nombre: d.campanaNombre, objetivo: null, estado: "DESCONOCIDO", estructura: null, puja: null, presupuestoDiario: null, creadaEn: null });
    }
  }
  if (provisionalesC.length) {
    const e = await guardarPorTrozos(provisionalesC.map(aFilaCampana), (t) => supabase.from("meta_campanas").upsert(t, { onConflict: "cuenta_id,meta_id", ignoreDuplicates: true }));
    if (e) r.avisos.push(`No se pudieron guardar ${provisionalesC.length} campañas que Meta no dejó leer: ${e}`);
  }
  r.campanas = filasCampana.length + provisionalesC.length;
  const idsC = await traerTodasLasFilas<{ id: string; meta_id: string }>((a, b) => supabase.from("meta_campanas").select("id, meta_id").eq("cuenta_id", cuenta.id).order("id").range(a, b));
  const idDeCampana = new Map(idsC.map((c) => [c.meta_id as string, c.id as string]));

  // 4. Conjuntos y anuncios (solo los que tienen campaña guardada).
  const filasConjunto = [...conjuntos.values()].filter((c) => idDeCampana.has(c.campanaMetaId)).map((c) => ({ cuenta_id: cuenta.id, campana_id: idDeCampana.get(c.campanaMetaId)!, meta_id: c.metaId, nombre: c.nombre, estado: c.estado, presupuesto_diario: c.presupuestoDiario, puja: c.puja }));
  falla = await guardarPorTrozos(filasConjunto, (t) => supabase.from("meta_conjuntos").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) r.avisos.push(`No se pudieron guardar los conjuntos: ${falla}`);
  // Los conjuntos y anuncios que Meta no entregó se guardan, solo si no existen, con lo que dice el reporte de resultados.
  const provisionalesJ = new Map<string, (typeof filasConjunto)[number]>();
  for (const d of dias) {
    if (d.conjuntoMetaId && d.conjuntoNombre && d.campanaMetaId && !conjuntos.has(d.conjuntoMetaId) && idDeCampana.has(d.campanaMetaId) && !provisionalesJ.has(d.conjuntoMetaId)) {
      provisionalesJ.set(d.conjuntoMetaId, { cuenta_id: cuenta.id, campana_id: idDeCampana.get(d.campanaMetaId)!, meta_id: d.conjuntoMetaId, nombre: d.conjuntoNombre, estado: "DESCONOCIDO", presupuesto_diario: null, puja: null });
    }
  }
  if (provisionalesJ.size) {
    const e = await guardarPorTrozos([...provisionalesJ.values()], (t) => supabase.from("meta_conjuntos").upsert(t, { onConflict: "cuenta_id,meta_id", ignoreDuplicates: true }));
    if (e) r.avisos.push(`No se pudieron guardar ${provisionalesJ.size} conjuntos que Meta no dejó leer: ${e}`);
  }
  const idsJ = await traerTodasLasFilas<{ id: string; meta_id: string }>((a, b) => supabase.from("meta_conjuntos").select("id, meta_id").eq("cuenta_id", cuenta.id).order("id").range(a, b));
  const idDeConjunto = new Map(idsJ.map((c) => [c.meta_id as string, c.id as string]));

  const filasAnuncio = [...anuncios.values()]
    .filter((a) => idDeCampana.has(a.campanaMetaId))
    .map((a) => ({ cuenta_id: cuenta.id, campana_id: idDeCampana.get(a.campanaMetaId)!, conjunto_id: a.conjuntoMetaId ? (idDeConjunto.get(a.conjuntoMetaId) ?? null) : null, meta_id: a.metaId, nombre: a.nombre, estado: a.estado, video_id: a.videoId, miniatura: a.miniatura, copy: a.copy, titulo: a.titulo, landing: a.landing }));
  falla = await guardarPorTrozos(filasAnuncio, (t) => supabase.from("meta_anuncios").upsert(t, { onConflict: "cuenta_id,meta_id" }));
  if (falla) return terminar(`No se pudieron guardar los anuncios: ${falla}`);
  const provisionalesA = new Map<string, (typeof filasAnuncio)[number]>();
  for (const d of dias) {
    if (d.anuncioNombre && d.campanaMetaId && !anuncios.has(d.anuncioMetaId) && idDeCampana.has(d.campanaMetaId) && !provisionalesA.has(d.anuncioMetaId)) {
      provisionalesA.set(d.anuncioMetaId, { cuenta_id: cuenta.id, campana_id: idDeCampana.get(d.campanaMetaId)!, conjunto_id: d.conjuntoMetaId ? (idDeConjunto.get(d.conjuntoMetaId) ?? null) : null, meta_id: d.anuncioMetaId, nombre: d.anuncioNombre, estado: "DESCONOCIDO", video_id: null, miniatura: null, copy: null, titulo: null, landing: null });
    }
  }
  if (provisionalesA.size) {
    const e = await guardarPorTrozos([...provisionalesA.values()], (t) => supabase.from("meta_anuncios").upsert(t, { onConflict: "cuenta_id,meta_id", ignoreDuplicates: true }));
    if (e) r.avisos.push(`No se pudieron guardar ${provisionalesA.size} anuncios que Meta no dejó leer: ${e}`);
  }
  r.anuncios = filasAnuncio.length + provisionalesA.size;
  const idsA = await traerTodasLasFilas<{ id: string; meta_id: string; campana_id: string }>((a, b) => supabase.from("meta_anuncios").select("id, meta_id, campana_id").eq("cuenta_id", cuenta.id).order("id").range(a, b));
  const anuncioPorMeta = new Map(idsA.map((a) => [a.meta_id as string, { id: a.id as string, campana: a.campana_id as string }]));

  // 5. Resultados por día.
  const filasDia = dias
    .map((d) => {
      const a = anuncioPorMeta.get(d.anuncioMetaId);
      return a ? { anuncio_id: a.id, cuenta_id: cuenta.id, campana_id: a.campana, fecha: d.fecha, gasto: d.gasto, impresiones: d.impresiones, clics: d.clics, video_3s: d.video3s, video_15s: d.video15s, video_25: d.video25, video_50: d.video50, video_75: d.video75, video_95: d.video95, vio_landing: d.vioLanding, carrito: d.carrito, pago: d.pago, compras: d.compras, valor: d.valor } : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  falla = await guardarPorTrozos(filasDia, (t) => supabase.from("meta_resultados_dia").upsert(t, { onConflict: "anuncio_id,fecha" }));
  // Sin la migración 0326 no existen las columnas de retención: se guarda lo demás igual.
  if (falla && /video_25|video_50|video_75|video_95|schema cache/i.test(falla)) {
    const sinRetencion = filasDia.map(({ video_25: _a, video_50: _b, video_75: _c, video_95: _d, ...resto }) => (void [_a, _b, _c, _d], resto));
    falla = await guardarPorTrozos(sinRetencion, (t) => supabase.from("meta_resultados_dia").upsert(t, { onConflict: "anuncio_id,fecha" }));
    if (!falla) r.avisos.push("Falta correr la migración 0326 para guardar la retención del video (25, 50, 75 y 95 %).");
  }
  if (falla) return terminar(`No se pudieron guardar los resultados: ${falla}`);
  r.filas = filasDia.length;
  if (filasDia.length < dias.length) {
    const sinAnuncio = [...new Set(dias.filter((d) => !anuncioPorMeta.has(d.anuncioMetaId)).map((d) => d.anuncioMetaId))];
    // Por qué no se pudo guardar cada anuncio: Meta no lo entregó, no trajo su campaña o su campaña no se guardó.
    const sinLeer = sinAnuncio.filter((id) => !porAnuncio.objetos.has(id)).length;
    const sinCampana = sinAnuncio.filter((id) => { const a = anuncios.get(id); return !!a && !idDeCampana.has(a.campanaMetaId); }).length;
    const motivo = [sinLeer ? `Meta no entregó ${sinLeer} ${sinLeer === 1 ? "anuncio" : "anuncios"} (borrados o sin permiso)` : "", sinCampana ? `${sinCampana} ${sinCampana === 1 ? "anuncio" : "anuncios"} de campañas que no se pudieron guardar` : ""].filter(Boolean).join("; ");
    r.avisos.push(`${dias.length - filasDia.length} filas de resultados de ${sinAnuncio.length} ${sinAnuncio.length === 1 ? "anuncio" : "anuncios"} no se guardaron${motivo ? ` (${motivo})` : ""}. Ids: ${sinAnuncio.slice(0, 5).join(", ")}${sinAnuncio.length > 5 ? "…" : ""}.`);
  }

  // 6. Registro de actividad: quién creó o cambió qué. Si Meta no lo deja con este acceso, se avisa y todo lo demás sigue.
  // Si Meta falla con todo el rango (suele pasar con muchos días y muchos cambios), se vuelve a pedir partido en mitades hasta 3 veces (8 pedazos); solo es error lo que ningún pedazo pudo traer.
  const leerActividad = async (t: { desde: string; hasta: string }, nivel = 0): Promise<{ filas: unknown[]; error: string | null; incompleta: boolean }> => {
    const r = await pedirTodo(`/${cuenta.act_id}/activities`, { fields: "event_type,event_time,actor_id,actor_name,object_id,object_name,object_type,extra_data", since: t.desde, until: t.hasta, limit: 200 }, token, 10, inicio + limite);
    const mitades = r.error && nivel < 3 && Date.now() < finEstructura ? partirTramo(t) : null;
    if (!mitades) return r;
    const partes = [await leerActividad(mitades[0], nivel + 1), await leerActividad(mitades[1], nivel + 1)];
    const falla = partes.find((x) => x.error);
    return { filas: partes.flatMap((x) => x.filas), error: falla ? falla.error : null, incompleta: partes.some((x) => x.incompleta) };
  };
  const actividad = Date.now() > finEstructura ? { filas: [] as unknown[], error: "Se acabó el tiempo de esta lectura.", incompleta: false } : await leerActividad({ desde, hasta });
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

  // El registro de lo leído (migración 0346): dice con certeza qué fechas de esta cuenta ya se trajeron de Meta. Solo cuando los resultados llegaron completos; sin la migración se ignora.
  if (!resultados.incompleta && !resultados.error) {
    await supabase.from("meta_lecturas_tramos").delete().eq("cuenta_id", cuenta.id).gte("desde", desde).lte("hasta", hasta);
    await supabase.from("meta_lecturas_tramos").insert({ cuenta_id: cuenta.id, desde, hasta, filas: r.filas });
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
