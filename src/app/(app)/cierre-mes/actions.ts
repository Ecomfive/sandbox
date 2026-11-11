"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { mesEnCursoPanama } from "@/lib/af4/fecha";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { createServiceClient } from "@/lib/supabase/server";
import type { EventoHistorial } from "@/components/ui/historial-generico";
import { guardarFotoPronostico } from "@/lib/finanzas/guardar-foto-plan";
import { cargarDatosMeses, tomarFotografia, SIN_MIGRACION_CIERRE } from "@/lib/finanzas/cargar-cierre";
import { resolverAlertasCierre } from "@/lib/finanzas/avisos-cierre";
import { puedeAprobar } from "@/lib/finanzas/cierre-control";
import {
  CLAVES_TAREAS,
  ETIQUETA_ESTADO_CIERRE,
  ETIQUETA_ESTADO_TAREA,
  TAREAS,
  combinarTareas,
  esEstadoTarea,
  evaluarTareas,
  leerPeriodo,
  nombreMes,
  puedeCerrar,
  transicionValida,
  validarMarca,
  type EstadoCierre,
  type MarcaTarea,
  type TareaCierre,
} from "@/lib/finanzas/cierre";

const MODULO = "cierre-mes";
/** Reabrir un mes cerrado: además de Cierre de mes, poder modificar Usuarios y roles. */
const MODULO_REABRIR = "usuarios";
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const mesEnCurso = () => mesEnCursoPanama();
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

interface FilaCierre {
  id: string;
  estado: EstadoCierre;
  veces_cerrado: number;
  enviado_revision_por: string | null;
}

/** El cierre del mes; si no existe, lo crea abierto. */
async function asegurarCierre(supabase: SupabaseClient, periodo: string, usuarioId: string): Promise<{ error: string } | FilaCierre> {
  const creado = await supabase.from("fin_cierres").upsert({ periodo, creado_por: usuarioId }, { onConflict: "periodo", ignoreDuplicates: true });
  if (creado.error) return { error: SIN_MIGRACION_CIERRE };
  const { data, error } = await supabase.from("fin_cierres").select("id, estado, veces_cerrado, enviado_revision_por").eq("periodo", periodo).single();
  if (error || !data) return { error: SIN_MIGRACION_CIERRE };
  return data as FilaCierre;
}

/** El checklist del mes ahora: evaluación automática + lo marcado a mano. */
async function checklistActual(supabase: SupabaseClient, periodo: string, cierreId: string): Promise<{ error: string } | TareaCierre[]> {
  const [datos, marcas] = await Promise.all([
    cargarDatosMeses(supabase, [periodo]),
    supabase.from("fin_cierre_tareas").select("clave, estado, a_mano, comentario").eq("cierre_id", cierreId),
  ]);
  if (marcas.error) return { error: SIN_MIGRACION_CIERRE };
  const evaluadas = evaluarTareas(periodo, datos.get(periodo)!);
  return combinarTareas(
    evaluadas,
    (marcas.data ?? []).map((m) => ({ clave: m.clave, estado: m.estado, aMano: m.a_mano, comentario: m.comentario }) as MarcaTarea),
  );
}

/** Deja en `fin_cierre_tareas` lo que se vio al pasar de estado (sin pisar lo marcado a mano). */
async function guardarChecklist(supabase: SupabaseClient, cierreId: string, tareas: TareaCierre[]): Promise<string | null> {
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("fin_cierre_tareas").upsert(
    tareas.map((t) => ({
      cierre_id: cierreId,
      clave: t.clave,
      titulo: t.titulo,
      estado: t.estado,
      a_mano: t.aMano,
      automatico: t.resultado,
      detalle: t.detalle.slice(0, 500),
      evaluado_en: ahora,
      ...(t.aMano ? {} : { comentario: t.comentario }),
    })),
    { onConflict: "cierre_id,clave" },
  );
  return error ? error.message : null;
}

function revalidar(periodo: string) {
  revalidatePath("/cierre-mes");
  revalidatePath(`/cierre-mes/${periodo}`);
  revalidatePath("/panel-financiero");
}

type Destino = "en_revision" | "abierto" | "cerrado";

/**
 * Pasa el mes a otro estado: «Enviar a revisión», «Volver a abierto» o «Cerrar mes». Cerrar vuelve a evaluar el checklist
 * aquí (no se confía en lo que vio el navegador) y guarda la fotografía. Reabrir un mes cerrado es `reabrirMes`.
 */
