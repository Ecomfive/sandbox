"use server";

import { revalidatePath } from "next/cache";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { analizarPendientes, analizarVideoDeMeta, pendienteDeVideo } from "@/lib/meta-ads/analizar-videos";
import { actividadDeCampana } from "@/lib/meta-ads/datos";
import { leerCuentasMeta } from "@/lib/meta-ads/leer-cuentas";
import { claveDeProducto, type Etapa } from "@/lib/meta-ads/nombre";
import { normalizarActId } from "@/lib/meta-ads/normalizar";
import { probarAccesoMeta } from "@/lib/meta-ads/sincronizar";
import { DIAS_DE_DECISION } from "@/lib/meta-ads/sugerencias";
import type { ActividadVista } from "@/lib/meta-ads/vistas";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "anuncios-meta";
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

const ETAPAS = new Set(["testing", "escala", "retargeting"]);

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
    if (e && !ETAPAS.has(e)) return { error: "La etapa debe ser Testing, Escala o Retargeting." };
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

/** «Analizar los pendientes»: los videos con gasto que todavía no tienen análisis, de más a menos gasto, hasta donde alcance el tiempo (se puede pulsar otra vez para seguir). */
export async function analizarPendientesMeta(): Promise<{ error?: string; analizados?: number; sinArchivo?: number; errores?: number; faltan?: number; mensajes?: string[] }> {
  const u = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  try {
    const r = await analizarPendientes(supabase, { limiteMs: 270_000, max: 8, quien: u.nombre ?? u.email ?? null });
    await registrarAuditoria({ accion: "analizar_video_meta", entidad: "meta_campanas", detalle: `${r.analizados} analizados con el video, ${r.sinArchivo} solo con el texto, ${r.errores} con error, faltan ${r.faltan}` });
    revalidatePath("/anuncios-meta", "layout");
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo analizar." };
  }
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
