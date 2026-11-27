"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { claveDeCostos, revisarCostos, sumarPedidos, tasasDe, type EntregasMeta } from "@/lib/meta-ads/costos-operacion";
import { AJUSTE_ANALISIS_AUTOMATICO } from "@/lib/meta-ads/ajustes";
import { iasParaInterpretar, leerAnalisisGuardado, refrescarAnalisisMeta } from "@/lib/meta-ads/analisis-guardado";
import { claveDeTema, ejecutarAnalisis, validarAnalisis, validarPrioridad, validarVigilancia, vigilanciaDeAnalisis, type Prioridad } from "@/lib/meta-ads/analisis-pedido";
import { cargarBaseDias } from "@/lib/meta-ads/base-dias";
import { guardarInvestigacion, investigarProducto, leerInvestigaciones } from "@/lib/meta-ads/investigacion-datos";
import { textoParaIA } from "@/lib/meta-ads/investigacion-entrega";
import { leerValorSenales, claveDeSenales, senalesParaIA } from "@/lib/meta-ads/senales-creativas";
import { senalesVisibles } from "@/lib/meta-ads/senales-modulos";
import { claveDeRasgos, leerValorRasgos, rasgosParaIA } from "@/lib/meta-ads/rasgos-ganadores";
import { interpretarRespuestaChat, LIMITES_CHAT, limpiarRespuesta, pedidoChat, pedidoConResultados, revisarPregunta, sanitizarHistorial } from "@/lib/meta-ads/chat-ia";
import { cambiarVigilancia, crearVigilancia, DIAS_DE_INSISTENCIA, leerVigilancias, VECES_PARA_VIGILAR } from "@/lib/meta-ads/vigilancias";
import { tieneHistorialSuficiente } from "@/lib/meta-ads/historico";
import { cargarHistorico } from "@/lib/meta-ads/historico-datos";
import { NOMBRE_PROVEEDOR, pedirIAEn, proveedoresConectados } from "@/lib/publicaciones/ia/proveedor";
import { afinarAnguloDeVideo, analizarVideoDeMeta, pendienteDeVideo, videosPorAnalizar } from "@/lib/meta-ads/analizar-videos";
import { pedirMeta, tokenDeMeta } from "@/lib/meta-ads/api";
import { buscarArchivoDeVideo, motivoSinArchivoDeVideo } from "@/lib/meta-ads/archivo-video";
import { clasificarGanchosPendientes } from "@/lib/meta-ads/clasificar-ganchos";
import type { CoberturaBruta } from "@/lib/meta-ads/cobertura";
import { actividadDeCampana } from "@/lib/meta-ads/datos";
import { leerCuentasMeta } from "@/lib/meta-ads/leer-cuentas";
import { claveDeProducto, type Etapa } from "@/lib/meta-ads/nombre";
import { normalizarActId } from "@/lib/meta-ads/normalizar";
import { hoyEnPanama, probarAccesoMeta, restarDias, sincronizarCuenta } from "@/lib/meta-ads/sincronizar";
import { DIAS_DE_DECISION } from "@/lib/meta-ads/sugerencias";
import { esHostDeVideoMeta } from "@/lib/meta-ads/video-angulo";
import type { ActividadVista } from "@/lib/meta-ads/vistas";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { exigirAcceso } from "@/lib/seguridad/exigir-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "anuncios-meta";
/** Un enlace https de Facebook (o su acortador fb.me): lo único que se le entrega a la pantalla como vista previa. */
const esEnlaceDeMeta = (u: string): boolean => {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && (x.hostname === "fb.me" || x.hostname === "facebook.com" || x.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sinMigracion = (m: string) => /meta_[a-z_]+|schema cache|does not exist/i.test(m);
const MIGRACION = "Falta correr la migración 0320 (Anuncios Meta) en Supabase.";

type Resultado = { error?: string; aviso?: string };

/** Agrega una cuenta publicitaria (o cambia su nombre, tienda o si se lee). La cuenta queda en el país elegido en la barra. */
export async function guardarCuentaMeta(entrada: { id?: string; nombre: string; actId: string; tienda?: string; activa: boolean }): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const nombre = String(entrada.nombre ?? "").trim();
  if (nombre.length < 2 || nombre.length > 80) return { error: "Escribe un nombre de entre 2 y 80 letras." };
  const actId = normalizarActId(String(entrada.actId ?? ""));
  if (!actId) return { error: "El ID de la cuenta publicitaria debe ser como act_1234567890 (solo el número también sirve)." };
  const tienda = String(entrada.tienda ?? "").trim().slice(0, 80) || null;
  const pais = await getPaisActual(supabase);
  if (entrada.id) {
    if (!UUID.test(entrada.id)) return { error: "Esa cuenta no existe." };
    const { data: previa } = await supabase.from("meta_cuentas").select("pais_id, nombre, act_id, activa").eq("id", entrada.id).maybeSingle();
    if (!previa) return { error: "Esa cuenta no existe." };
    if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, previa.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
    if (previa.act_id !== actId) return { error: "El ID de una cuenta no se cambia: agrega una cuenta nueva." };
    const { error } = await supabase.from("meta_cuentas").update({ nombre, tienda, activa: !!entrada.activa }).eq("id", entrada.id);
    if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
    await registrarAuditoria({ accion: "guardar_cuenta_meta", entidad: "meta_cuentas", entidadId: entrada.id, detalle: `${nombre} (${actId})`, antes: { Nombre: String(previa.nombre), Activa: previa.activa ? "Sí" : "No" }, despues: { Nombre: nombre, Activa: entrada.activa ? "Sí" : "No" } });
  } else {
    const { data, error } = await supabase.from("meta_cuentas").insert({ pais_id: pais.id, nombre, act_id: actId, tienda, activa: !!entrada.activa, creado_por: u.id, creado_por_nombre: u.nombre ?? u.email ?? null }).select("id").single();
    if (error) return { error: /duplicate|unique/i.test(error.message) ? "Esa cuenta publicitaria ya está agregada." : sinMigracion(error.message) ? MIGRACION : error.message };
    await registrarAuditoria({ accion: "guardar_cuenta_meta", entidad: "meta_cuentas", entidadId: data.id as string, detalle: `Agregó ${nombre} (${actId}) · ${pais.nombre}` });
  }
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/** «Probar conexión»: pregunta a Meta quién es el acceso y qué cuentas ve. No guarda nada. */
export async function probarConexionMeta(): Promise<{ ok: boolean; mensaje: string; cuentas: { id: string; nombre: string }[] }> {
  await requireModuloEscritura(MODULO);
  return probarAccesoMeta();
}

export interface ResumenLecturaVista {
  cuenta: string;
  ok: boolean;
  texto: string;
}

/** «Leer ahora»: lee las cuentas elegidas (o todas las del país de la barra) ahora mismo. Solo consulta Meta. */
export async function leerAhoraMeta(cuentaId?: string): Promise<{ error?: string; lecturas?: ResumenLecturaVista[] }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  let ids: string[];
  if (cuentaId) {
    if (!UUID.test(cuentaId)) return { error: "Esa cuenta no existe." };
    ids = [cuentaId];
  } else {
    const pais = await getPaisActual(supabase);
    const { data, error } = await supabase.from("meta_cuentas").select("id").eq("pais_id", pais.id).eq("activa", true);
    if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
    ids = (data ?? []).map((c) => c.id as string);
  }
  if (!ids.length) return { error: "No hay cuentas activas para leer: agrega una en «Cuentas»." };
  for (const id of ids) {
    const { data } = await supabase.from("meta_cuentas").select("pais_id").eq("id", id).maybeSingle();
    if (!data || !(await puedeVerPaisId(supabase, u.paisesPermitidos, data.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
  }
  try {
    const { lecturas } = await leerCuentasMeta(supabase, { cuentaIds: ids, presupuestoMs: 240_000 });
    await registrarAuditoria({ accion: "leer_cuentas_meta", entidad: "meta_cuentas", detalle: lecturas.map((l) => `${l.cuenta}: ${l.ok ? `${l.campanas} campañas, ${l.filas} filas` : "con error"}`).join(" · ") || "Sin lecturas" });
    revalidatePath("/anuncios-meta", "layout");
    return {
      lecturas: lecturas.map((l) => ({
        cuenta: l.cuenta,
        ok: l.ok,
        texto: l.ok ? `${l.campanas} campañas, ${l.anuncios} anuncios y ${l.filas} filas de resultados (del ${l.desde} al ${l.hasta}).${l.avisos.length ? ` ${l.avisos.join(" ")}` : ""}` : (l.error ?? "No se pudo leer."),
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer Meta." };
  }
}

/** El CPA tope rentable de un producto (lo que se puede pagar por compra sin perder). Cambia el «resultado» de todas sus campañas. */
export async function guardarTopeMeta(producto: string, tope: number): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  const nombre = String(producto ?? "").trim().slice(0, 120);
  const clave = claveDeProducto(nombre);
  if (!clave) return { error: "Elige un producto." };
  if (!Number.isFinite(tope) || tope <= 0 || tope >= 1000) return { error: "El CPA tope debe ser mayor que 0 y menor que 1000 dólares." };
  const supabase = createServiceClient();
  const { data: previo } = await supabase.from("meta_topes").select("cpa_tope").eq("producto_clave", clave).maybeSingle();
  const valor = Math.round(tope * 100) / 100;
  const { error } = await supabase.from("meta_topes").upsert({ producto_clave: clave, producto: nombre, cpa_tope: valor, actualizado_por: u.id, actualizado_por_nombre: u.nombre ?? u.email ?? null, actualizado_en: new Date().toISOString() }, { onConflict: "producto_clave" });
  if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
  await registrarAuditoria({ accion: "guardar_tope_meta", entidad: "meta_topes", entidadId: clave, detalle: nombre, antes: previo ? { "CPA tope": `$${Number(previo.cpa_tope).toFixed(2)}` } : undefined, despues: { "CPA tope": `$${valor.toFixed(2)}` } });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

const ETAPAS = new Set(["testing", "venta", "escala", "retargeting"]);

/** Corrige a mano el producto, el ángulo o la etapa de una campaña (la lectura de Meta ya no los pisa). Vacío = volver a lo que dice el nombre. */
export async function corregirCampanaMeta(id: string, cambio: { producto?: string | null; angulo?: string | null; etapa?: Etapa | "" | null }): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  if (!UUID.test(id)) return { error: "Esa campaña no existe." };
  const supabase = createServiceClient();
  const { data: c, error: e0 } = await supabase.from("meta_campanas").select("id, nombre, producto, angulo, etapa, manual, cuenta_id").eq("id", id).maybeSingle();
  if (e0) return { error: sinMigracion(e0.message) ? MIGRACION : e0.message };
  if (!c) return { error: "Esa campaña no existe." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id").eq("id", c.cuenta_id).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las campañas de ese país." };
  const manual = new Set<string>((c.manual as string[] | null) ?? []);
  const nuevo: Record<string, string | null> = {};
  const antes: Record<string, string> = {};
  const despues: Record<string, string> = {};
  const poner = (campo: "producto" | "angulo", valor: string | null | undefined, etiqueta: string) => {
    if (valor === undefined) return;
    const limpio = (valor ?? "").trim().slice(0, 80);
    if (limpio === ((c[campo] as string | null) ?? "")) return;
    antes[etiqueta] = (c[campo] as string | null) ?? "—";
    despues[etiqueta] = limpio || "—";
    nuevo[campo] = limpio || null;
    manual.add(campo);
  };
  poner("producto", cambio.producto, "Producto");
  poner("angulo", cambio.angulo, "Ángulo");
  if (cambio.etapa !== undefined) {
    const e = cambio.etapa ?? "";
    if (e && !ETAPAS.has(e)) return { error: "La etapa debe ser Testing, Ventas, Escala o Retargeting." };
    if ((e || null) !== ((c.etapa as string | null) ?? null)) {
      antes.Etapa = (c.etapa as string | null) ?? "—";
      despues.Etapa = e || "—";
      nuevo.etapa = e || null;
      manual.add("etapa");
    }
  }
  if (!Object.keys(nuevo).length) return {};
  const { error } = await supabase.from("meta_campanas").update({ ...nuevo, manual: [...manual] }).eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({ accion: "corregir_campana_meta", entidad: "meta_campanas", entidadId: id, detalle: String(c.nombre), antes, despues });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/** Vuelve a las etiquetas que dice el nombre (quita la corrección a mano) en la próxima lectura. */
export async function soltarCorreccionMeta(id: string, campos: ("producto" | "angulo" | "etapa")[]): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  if (!UUID.test(id)) return { error: "Esa campaña no existe." };
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("meta_campanas").select("manual, cuenta_id, nombre").eq("id", id).maybeSingle();
  if (!c) return { error: "Esa campaña no existe." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id").eq("id", c.cuenta_id).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las campañas de ese país." };
  const quedan = ((c.manual as string[] | null) ?? []).filter((m) => !campos.includes(m as "producto"));
  const { error } = await supabase.from("meta_campanas").update({ manual: quedan }).eq("id", id);
  if (error) return { error: error.message };
  await registrarAuditoria({ accion: "corregir_campana_meta", entidad: "meta_campanas", entidadId: id, detalle: `${String(c.nombre)} · volvió a lo que dice el nombre (${campos.join(", ")})` });
  revalidatePath("/anuncios-meta", "layout");
  return { aviso: "En la próxima lectura vuelve a tomar lo que dice el nombre." };
}

/** Aceptar, rechazar (con porqué) o posponer una sugerencia. Queda recordado hasta que vence (aceptada 30 días, rechazada 90, pospuesta 7). */
export async function decidirSugerenciaMeta(clave: string, estado: "aceptada" | "rechazada" | "pospuesta", nota?: string): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  const k = String(clave ?? "").trim();
  if (!/^[a-z_]+:[A-Za-z0-9_.:-]{1,80}$/.test(k)) return { error: "Esa sugerencia no se reconoce." };
  if (!["aceptada", "rechazada", "pospuesta"].includes(estado)) return { error: "Decisión no válida." };
  const texto = String(nota ?? "").trim().slice(0, 300);
  if (estado === "rechazada" && texto.length < 3) return { error: "Cuenta por qué la rechazas (así la próxima vez no se repite sin motivo)." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const hasta = new Date(new Date(`${hoy}T00:00:00Z`).getTime() + DIAS_DE_DECISION[estado] * 86_400_000).toISOString().slice(0, 10);
  const supabase = createServiceClient();
  const { error } = await supabase.from("meta_decisiones").upsert({ clave: k, estado, nota: texto || null, vigente_hasta: hasta, decidido_por: u.id, decidido_por_nombre: u.nombre ?? u.email ?? null, decidido_en: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
  await registrarAuditoria({ accion: "decidir_sugerencia_meta", entidad: "meta_decisiones", entidadId: k, detalle: `${estado}${texto ? ` · ${texto}` : ""}` });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/** Deshace una decisión: la sugerencia vuelve a mostrarse. */
export async function quitarDecisionMeta(clave: string): Promise<Resultado> {
  const acceso = await exigirAcceso({ modulo: MODULO, escritura: true });
  if (acceso.error !== undefined) return { error: acceso.error };
  const k = String(clave ?? "").trim();
  if (!/^[a-z_]+:[A-Za-z0-9_.:-]{1,80}$/.test(k)) return { error: "Esa sugerencia no se reconoce." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("meta_decisiones").delete().eq("clave", k);
  if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
  await registrarAuditoria({ accion: "decidir_sugerencia_meta", entidad: "meta_decisiones", entidadId: k, detalle: "volvió a mostrarse" });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/** Lo que dice el registro de actividad de Meta sobre una campaña (la línea de tiempo de su ficha). */
export async function obtenerActividadCampanaMeta(id: string): Promise<{ error?: string; eventos?: ActividadVista[] }> {
  const u = await requireModulo(MODULO);
  if (!UUID.test(id)) return { error: "Esa campaña no existe." };
  const supabase = createServiceClient();
  const { data: c } = await supabase.from("meta_campanas").select("cuenta_id").eq("id", id).maybeSingle();
  if (!c) return { error: "Esa campaña no existe." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id").eq("id", c.cuenta_id).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las campañas de ese país." };
  try {
    return { eventos: await actividadDeCampana(supabase, id) };
  } catch {
    return { eventos: [] };
  }
}

const ID_VIDEO = /^[0-9]{5,25}$/;

/** Analiza (o vuelve a analizar) un video con IA: baja el video de Meta, se lo muestra a Gemini y guarda el ángulo y lo que dice. Cuesta unos centavos. */
export async function analizarVideoAhoraMeta(videoId: string): Promise<{ error?: string; mensaje?: string }> {
  const u = await requireModuloEscritura(MODULO);
  if (!ID_VIDEO.test(videoId)) return { error: "Ese video no existe." };
  const supabase = createServiceClient();
  const v = await pendienteDeVideo(supabase, videoId);
  if (!v) return { error: "Ese video no está en ningún anuncio leído." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id").eq("id", v.cuentaId).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
  const r = await analizarVideoDeMeta(supabase, v, u.nombre ?? u.email ?? null);
  await registrarAuditoria({ accion: "analizar_video_meta", entidad: "meta_campanas", entidadId: videoId, detalle: `${r.estado} · ${r.mensaje}`.slice(0, 300) });
  revalidatePath("/anuncios-meta", "layout");
  return r.ok ? { mensaje: r.mensaje } : { error: r.mensaje };
}

/**
 * Reproducir un video en su ficha: pide a Meta la dirección temporal del archivo (la misma búsqueda del análisis con IA) y se la da a la pantalla, que la pone en un `<video>`. No se guarda: vence a las pocas
 * horas, así que se pide al pulsar «Reproducir». Si Meta no la da (el acceso del sistema no llega a ese video), devuelve el enlace de vista previa del anuncio, que se abre en Meta, o el motivo.
 */
export async function reproducirVideoMeta(videoId: string): Promise<{ error?: string; url?: string; duracion?: number | null; enlace?: string }> {
  const u = await requireModulo(MODULO);
  if (!ID_VIDEO.test(videoId)) return { error: "Ese video no existe." };
  const token = tokenDeMeta();
  if (!token) return { error: "Falta el acceso a Meta (META_ADS_ACCESS_TOKEN)." };
  const supabase = createServiceClient();
  const v = await pendienteDeVideo(supabase, videoId);
  if (!v) return { error: "Ese video no está en ningún anuncio leído." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id, nombre").eq("id", v.cuentaId).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
  const archivo = await buscarArchivoDeVideo(supabase, token, videoId, v.cuentaId);
  if (archivo.fuente && esHostDeVideoMeta(archivo.fuente)) return { url: archivo.fuente, duracion: archivo.duracion };
  // Sin el archivo: la vista previa del anuncio en Meta (se abre en otra pestaña) si el acceso la da.
  const { data: anuncio } = await supabase.from("meta_anuncios").select("meta_id").eq("video_id", videoId).limit(1).maybeSingle();
  if (anuncio?.meta_id) {
    const vista = await pedirMeta(`/${anuncio.meta_id as string}`, { fields: "preview_shareable_link" }, token);
    const enlace = vista.ok ? (vista.datos as { preview_shareable_link?: unknown }).preview_shareable_link : null;
    if (typeof enlace === "string" && esEnlaceDeMeta(enlace)) return { enlace, error: "Meta no entregó el archivo para verlo aquí; se abre la vista previa del anuncio en Meta." };
  }
  return { error: motivoSinArchivoDeVideo(archivo, (cuenta.nombre as string | undefined) ?? null, "") };
}

/**
 * «Analizar los pendientes», de a un video por llamada: la pantalla las encadena y así muestra el avance real («3 de 13») y se puede detener. Toma el pendiente que más gastó (los intentos de hace menos
 * de 3 minutos no se repiten, así uno que falla no se queda dando vueltas), lo analiza y dice cuántos faltaban antes de él.
 */
export async function analizarSiguienteMeta(): Promise<{ error?: string; ninguno?: boolean; videoId?: string; estado?: "analizado" | "sin_archivo" | "error"; mensaje?: string; faltan?: number }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  try {
    const { pendientes, total, afinar } = await videosPorAnalizar(supabase, { max: 1, ahora: true });
    // Primero lo que falta analizar por completo; cuando no queda nada, sigue con el reanálisis solo del ángulo de lo ya analizado.
    const v = pendientes[0] ?? afinar.pendientes[0];
    if (!v) return { ninguno: true, faltan: 0 };
    const afinando = !pendientes[0];
    const r = afinando ? await afinarAnguloDeVideo(supabase, v, u.nombre ?? u.email ?? null) : await analizarVideoDeMeta(supabase, v, u.nombre ?? u.email ?? null);
    await registrarAuditoria({ accion: afinando ? "afinar_angulo_video_meta" : "analizar_video_meta", entidad: "meta_campanas", entidadId: v.videoId, detalle: `${r.estado} · ${r.mensaje}`.slice(0, 300) });
    if (!r.ok && /Falta (el acceso|conectar)/.test(r.mensaje)) return { error: r.mensaje };
    return { videoId: v.videoId, estado: r.estado, mensaje: r.mensaje, faltan: total + afinar.total };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo analizar." };
  }
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_MS = 86_400_000;

/**
 * Trae el historial de una cuenta de a un tramo de fechas por llamada (la pantalla las encadena, de lo más nuevo a lo más viejo, y muestra el avance). Meta guarda hasta 37 meses. Cada tramo es de 31 días como mucho
 * y guarda lo mismo que una lectura normal: resultados por día, campañas, anuncios y registro de actividad de esas fechas.
 */
export async function leerTramoMeta(cuentaId: string, desde: string, hasta: string): Promise<{ error?: string; texto?: string; filas?: number; /** El tramo no cupo en una lectura (o Meta tardó): no se guardó nada y conviene leerlo en partes más chicas. */ partir?: boolean }> {
  const u = await requireModuloEscritura(MODULO);
  if (!UUID.test(cuentaId)) return { error: "Esa cuenta no existe." };
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return { error: "Las fechas no son válidas." };
  const dias = (new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / DIA_MS + 1;
  if (dias > 31) return { error: "Un tramo es de 31 días como máximo." };
  if (hasta > hoyEnPanama() || desde < restarDias(hoyEnPanama(), 37 * 31)) return { error: "Meta solo guarda los últimos 37 meses." };
  const supabase = createServiceClient();
  const { data: cuenta } = await supabase.from("meta_cuentas").select("id, nombre, act_id, ultima_lectura_en, pais_id").eq("id", cuentaId).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
  const r = await sincronizarCuenta(supabase, cuenta as { id: string; nombre: string; act_id: string; ultima_lectura_en: string | null }, { limiteMs: 250_000, rango: { desde, hasta } });
  await registrarAuditoria({ accion: "leer_cuentas_meta", entidad: "meta_cuentas", entidadId: cuentaId, detalle: `Historial ${desde} a ${hasta}: ${r.ok ? `${r.campanas} campañas, ${r.filas} filas` : "con error"}` });
  revalidatePath("/anuncios-meta", "layout");
  return r.ok ? { texto: `${r.filas} filas de resultados${r.avisos.length ? ` (${r.avisos[0]})` : ""}`, filas: r.filas } : { error: r.error ?? "No se pudo leer ese tramo.", partir: r.partir };
}

/**
 * Qué fechas de cada cuenta activa del país ya se trajeron de Meta (migración 0346): los rangos leídos completos y los días con resultados, de los últimos 37 meses. La pantalla arma de ahí el cuadro por mes y
 * decide qué tramos del historial ya no hace falta volver a leer. Solo mira.
 */
export async function coberturaMeta(): Promise<{ error?: string; cuentas?: { id: string; nombre: string; bruta: CoberturaBruta }[] }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return { error: "No tienes acceso a las cuentas de ese país." };
  const { data, error } = await supabase.from("meta_cuentas").select("id, nombre").eq("pais_id", pais.id).eq("activa", true).order("nombre");
  if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
  const hoy = hoyEnPanama();
  const desde = restarDias(hoy, 37 * 31);
  const cuentas: { id: string; nombre: string; bruta: CoberturaBruta }[] = [];
  for (const c of data ?? []) {
    const { data: bruta, error: e } = await supabase.rpc("meta_cobertura", { p_cuenta: c.id, p_desde: desde, p_hasta: hoy });
    if (e) return { error: /meta_cobertura|schema cache|does not exist/i.test(e.message) ? "Falta correr la migración 0346 (registro de lo leído de Meta) en Supabase." : e.message };
    const b = (bruta ?? {}) as { tramos?: unknown; dias?: unknown };
    cuentas.push({
      id: c.id as string,
      nombre: c.nombre as string,
      bruta: {
        tramos: Array.isArray(b.tramos) ? (b.tramos as unknown[]).filter((t): t is [string, string] => Array.isArray(t) && typeof t[0] === "string" && typeof t[1] === "string") : [],
        dias: Array.isArray(b.dias) ? (b.dias as unknown[]).filter((d): d is string => typeof d === "string") : [],
      },
    });
  }
  return { cuentas };
}

/** Corrige a mano el ángulo de un video (un nuevo análisis ya no lo pisa). Vacío = volver a lo que dijo la IA en el próximo análisis. */
export async function corregirAnguloVideoMeta(videoId: string, angulo: string): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  if (!ID_VIDEO.test(videoId)) return { error: "Ese video no existe." };
  const limpio = String(angulo ?? "").replace(/[«»"“”.,;:!?¿¡]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  const supabase = createServiceClient();
  const v = await pendienteDeVideo(supabase, videoId);
  if (!v) return { error: "Ese video no está en ningún anuncio leído." };
  const { data: cuenta } = await supabase.from("meta_cuentas").select("pais_id").eq("id", v.cuentaId).maybeSingle();
  if (!cuenta || !(await puedeVerPaisId(supabase, u.paisesPermitidos, cuenta.pais_id as string))) return { error: "No tienes acceso a las cuentas de ese país." };
  const { data: previo } = await supabase.from("meta_video_analisis").select("angulo").eq("video_id", videoId).maybeSingle();
  const fila: Record<string, unknown> = limpio
    ? { video_id: videoId, cuenta_id: v.cuentaId, angulo: limpio.charAt(0).toUpperCase() + limpio.slice(1), angulo_manual: true, ...(previo ? {} : { estado: "analizado", origen: "texto" }) }
    : { video_id: videoId, cuenta_id: v.cuentaId, angulo: null, angulo_manual: false, ...(previo ? {} : { estado: "error", origen: "texto", error: "Sin ángulo" }) };
  const { error } = await supabase.from("meta_video_analisis").upsert(fila, { onConflict: "video_id" });
  if (error) return { error: sinMigracion(error.message) ? "Falta correr la migración 0325 (ángulo de los videos) en Supabase." : error.message };
  await registrarAuditoria({ accion: "corregir_angulo_video_meta", entidad: "meta_campanas", entidadId: videoId, detalle: limpio || "Sin ángulo", antes: { Ángulo: (previo?.angulo as string | null) ?? "—" }, despues: { Ángulo: limpio || "—" } });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/**
 * «Clasificar los ganchos»: pone tipo (pregunta, problema o dolor, resultado…) al gancho de los videos que ya estaban analizados, de a 30 por llamada con el texto del gancho (no vuelve a ver el video). La pantalla encadena
 * las llamadas y muestra el avance. Solo las cuentas activas del país de la barra.
 */
export async function clasificarGanchosMeta(): Promise<{ error?: string; clasificados?: number; faltan?: number }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return { error: "No tienes acceso a las cuentas de ese país." };
  const { data, error } = await supabase.from("meta_cuentas").select("id").eq("pais_id", pais.id).eq("activa", true);
  if (error) return { error: sinMigracion(error.message) ? MIGRACION : error.message };
  const r = await clasificarGanchosPendientes(supabase, (data ?? []).map((c) => c.id as string));
  if (r.clasificados > 0) {
    await registrarAuditoria({ accion: "clasificar_ganchos_meta", entidad: "meta_video_analisis", detalle: `${r.clasificados} ganchos clasificados · ${pais.nombre}` });
    revalidatePath("/anuncios-meta", "layout");
  }
  return r.error ? { error: r.error, clasificados: r.clasificados, faltan: r.faltan } : { clasificados: r.clasificados, faltan: r.faltan };
}

/**
 * Pausa o reanuda el análisis automático de videos (el cron que corre cada 10 minutos). No toca lo manual («Analizar los pendientes», «Reintentar este video»). Queda en la auditoría con quién y cuándo.
 */
export async function cambiarAnalisisAutomaticoMeta(activo: boolean): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("meta_ajustes")
    .upsert({ clave: AJUSTE_ANALISIS_AUTOMATICO, valor: { activo: !!activo }, actualizado_por: u.id, actualizado_por_nombre: u.nombre ?? u.email ?? null, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return { error: /meta_ajustes|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 0347 (ajustes de Anuncios Meta) en Supabase." : error.message };
  await registrarAuditoria({ accion: "analisis_automatico_meta", entidad: "meta_ajustes", detalle: activo ? "Reanudó el análisis automático de videos" : "Pausó el análisis automático de videos" });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/** La entrega de cada producto de las campañas (para la lista y la ficha de Productos): tasa, pedidos resueltos y la tasa de todos. Sale del análisis guardado (se prepara solo); sin él, se calcula. Nunca lanza. */
export async function entregaPorProductoMeta(cuentaId: string | null): Promise<EntregasMeta> {
  const u = await requireModulo(MODULO);
  const vacio: EntregasMeta = { productos: {}, promedio: null, tienda: { envio: null, entrega: null } };
  try {
    const supabase = createServiceClient();
    const pais = await getPaisActual(supabase);
    if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return vacio;
    const guardado = cuentaId ? null : await leerAnalisisGuardado(supabase, pais.id);
    const analisis = guardado?.analisis ?? (await cargarHistorico({ paisId: pais.id, cuentaId: cuentaId && UUID.test(cuentaId) ? cuentaId : null, hoy: hoyEnPanama() }, supabase)).analisis;
    return {
      productos: Object.fromEntries(analisis.entrega.map((f) => [f.clave, { tasa: f.tasa, cerradas: f.cerradas, entregadas: f.entregadas, devueltas: f.devueltas, canceladas: f.canceladas, enCamino: f.enCamino, sinEnviar: f.sinEnviar }])),
      promedio: analisis.resumen.tasaEntrega,
      // Un análisis guardado antes de la calculadora no trae el total de la tienda: se suma el de los productos con campañas.
      tienda: tasasDe(analisis.pedidosDeLaTienda ?? sumarPedidos(analisis.entrega)),
      economia: Object.fromEntries((analisis.economia ?? []).map((e) => [e.clave, e])),
    };
  } catch {
    return vacio;
  }
}

/** Guarda los costos de la calculadora (envío, comisión contra entrega y costo operativo) del país de la barra. Los ven todos los que abren Anuncios Meta; los cambia quien puede modificar el módulo. */
export async function guardarCostosMeta(valores: unknown): Promise<Resultado> {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const acceso = await exigirAcceso({ modulo: MODULO, escritura: true, paisId: pais.id });
  if (acceso.error !== undefined) return { error: acceso.error };
  const u = acceso.usuario;
  const revisados = revisarCostos(valores);
  if ("error" in revisados) return revisados;
  const clave = claveDeCostos(pais.id);
  const { data: previo } = await supabase.from("meta_ajustes").select("valor").eq("clave", clave).maybeSingle();
  const { error } = await supabase
    .from("meta_ajustes")
    .upsert({ clave, valor: revisados.costos, actualizado_por: u.id, actualizado_por_nombre: u.nombre ?? u.email ?? null, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return { error: /meta_ajustes|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 0347 (ajustes de Anuncios Meta) en Supabase." : error.message };
  const antes = revisarCostos(previo?.valor);
  const texto = (c: { envio: number; cod: number; operativo: number }) => ({ Envío: `$${c.envio.toFixed(2)}`, "Comisión contra entrega": `$${c.cod.toFixed(2)}`, "Costo operativo": `$${c.operativo.toFixed(2)}` });
  await registrarAuditoria({ accion: "guardar_costos_meta", entidad: "meta_ajustes", detalle: pais.nombre, antes: "costos" in antes ? texto(antes.costos) : undefined, despues: texto(revisados.costos) });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

/**
 * El chat de Hallazgos (24 nov 2026): una pregunta sobre el historial («¿qué producto funciona mejor?», «¿qué cambió más este mes?») que la IA contesta **solo con las estadísticas que el sistema ya calculó** (`chat-ia.ts`).
 * Basta poder abrir el módulo. Cada pregunta cuesta unos centavos de crédito de IA: hay un tope por persona cada 24 horas. Usa Claude si está conectado y, si no, OpenAI. Devuelve el error como valor.
 */
export async function preguntarHallazgosMeta(pregunta: unknown, historial: unknown): Promise<{ respuesta?: string; proveedor?: string; error?: string; quedan?: number; analisisNuevos?: string[]; vigilancia?: { titulo: string; prioridad: Prioridad }; vigilanciaAutomatica?: string }> {
  const u = await requireModulo(MODULO);
  const revisada = revisarPregunta(pregunta);
  if ("error" in revisada) return { error: revisada.error };
  const conectadas = iasParaInterpretar(proveedoresConectados());
  if (!conectadas.length) return { error: "Falta conectar una IA de texto (la clave OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel)." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return { error: "No tienes acceso a ese país." };
  // El tope por persona: lo que ya preguntó en las últimas 24 horas.
  const { count } = await supabase.from("ia_consumo").select("id", { count: "exact", head: true }).eq("operacion", "meta_chat").eq("usuario_id", u.id).gte("creado_en", new Date(Date.now() - 86_400_000).toISOString());
  const usadas = count ?? 0;
  if (usadas >= LIMITES_CHAT.porDia) return { error: `Ya hiciste ${LIMITES_CHAT.porDia} preguntas hoy: es el tope diario (cada una cuesta crédito de IA). Mañana puedes seguir.` };
  const hoy = hoyEnPanama();
  const guardado = await leerAnalisisGuardado(supabase, pais.id);
  const analisis = guardado?.analisis ?? (await cargarHistorico({ paisId: pais.id, cuentaId: null, hoy }, supabase)).analisis;
  const tiendas = guardado?.tiendas ?? [];
  if (!tieneHistorialSuficiente(analisis)) return { error: "Todavía hay muy poco historial (menos de 8 campañas con gasto suficiente) para contestar con datos." };
  const investigadas = (await leerInvestigaciones(supabase, pais.id))?.items ?? [];
  const { data: filaSenales } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeSenales(pais.id)).maybeSingle();
  // En el chat, cada persona solo recibe las señales de los módulos que puede abrir.
  const senales = (leerValorSenales(filaSenales?.valor)?.items ?? []).map((s) => ({ ...s, otras: senalesVisibles(s.otras ?? [], u.modulos) }));
  const { data: filaRasgos } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeRasgos(pais.id)).maybeSingle();
  const rasgos = leerValorRasgos(filaRasgos?.valor)?.items ?? [];
  const { instrucciones, texto } = pedidoChat(analisis, tiendas, hoy, revisada.pregunta, sanitizarHistorial(historial), investigadas.map(textoParaIA), senales.map(senalesParaIA), rasgos.map(rasgosParaIA));
  const proveedor = conectadas[0];
  const quien = { id: u.id, nombre: u.nombre ?? null, email: u.email };
  const quedan = Math.max(0, LIMITES_CHAT.porDia - usadas - 1);
  const r = await pedirIAEn(proveedor, { instrucciones, texto, imagenes: [] }, { operacion: "meta_chat", modulo: "anuncios-meta", usuario: quien, referencia: revisada.pregunta.slice(0, 120) }, "analisis");
  if ("error" in r) return { error: r.error };
  const nombreIA = NOMBRE_PROVEEDOR[proveedor];
  const que = interpretarRespuestaChat(r.texto);

  // 1) Contestó con las estadísticas que ya estaban calculadas.
  if (que.tipo === "texto") {
    const respuesta = limpiarRespuesta(que.texto);
    if (!respuesta) return { error: "La IA no devolvió una respuesta. Inténtalo de nuevo." };
    return { respuesta, proveedor: nombreIA, quedan };
  }

  // 2b) Pidió ir a fondo con un producto: se cruzan sus pedidos con Servientrega, Monday, la confirmación y, leyendo las conversaciones de los pedidos devueltos, lo que dijeron los clientes.
  if (que.tipo === "investigar") {
    if (u.modulosSoloLectura.includes(MODULO)) return { respuesta: "Investigar a fondo lee conversaciones de clientes y gasta crédito de IA: hace falta poder modificar Anuncios Meta. Pídeselo a alguien con ese permiso.", proveedor: nombreIA, quedan };
    const fila = buscarFilaDeEntrega(analisis.entrega, que.producto);
    if (!fila?.enTienda) return { respuesta: `No encontré «${que.producto}» entre los productos con pedidos de la tienda. Dime el nombre como sale en la tabla de entrega de Productos.`, proveedor: nombreIA, quedan };
    if (!tiendas.length) return { error: "No se encontró la tienda de las cuentas en los pedidos (anótala en Cuentas › Tienda)." };
    const hecha = await investigarProducto(supabase, { paisId: pais.id, clave: fila.clave, producto: fila.nombre, productoEnTienda: fila.enTienda, tiendas, hoy, cpa: fila.cpa, tope: fila.tope, aFondo: { proveedor, quien } });
    if ("error" in hecha) return { error: hecha.error };
    await guardarInvestigacion(supabase, pais.id, hecha.investigacion, u.nombre ?? u.email ?? "—");
    await registrarAuditoria({ accion: "investigar_entrega_meta", entidad: "meta_ajustes", detalle: `${fila.nombre} · a fondo (por el chat)` });
    revalidatePath("/anuncios-meta", "layout");
    const r3 = await pedirIAEn(proveedor, { ...pedidoConResultados({ instrucciones, texto }, [textoParaIA(hecha.investigacion)]), imagenes: [] }, { operacion: "meta_chat_analisis", modulo: "anuncios-meta", usuario: quien, referencia: `investigar:${fila.clave}`.slice(0, 160) }, "analisis");
    if ("error" in r3) return { error: r3.error };
    const respuesta = limpiarRespuesta(r3.texto);
    if (!respuesta) return { error: "La IA no devolvió una respuesta. Inténtalo de nuevo." };
    return { respuesta: hecha.aviso ? `${respuesta}\n\nNota: ${hecha.aviso}` : respuesta, proveedor: nombreIA, quedan, analisisNuevos: [`Por qué no se entrega ${fila.nombre}`] };
  }

  // 2) Pidió un análisis que no estaba hecho: se corre sobre los resultados por día y se le devuelve para que conteste con eso.
  if (que.tipo === "analizar") {
    const specs = que.analisis.map((a) => validarAnalisis(a, hoy)).filter((a): a is NonNullable<typeof a> => a !== null).slice(0, 2);
    if (!specs.length) return { error: "No pude armar ese análisis con los datos que tengo. Prueba con otra pregunta, indicando las fechas o el producto." };
    const base = await cargarBaseDias({ paisId: pais.id, cuentaId: null }, supabase);
    if (!base) return { error: "No hay resultados por día de Meta para hacer ese análisis." };
    const resultados = specs.map((spec) => ejecutarAnalisis(spec, base));
    const tema = claveDeTema(specs[0]);
    const r2 = await pedirIAEn(proveedor, { ...pedidoConResultados({ instrucciones, texto }, resultados), imagenes: [] }, { operacion: "meta_chat_analisis", modulo: "anuncios-meta", usuario: quien, referencia: `tema:${tema}|${specs[0].titulo}`.slice(0, 160) }, "analisis");
    if ("error" in r2) return { error: r2.error };
    const respuesta = limpiarRespuesta(r2.texto);
    if (!respuesta) return { error: "La IA no devolvió una respuesta. Inténtalo de nuevo." };
    const automatica = await vigilarSiInsisten(supabase, { paisId: pais.id, hoy, tema, spec: specs[0], pregunta: revisada.pregunta });
    return { respuesta, proveedor: nombreIA, quedan, analisisNuevos: specs.map((x) => x.titulo), ...(automatica ? { vigilanciaAutomatica: automatica } : {}) };
  }

  // 3) Pidió que desde ahora se le indique algo: queda como una vigilancia con la prioridad que dijo. Hace falta poder modificar el módulo.
  if (u.modulosSoloLectura.includes(MODULO)) return { respuesta: "Tu cuenta solo puede ver Anuncios Meta: para dejar una vigilancia hace falta poder modificar el módulo. Pídeselo a alguien con ese permiso.", proveedor: nombreIA, quedan };
  const spec = validarVigilancia(que.vigilancia);
  if (!spec) return { error: "No pude entender qué vigilar. Dime la métrica y a qué (por ejemplo: «vigila el CPA de cada producto, prioridad alta»)." };
  const prioridad = validarPrioridad(que.prioridad);
  const creada = await crearVigilancia(supabase, { paisId: pais.id, hoy, spec, prioridad, origen: "chat", quien: u.nombre ?? u.email ?? "—", pregunta: revisada.pregunta, tema: null });
  if ("error" in creada) return { error: creada.error };
  await registrarAuditoria({ accion: "crear_vigilancia_meta", entidad: "meta_ajustes", detalle: `${spec.titulo} · prioridad ${prioridad}${creada.yaExistia ? " (ya existía: se actualizó)" : ""}` });
  revalidatePath("/anuncios-meta", "layout");
  const base = `Listo: ${que.mensaje ?? `desde ahora vigilo «${spec.titulo}» con prioridad ${prioridad}.`}`;
  return { respuesta: `${base}${creada.resultado ? ` Primera lectura: ${creada.resultado.resumen}` : ""} La verás en Hallazgos › Lo que estás vigilando y, si se pone mala, entre las sugerencias del Resumen.`, proveedor: nombreIA, quedan, vigilancia: { titulo: spec.titulo, prioridad } };
}

/**
 * Si una misma pregunta (el mismo desglose, filtros y métrica) se hizo `VECES_PARA_VIGILAR` veces en las últimas semanas, el sistema empieza a vigilarla solo con prioridad media y se lo dice a quien preguntó. Se cuenta con las
 * preguntas que ya dejó el chat en el consumo de IA (`referencia` = `tema:<llave>|…`), así que no necesita guardar nada más. Nunca lanza.
 */
async function vigilarSiInsisten(supabase: ReturnType<typeof createServiceClient>, o: { paisId: string; hoy: string; tema: string; spec: NonNullable<ReturnType<typeof validarAnalisis>>; pregunta: string }): Promise<string | null> {
  try {
    const desde = new Date(Date.now() - DIAS_DE_INSISTENCIA * 86_400_000).toISOString();
    const { count } = await supabase.from("ia_consumo").select("id", { count: "exact", head: true }).eq("operacion", "meta_chat_analisis").like("referencia", `tema:${o.tema}|%`).gte("creado_en", desde);
    if ((count ?? 0) < VECES_PARA_VIGILAR) return null;
    if ((await leerVigilancias(supabase, o.paisId)).some((v) => v.tema === o.tema)) return null;
    const creada = await crearVigilancia(supabase, { paisId: o.paisId, hoy: o.hoy, spec: vigilanciaDeAnalisis(o.spec), prioridad: "media", origen: "insistencia", quien: "Sistema (por las preguntas del chat)", pregunta: o.pregunta, tema: o.tema });
    if ("error" in creada || creada.yaExistia) return null;
    await registrarAuditoria({ accion: "crear_vigilancia_meta", entidad: "meta_ajustes", detalle: `${o.spec.titulo} · prioridad media (por insistencia: ${count} preguntas)` });
    revalidatePath("/anuncios-meta", "layout");
    return o.spec.titulo;
  } catch {
    return null;
  }
}

/** Cambia la prioridad de una vigilancia, la pausa o la reanuda, o la quita. Hace falta poder modificar el módulo. */
export async function cambiarVigilanciaMeta(id: unknown, cambio: { prioridad?: unknown; activa?: unknown; quitar?: unknown }): Promise<Resultado> {
  const u = await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || id.length > 40) return { error: "Esa vigilancia no existe." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return { error: "No tienes acceso a ese país." };
  const prioridad: Prioridad | undefined = cambio.prioridad === undefined ? undefined : validarPrioridad(cambio.prioridad);
  const r = await cambiarVigilancia(supabase, { paisId: pais.id, hoy: hoyEnPanama(), id, prioridad, activa: typeof cambio.activa === "boolean" ? cambio.activa : undefined, quitar: cambio.quitar === true, quien: u.nombre ?? u.email ?? "—" });
  if ("error" in r) return { error: r.error };
  await registrarAuditoria({ accion: "cambiar_vigilancia_meta", entidad: "meta_ajustes", detalle: cambio.quitar === true ? "Quitó una vigilancia" : `Cambió una vigilancia${prioridad ? ` · prioridad ${prioridad}` : ""}${typeof cambio.activa === "boolean" ? (cambio.activa ? " · reanudada" : " · pausada") : ""}` });
  revalidatePath("/anuncios-meta", "layout");
  return {};
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** El producto de la tabla de entrega que la persona nombró (por palabras, sin acentos); si hay varios, el que más gastó. */
function buscarFilaDeEntrega<T extends { nombre: string; gasto: number; enTienda: string | null }>(filas: readonly T[], texto: string): T | null {
  const palabras = sinTildes(texto).split(/\s+/).filter((p) => p.length >= 3);
  if (!palabras.length) return null;
  const coinciden = filas.filter((f) => palabras.every((p) => sinTildes(`${f.nombre} ${f.enTienda ?? ""}`).includes(p)));
  return coinciden.sort((a, b) => b.gasto - a.gasto)[0] ?? null;
}


/**
 * «Actualizar el análisis ahora» (Hallazgos): lo mismo que hace el sistema cada día —calcular todo el historial, evaluar las vigilancias, investigar por qué no se entregan los productos con problema, mirar los creativos y lo que pasó en otros módulos
 * e interpretar con las IA— pero ya, sin esperar a la próxima lectura. Gasta crédito de IA (la interpretación se vuelve a pedir) y tarda uno o dos minutos: hace falta poder modificar el módulo.
 */
export async function actualizarAnalisisMeta(): Promise<{ error?: string; mensaje?: string }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, u.paisesPermitidos, pais.id))) return { error: "No tienes acceso a ese país." };
  const r = await refrescarAnalisisMeta(supabase, { paisId: pais.id, paisNombre: pais.nombre, hoy: hoyEnPanama(), interpretar: true, forzar: true, bloqueo: true });
  await registrarAuditoria({ accion: "actualizar_analisis_meta", entidad: "meta_ajustes", detalle: `${pais.nombre} · ${r.analizado ? "listo" : (r.motivo ?? "no se pudo")}` });
  revalidatePath("/anuncios-meta", "layout");
  if (!r.analizado) return { error: r.motivo ?? "No se pudo actualizar el análisis." };
  const partes = [
    "Análisis del historial al día.",
    `${r.investigados ?? 0} ${r.investigados === 1 ? "producto investigado" : "productos investigados"} por su entrega.`,
    `${r.conSenales ?? 0} ${r.conSenales === 1 ? "producto" : "productos"} con señales de creativos y de otros módulos.`,
    r.interpretado ? "Interpretación de la IA renovada." : `Interpretación: ${r.motivo ?? "no se renovó"}.`,
  ];
  return { mensaje: partes.join(" ") };
}