export async function cambiarEstadoCierre(periodoTexto: string, destino: Destino): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    if (destino !== "en_revision" && destino !== "abierto" && destino !== "cerrado") return { error: "Paso inválido." };
    if (periodo >= mesEnCurso()) return { error: "Solo se cierra un mes que ya terminó." };
    const supabase = createServiceClient();
    const cierre = await asegurarCierre(supabase, periodo, usuario.id);
    if ("error" in cierre) return cierre;
    if (cierre.estado === "cerrado" && destino === "abierto") return { error: "Para reabrir un mes cerrado usa «Reabrir»." };
    if (!transicionValida(cierre.estado, destino)) {
      return { error: `El mes está ${ETIQUETA_ESTADO_CIERRE[cierre.estado].toLowerCase()}: no puede pasar a ${ETIQUETA_ESTADO_CIERRE[destino].toLowerCase()}.` };
    }
    const ahora = new Date().toISOString();
    let cambios: Record<string, unknown> = { estado: destino, actualizado_en: ahora };
    let detalle = "";

    if (destino !== "abierto") {
      const tareas = await checklistActual(supabase, periodo, cierre.id);
      if ("error" in tareas) return tareas;
      if (destino === "cerrado") {
        // Aprobación en dos pasos: quien preparó (envió a revisión) no aprueba.
        const aprueba = puedeAprobar(cierre.enviado_revision_por, usuario.id);
        if (!aprueba.ok) return { error: aprueba.motivo };
        const ok = puedeCerrar(cierre.estado, tareas);
        if (!ok.ok) return { error: ok.motivo };
        const fotografia = await tomarFotografia(supabase, periodo);
        cambios = { ...cambios, cerrado_en: ahora, cerrado_por: usuario.id, fotografia, veces_cerrado: cierre.veces_cerrado + 1 };
        const excepciones = tareas.filter((t) => t.aMano && t.resultado !== "ok").map((t) => `${t.titulo} (${ETIQUETA_ESTADO_TAREA[t.estado].toLowerCase()}: ${t.comentario})`);
        detalle = `${excepciones.length ? `Excepciones: ${excepciones.join("; ")}` : "Checklist en verde"} · Aprobado (lo preparó otra persona)`;
      } else {
        cambios = { ...cambios, enviado_revision_en: ahora, enviado_revision_por: usuario.id };
        const verdes = tareas.filter((t) => t.color === "verde").length;
        detalle = `Checklist ${verdes} de ${tareas.length}`;
      }
      const err = await guardarChecklist(supabase, cierre.id, tareas);
      if (err) return { error: `No se pudo guardar el checklist: ${err}` };
    }

    // Solo si nadie lo cambió mientras tanto.
    const { data, error } = await supabase.from("fin_cierres").update(cambios).eq("id", cierre.id).eq("estado", cierre.estado).select("id");
    if (error) return { error: error.code === "FC002" ? "Quien preparó el cierre no puede aprobarlo: lo cierra otra persona." : `No se pudo guardar: ${error.message}` };
    if (!data?.length) return { error: "Otra persona cambió el mes recién. Recarga la página." };
    if (destino === "cerrado") {
      await resolverAlertasCierre(supabase, periodo);
      // Planificación: la foto del pronóstico de 18 meses con el mes recién cerrado (en segundo plano, sin frenar el cierre).
      after(() => guardarFotoPronostico(supabase, usuario.id).catch(() => undefined));
    }
    await registrarAuditoria({
      accion: destino === "cerrado" ? "cerrar_mes" : destino === "en_revision" ? "enviar_revision_cierre" : "devolver_cierre",
      entidad: "fin_cierres",
      entidadId: cierre.id,
      detalle: `${nombreMes(periodo)}${detalle ? ` · ${detalle}` : ""}`.slice(0, 1000),
      antes: { Estado: ETIQUETA_ESTADO_CIERRE[cierre.estado] },
      despues: { Estado: ETIQUETA_ESTADO_CIERRE[destino] },
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo cambiar el estado del mes.");
  }
}

