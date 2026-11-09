"use server";

// Acciones de Cierre y control (migración 0927): responsable y fecha límite de cada tarea, explicación de las variaciones,
// cuadres de inventario y de Dropi, notas del cierre y los ajustes del cierre. Todas devuelven `{ error }` como valor.

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { mesEnCursoPanama } from "@/lib/af4/fecha";
import { createServiceClient } from "@/lib/supabase/server";
import { notificarPersona } from "@/lib/finanzas/avisos-cierre";
import { SIN_MIGRACION_CIERRE } from "@/lib/finanzas/cargar-cierre";
import {
  SIN_MIGRACION_CONTROL,
  cargarConfigCierre,
  cargarVariaciones,
  partesDropiAl,
  valorInventarioWms,
} from "@/lib/finanzas/cargar-cierre-control";
import { CLAVES_TAREAS, TAREAS, finDeMes, leerPeriodo, nombreMes } from "@/lib/finanzas/cierre";
import { ETIQUETA_CUADRE, pendienteDropi, validarConfigCierre, type ClaseCuadre } from "@/lib/finanzas/cierre-control";
import { leerMonto } from "@/lib/finanzas/ajustes-cierre";

const MODULO = "cierre-mes";
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "");
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const errorCierre = (e: { code?: string; message: string }, porDefecto: string) =>
  e.code === "FC001" ? "El mes está cerrado: reábrelo para cambiarlo." : `${porDefecto}: ${e.message}`;

function revalidar(periodo: string) {
  revalidatePath("/cierre-mes");
  revalidatePath(`/cierre-mes/${periodo.slice(0, 7)}`);
  revalidatePath("/panel-financiero");
}

/** El cierre del mes (lo crea abierto si no existe). */
async function cierreDe(supabase: SupabaseClient, periodo: string, usuarioId: string): Promise<{ error: string } | { id: string; estado: string }> {
  const creado = await supabase.from("fin_cierres").upsert({ periodo, creado_por: usuarioId }, { onConflict: "periodo", ignoreDuplicates: true });
  if (creado.error) return { error: SIN_MIGRACION_CIERRE };
  const { data, error } = await supabase.from("fin_cierres").select("id, estado").eq("periodo", periodo).single();
  if (error || !data) return { error: SIN_MIGRACION_CIERRE };
  return data as { id: string; estado: string };
}

/**
 * Responsable y fecha límite de una tarea del cierre. Al asignar a otra persona le llega un aviso «Para ti». Sin fecha,
 * la tarea vence en la fecha objetivo del mes.
 */