/** Reabre un mes cerrado: solo quien puede modificar Usuarios y roles, con motivo. La fotografía se conserva. */
export async function reabrirMes(periodoTexto: string, motivoTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!usuario.modulos.includes(MODULO_REABRIR) || usuario.modulosSoloLectura.includes(MODULO_REABRIR)) {
      return { error: "Reabrir un mes cerrado lo hace quien puede modificar Usuarios y roles." };
    }
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    const motivo = texto(motivoTexto, 500);
    if (motivo.length < 5) return { error: "Escribe el motivo para reabrir el mes." };
    const supabase = createServiceClient();
    const ahora = new Date().toISOString();
    const { data: previo } = await supabase.from("fin_cierres").select("cerrado_en, cerrado_por").eq("periodo", periodo).maybeSingle();
    const { data, error } = await supabase
      .from("fin_cierres")
      .update({ estado: "abierto", reabierto_en: ahora, reabierto_por: usuario.id, motivo_reapertura: motivo, actualizado_en: ahora })
      .eq("periodo", periodo)
      .eq("estado", "cerrado")
      .select("id");
    if (error) return { error: `No se pudo reabrir: ${error.message}` };
    if (!data?.length) return { error: "El mes no está cerrado." };
    // El registro de reaperturas (migración 0927): sin la tabla, queda solo la última en fin_cierres y la auditoría.
    await supabase.from("fin_cierre_reaperturas").insert({
      cierre_id: data[0].id,
      periodo,
      reabierto_en: ahora,
      reabierto_por: usuario.id,
      motivo,
      cerrado_en: previo?.cerrado_en ?? null,
      cerrado_por: previo?.cerrado_por ?? null,
    });
    await registrarAuditoria({
      accion: "reabrir_mes",
      entidad: "fin_cierres",
      entidadId: data[0].id as string,
      detalle: `${nombreMes(periodo)} · Motivo: ${motivo}`,
      antes: { Estado: ETIQUETA_ESTADO_CIERRE.cerrado },
      despues: { Estado: ETIQUETA_ESTADO_CIERRE.abierto },
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo reabrir el mes.");
  }
}

/**
 * Marca a mano una tarea del checklist: «Hecho», «No aplica» o «Pendiente» (quita la marca). «No aplica» siempre lleva
 * comentario, y «Hecho» también cuando el sistema no la ve resuelta. Con el mes cerrado no se marca nada.
 */
export async function marcarTarea(periodoTexto: string, clave: string, estado: string, comentarioTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const periodo = leerPeriodo(periodoTexto);
    if (!periodo) return { error: "Mes inválido." };
    if (!CLAVES_TAREAS.has(clave)) return { error: "Tarea inválida." };
    if (!esEstadoTarea(estado)) return { error: "Estado inválido." };
    const comentario = texto(comentarioTexto, 1000) || null;
    const supabase = createServiceClient();
    const cierre = await asegurarCierre(supabase, periodo, usuario.id);
    if ("error" in cierre) return cierre;
    if (cierre.estado === "cerrado") return { error: "El mes está cerrado: reábrelo para cambiar el checklist." };
    const tareas = await checklistActual(supabase, periodo, cierre.id);
    if ("error" in tareas) return tareas;
    const tarea = tareas.find((t) => t.clave === clave)!;
    if (estado !== "pendiente") {
      const motivo = validarMarca(estado, comentario, tarea.resultado, clave);
      if (motivo) return { error: motivo };
    }
    const ahora = new Date().toISOString();
    const aMano = estado !== "pendiente";
    const { error } = await supabase.from("fin_cierre_tareas").upsert(
      {
        cierre_id: cierre.id,
        clave,
        titulo: TAREAS.find((t) => t.clave === clave)!.titulo,
        estado: aMano ? estado : tarea.resultado === "ok" ? "hecho" : "pendiente",
        a_mano: aMano,
        automatico: tarea.resultado,
        detalle: tarea.detalle.slice(0, 500),
        evaluado_en: ahora,
        marcado_por: aMano ? usuario.id : null,
        marcado_en: aMano ? ahora : null,
        comentario: aMano ? comentario : null,
      },
      { onConflict: "cierre_id,clave" },
    );
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "marcar_tarea_cierre",
      entidad: "fin_cierres",
      entidadId: cierre.id,
      detalle: `${nombreMes(periodo)} · ${tarea.titulo}${comentario && aMano ? ` · ${comentario}` : ""}`.slice(0, 1000),
      antes: { [tarea.titulo]: tarea.aMano ? ETIQUETA_ESTADO_TAREA[tarea.estado] : "Automática" },
      despues: { [tarea.titulo]: aMano ? ETIQUETA_ESTADO_TAREA[estado] : "Automática" },
    });
    revalidar(periodo);
    return {};
  } catch (e) {
    return fallo(e, "No se pudo marcar la tarea.");
  }
}

/** La actividad de un cierre (lectura: basta poder abrir Cierre de mes). */
export async function obtenerActividadCierre(id: string): Promise<{ eventos: EventoHistorial[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes(MODULO)) return { error: "Sin acceso." };
  if (!ES_UUID.test(id)) return { error: "Cierre inválido." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "fin_cierres")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(100);
  if (error) return { error: "No se pudo leer la actividad." };
  return {
    eventos: (data ?? []).map((e) => ({
      id: e.id as string,
      evento: formatearEventoAuditoria(e as Parameters<typeof formatearEventoAuditoria>[0]),
      creadoEn: e.creado_en as string,
    })),
  };
}