export async function asignarTarea(periodoTexto: string, clave: string, responsableTexto: string, fechaTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    if (!CLAVES_TAREAS.has(clave)) return { error: "Tarea inválida." };
    const responsable = responsableTexto ? (ES_UUID.test(responsableTexto) ? responsableTexto : null) : "";
    if (responsable === null) return { error: "Responsable inválido." };
    const fecha = fechaTexto ? (FECHA.test(fechaTexto) && fechaTexto >= periodo ? fechaTexto : null) : "";
    if (fecha === null) return { error: "La fecha límite debe ser posterior al inicio del mes." };
    const supabase = createServiceClient();
    if (responsable) {
      const { data: p } = await supabase.from("perfiles").select("id, activo").eq("id", responsable).maybeSingle();
      if (!p || !p.activo) return { error: "Esa persona no está activa." };
    }
    const cierre = await cierreDe(supabase, periodo, usuario.id);
    if ("error" in cierre) return cierre;
    if (cierre.estado === "cerrado") return { error: "El mes está cerrado." };
    const { data: previo } = await supabase.from("fin_cierre_tareas").select("responsable_id, fecha_limite").eq("cierre_id", cierre.id).eq("clave", clave).maybeSingle();
    const titulo = TAREAS.find((t) => t.clave === clave)!.titulo;
    const fila = { responsable_id: responsable || null, fecha_limite: fecha || null, aviso_estado: null };
    const r = previo
      ? await supabase.from("fin_cierre_tareas").update(fila).eq("cierre_id", cierre.id).eq("clave", clave)
      : await supabase.from("fin_cierre_tareas").insert({ cierre_id: cierre.id, clave, titulo, ...fila });
    if (r.error) return { error: r.error.message.includes("responsable_id") || r.error.message.includes("fecha_limite") ? SIN_MIGRACION_CONTROL : `No se pudo guardar: ${r.error.message}` };
    const cambioResponsable = (previo?.responsable_id ?? null) !== (responsable || null);
    if (responsable && cambioResponsable && responsable !== usuario.id) {
      await notificarPersona(supabase, {
        usuarioId: responsable,
        titulo: `Te asignaron una tarea del cierre: ${titulo}`,
        texto: `${nombreMes(periodo)}${fecha ? ` · vence el ${fecha.split("-").reverse().join("/")}` : ""}`,
        href: `/cierre-mes/${periodo.slice(0, 7)}`,
        autorId: usuario.id,
        autorNombre: usuario.nombre ?? usuario.email,
      });
    }
    await registrarAuditoria({
      accion: "asignar_tarea_cierre",
      entidad: "fin_cierres",
      entidadId: cierre.id,
      detalle: `${nombreMes(periodo)} · ${titulo}`,
      antes: { Responsable: previo?.responsable_id ? "Asignado" : "Sin responsable", "Fecha límite": previo?.fecha_limite ?? "La del mes" },
      despues: { Responsable: responsable ? "Asignado" : "Sin responsable", "Fecha límite": fecha || "La del mes" },
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo asignar la tarea.");
  }
}

/** La explicación escrita de una línea del EERR que varió más que el umbral (vacía = la quita). */
export async function explicarVariacion(periodoTexto: string, linea: string, explicacionTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    const explicacion = texto(explicacionTexto, 2000);
    const supabase = createServiceClient();
    const { config } = await cargarConfigCierre(supabase);
    const lineas = await cargarVariaciones(supabase, periodo, config);
    if (!lineas) return { error: SIN_MIGRACION_CONTROL };
    const l = lineas.find((x) => x.clave === linea);
    if (!l) return { error: "Esa línea no está en el EERR del mes." };
    if (!explicacion) {
      const { error } = await supabase.from("fin_cierre_variaciones").delete().eq("periodo", periodo).eq("linea", linea);
      if (error) return { error: errorCierre(error, "No se pudo quitar") };
    } else {
      if (explicacion.length < 5) return { error: "Escribe una explicación de al menos 5 letras." };
      const { error } = await supabase.from("fin_cierre_variaciones").upsert(
        { periodo, linea, etiqueta: l.etiqueta, actual: l.actual, anterior: l.anterior, explicacion, escrito_por: usuario.id, escrito_en: new Date().toISOString() },
        { onConflict: "periodo,linea" },
      );
      if (error) return { error: errorCierre(error, "No se pudo guardar") };
    }
    const cierre = await cierreDe(supabase, periodo, usuario.id);
    await registrarAuditoria({
      accion: "explicar_variacion_cierre",
      entidad: "fin_cierres",
      entidadId: "error" in cierre ? undefined : cierre.id,
      detalle: `${nombreMes(periodo)} · ${l.etiqueta}${explicacion ? `: ${explicacion}` : " (quitada)"}`.slice(0, 1000),
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la explicación.");
  }
}

/**
 * Registra un cuadre del mes. El lado del sistema lo calcula el servidor: el inventario valorizado del WMS hoy, o lo que
 * Dropi tiene pendiente al último día del mes. Los libros los escribe la persona (inventario) o salen de la cartera por
 * cobrar con Dropi (si no escribe otro valor).
 */
export async function registrarCuadre(periodoTexto: string, clase: string, librosTexto: string, explicacionTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    if (periodo >= mesEnCursoPanama()) return { error: "Se cuadra un mes que ya terminó." };
    if (clase !== "inventario" && clase !== "cartera_dropi") return { error: "Cuadre inválido." };
    const explicacion = texto(explicacionTexto, 2000) || null;
    const supabase = createServiceClient();
    const { config } = await cargarConfigCierre(supabase);
    let sistema: number;
    let detalle: Record<string, unknown>;
    let libros = librosTexto.trim() ? leerMonto(librosTexto) : null;
    if (librosTexto.trim() && libros === null) return { error: "Escribe el valor en libros como un monto (Ej: 25000.00)." };
    if (clase === "inventario") {
      const wms = await valorInventarioWms(supabase);
      if (!wms) return { error: "No se pudo leer el inventario valorizado del WMS (migración 0921)." };
      if (libros === null) return { error: "Escribe el valor del inventario en libros." };
      sistema = wms.valor;
      detalle = { unidades: wms.unidades, skus_sin_costo: wms.sinCosto, leido_en: new Date().toISOString() };
    } else {
      const p = await partesDropiAl(supabase, finDeMes(periodo), config.contraparteDropi);
      if (!p) return { error: SIN_MIGRACION_CONTROL };
      sistema = pendienteDropi(p);
      libros = libros ?? p.carteraLibros;
      detalle = { ...p, corte: finDeMes(periodo) };
    }
    const { error } = await supabase.from("fin_cierre_cuadres").upsert(
      {
        periodo,
        clase,
        valor_libros: libros,
        valor_sistema: Math.round(sistema * 100) / 100,
        detalle,
        explicacion,
        registrado_por: usuario.id,
        registrado_en: new Date().toISOString(),
      },
      { onConflict: "periodo,clase" },
    );
    if (error) return { error: error.code === "42P01" ? SIN_MIGRACION_CONTROL : errorCierre(error, "No se pudo guardar el cuadre") };
    const cierre = await cierreDe(supabase, periodo, usuario.id);
    await registrarAuditoria({
      accion: "registrar_cuadre_cierre",
      entidad: "fin_cierres",
      entidadId: "error" in cierre ? undefined : cierre.id,
      detalle: `${nombreMes(periodo)} · ${ETIQUETA_CUADRE[clase as ClaseCuadre]}: libros ${libros} · sistema ${Math.round(sistema * 100) / 100}${explicacion ? ` · ${explicacion}` : ""}`.slice(0, 1000),
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo registrar el cuadre.");
  }
}

/** Las notas del cierre (salen en el paquete). */
export async function guardarNotasCierre(periodoTexto: string, notasTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    const notas = typeof notasTexto === "string" ? notasTexto.trim().slice(0, 2000) : "";
    const supabase = createServiceClient();
    const cierre = await cierreDe(supabase, periodo, usuario.id);
    if ("error" in cierre) return cierre;
    if (cierre.estado === "cerrado") return { error: "El mes está cerrado: reábrelo para cambiar sus notas." };
    const { error } = await supabase.from("fin_cierres").update({ notas: notas || null, actualizado_en: new Date().toISOString() }).eq("id", cierre.id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({ accion: "notas_cierre", entidad: "fin_cierres", entidadId: cierre.id, detalle: `${nombreMes(periodo)} · ${notas || "(sin notas)"}`.slice(0, 1000) });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar las notas.");
  }
}

/** Los ajustes del cierre (fecha objetivo, umbrales, tolerancias): quien puede modificar Cierre de mes y Usuarios y roles. */
export async function guardarConfigCierre(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!usuario.modulos.includes("usuarios") || usuario.modulosSoloLectura.includes("usuarios")) {
      return { error: "Los ajustes del cierre los cambia quien puede modificar Usuarios y roles." };
    }
    const v = validarConfigCierre(Object.fromEntries(formData.entries()));
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { config: antes } = await cargarConfigCierre(supabase);
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: "cierre", valor: v.valor, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    const fila = (c: typeof antes) => ({
      "Día hábil objetivo": String(c.diaHabil),
      "Umbral %": String(c.umbralPct),
      "Umbral USD": String(c.umbralMonto),
      "Tolerancia inventario": String(c.toleranciaInventario),
      "Tolerancia Dropi": String(c.toleranciaDropi),
      "Contraparte Dropi": c.contraparteDropi,
    });
    await registrarAuditoria({ accion: "cambiar_config_cierre", entidad: "fin_config", detalle: "Ajustes del cierre de mes", antes: fila(antes), despues: fila(v.config) });
    revalidatePath("/cierre-mes");
    revalidatePath("/cierre-mes/configuracion");
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar los ajustes.");
  }
}
