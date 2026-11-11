"use server";

import { revalidatePath } from "next/cache";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CLAVE_CAPITAL, configCapitalAGuardar, leerConfigCapital, validarConfigCapital } from "@/lib/finanzas/capital-config";
import { SIN_MIGRACION_PROYECTOS } from "@/lib/finanzas/cargar-capital";
import { evaluarYGuardarRiesgos, SIN_MIGRACION_RIESGOS } from "@/lib/finanzas/cargar-riesgos";
import { ETIQUETA_ESTADO_PROYECTO, flujosNetos, validarPeriodos, validarProyecto } from "@/lib/finanzas/evaluacion-proyectos";
import {
  claveDeNombre,
  DEF_INDICADORES,
  ETIQUETA_CATEGORIA,
  ETIQUETA_NIVEL,
  evaluarRiesgo,
  leerRiesgo,
  validarRiesgo,
  type RiesgoEditable,
} from "@/lib/finanzas/riesgos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "capital-riesgo";
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

async function permiso() {
  const usuario = await requireModuloEscritura(MODULO);
  if (await limitadoATiendas()) return { error: "Capital y riesgo es de toda la empresa." } as const;
  return { usuario } as const;
}

function revalidar(sub = "") {
  revalidatePath(`/capital-riesgo${sub}`);
  revalidatePath("/panel-financiero");
}

// ---------------------------------------------------------------------------------------------
// Riesgos
// ---------------------------------------------------------------------------------------------
const textoRiesgo = (r: RiesgoEditable): Record<string, string> => ({
  Nombre: r.nombre,
  Categoría: ETIQUETA_CATEGORIA[r.categoria],
  Probabilidad: String(r.probabilidadManual),
  Impacto: String(r.impacto),
  Dueño: r.dueno ?? "—",
  Indicador: r.indicador ? DEF_INDICADORES[r.indicador].etiqueta : "—",
  Umbrales: r.umbrales ? r.umbrales.join(" / ") : "Predeterminados",
});

/**
 * Crea (id null) o cambia un riesgo. Si el nivel cambia con lo editado (con el último valor del indicador guardado), queda
 * en el historial como cambio manual.
 */
export async function guardarRiesgo(id: unknown, datos: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    const v = validarRiesgo((c) => datos?.[c]);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const fila = {
      nombre: v.nombre,
      categoria: v.categoria,
      descripcion: v.descripcion,
      probabilidad: v.probabilidadManual,
      impacto: v.impacto,
      dueno: v.dueno,
      mitigacion: v.mitigacion,
      indicador: v.indicador,
      umbrales: v.umbrales,
      actualizado_en: new Date().toISOString(),
    };
    if (id === null || id === undefined || id === "") {
      const { data: existe } = await supabase.from("fin_riesgos").select("clave").like("clave", `${claveDeNombre(v.nombre)}%`);
      const base = claveDeNombre(v.nombre);
      const usadas = new Set((existe ?? []).map((e) => String(e.clave)));
      let clave = base;
      for (let i = 2; usadas.has(clave); i++) clave = `${base}_${i}`.slice(0, 60);
      const { data, error } = await supabase.from("fin_riesgos").insert({ ...fila, clave, orden: 1000, creado_por: p.usuario.id }).select("id").single();
      if (error) return { error: /fin_riesgos/.test(error.message) ? SIN_MIGRACION_RIESGOS : "No se pudo guardar el riesgo." };
      await registrarAuditoria({ accion: "crear_riesgo", entidad: "fin_riesgos", entidadId: String(data.id), detalle: v.nombre, despues: textoRiesgo(v) });
      revalidar();
      return {};
    }
    if (!esUuid(id)) return { error: "Riesgo inválido." };
    const { data: antes, error: e1 } = await supabase.from("fin_riesgos").select("*").eq("id", id).maybeSingle();
    if (e1) return { error: SIN_MIGRACION_RIESGOS };
    if (!antes) return { error: "El riesgo no existe." };
    const previo = leerRiesgo(antes as Record<string, unknown>);
    const { error } = await supabase.from("fin_riesgos").update(fila).eq("id", id);
    if (error) return { error: "No se pudo guardar el riesgo." };
    // El nivel con lo editado y el último valor del indicador que se guardó.
    const nuevo = { ...previo, ...v, nivelGuardado: previo.nivelGuardado };
    const valor = antes.valor_indicador === null || antes.valor_indicador === undefined ? null : Number(antes.valor_indicador);
    const e = evaluarRiesgo(nuevo, new Map(v.indicador ? [[v.indicador, { valor, nota: null }]] : []));
    if (e.nivel !== previo.nivelGuardado) {
      await supabase.from("fin_riesgos_historial").insert({
        riesgo_id: id,
        nivel_antes: previo.nivelGuardado,
        nivel_despues: e.nivel,
        probabilidad: e.probabilidad,
        impacto: e.impacto,
        valor_indicador: e.valor,
        origen: "manual",
        usuario_id: p.usuario.id,
      });
      await supabase.from("fin_riesgos").update({ nivel_actual: e.nivel, probabilidad_actual: e.probabilidad }).eq("id", id);
    }
    await registrarAuditoria({
      accion: "editar_riesgo",
      entidad: "fin_riesgos",
      entidadId: String(id),
      detalle: `${v.nombre}${e.nivel !== previo.nivelGuardado ? ` · nivel ${previo.nivelGuardado ? ETIQUETA_NIVEL[previo.nivelGuardado] : "—"} → ${ETIQUETA_NIVEL[e.nivel]}` : ""}`,
      antes: textoRiesgo({ ...previo }),
      despues: textoRiesgo(v),
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el riesgo.");
  }
}

/** Quita un riesgo de la matriz (queda inactivo con su historial). */
export async function desactivarRiesgo(id: unknown): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if (!esUuid(id)) return { error: "Riesgo inválido." };
    const supabase = createServiceClient();
    const { data } = await supabase.from("fin_riesgos").select("id, nombre").eq("id", id).maybeSingle();
    if (!data) return { error: "El riesgo no existe." };
    const { error } = await supabase.from("fin_riesgos").update({ activo: false, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: "No se pudo quitar el riesgo." };
    await registrarAuditoria({ accion: "desactivar_riesgo", entidad: "fin_riesgos", entidadId: String(id), detalle: String(data.nombre) });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo quitar el riesgo.");
  }
}

/** Evalúa la matriz ahora (lo mismo que la tarea diaria): historial de cambios y alertas. */
export async function evaluarRiesgosAhora(): Promise<{ error?: string; cambios?: number }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    const r = await evaluarYGuardarRiesgos(createServiceClient(), hoyPanama(), { origen: "auto", usuarioId: p.usuario.id });
    if ("error" in r) return r;
    await registrarAuditoria({ accion: "evaluar_riesgos", entidad: "fin_riesgos", detalle: `${r.evaluados.length} riesgos, ${r.cambios} cambios de nivel, ${r.alertas} alertas` });
    revalidar();
    return { cambios: r.cambios };
  } catch (e) {
    return fallo(e, "No se pudo evaluar la matriz.");
  }
}

// ---------------------------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------------------------
const textoFlujos = (fs: { inversion: number; ingresos: number; costos: number; capitalTrabajo: number }[]) => ({
  Períodos: String(fs.length),
  Inversión: dinero(fs.reduce((a, f) => a + f.inversion, 0)),
  "Flujo neto": dinero(flujosNetos(fs).reduce((a, b) => a + b, 0)),
});

export async function guardarProyecto(id: unknown, datos: unknown): Promise<{ error?: string; id?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    const v = validarProyecto(datos);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const fila = { nombre: v.nombre, descripcion: v.descripcion, periodicidad: v.periodicidad, tasa: v.tasa, inicio: v.inicio, flujos: v.flujos, actualizado_en: new Date().toISOString() };
    if (id === null || id === undefined || id === "") {
      const { data, error } = await supabase.from("fin_proyectos").insert({ ...fila, creado_por: p.usuario.id }).select("id").single();
      if (error) return { error: /fin_proyectos/.test(error.message) ? SIN_MIGRACION_PROYECTOS : "No se pudo guardar el proyecto." };
      await registrarAuditoria({ accion: "crear_proyecto", entidad: "fin_proyectos", entidadId: String(data.id), detalle: v.nombre, despues: textoFlujos(v.flujos) });
      revalidar("/proyectos");
      return { id: String(data.id) };
    }
    if (!esUuid(id)) return { error: "Proyecto inválido." };
    const { data: antes } = await supabase.from("fin_proyectos").select("id, nombre, estado, flujos").eq("id", id).maybeSingle();
    if (!antes) return { error: "El proyecto no existe." };
    if (antes.estado !== "borrador") return { error: "Solo se cambia un proyecto en borrador; uno decidido conserva lo prometido." };
    const { error } = await supabase.from("fin_proyectos").update(fila).eq("id", id);
    if (error) return { error: "No se pudo guardar el proyecto." };
    const previos = validarPeriodos(antes.flujos);
    await registrarAuditoria({
      accion: "editar_proyecto",
      entidad: "fin_proyectos",
      entidadId: String(id),
      detalle: v.nombre,
      antes: "error" in previos ? {} : textoFlujos(previos.filter((x) => x !== null)),
      despues: textoFlujos(v.flujos),
    });
    revalidar("/proyectos");
    return { id: String(id) };
  } catch (e) {
    return fallo(e, "No se pudo guardar el proyecto.");
  }
}

/** Aprueba, rechaza o devuelve a borrador un proyecto, con quién y cuándo. */
export async function decidirProyecto(id: unknown, estado: unknown, motivo: unknown): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if (!esUuid(id)) return { error: "Proyecto inválido." };
    if (estado !== "aprobado" && estado !== "rechazado" && estado !== "borrador") return { error: "Estado inválido." };
    const m = typeof motivo === "string" && motivo.trim() ? motivo.trim().slice(0, 500) : null;
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_proyectos").select("id, nombre, estado").eq("id", id).maybeSingle();
    if (!antes) return { error: "El proyecto no existe." };
    if (antes.estado === estado) return {};
    const decidido = estado === "borrador" ? { decidido_por: null, decidido_por_nombre: null, decidido_en: null, motivo_decision: null } : { decidido_por: p.usuario.id, decidido_por_nombre: p.usuario.nombre ?? null, decidido_en: new Date().toISOString(), motivo_decision: m };
    const { error } = await supabase.from("fin_proyectos").update({ estado, ...decidido, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: "No se pudo cambiar el estado." };
    const etiqueta = (e: string) => ETIQUETA_ESTADO_PROYECTO[e as keyof typeof ETIQUETA_ESTADO_PROYECTO] ?? e;
    await registrarAuditoria({
      accion: "decidir_proyecto",
      entidad: "fin_proyectos",
      entidadId: String(id),
      detalle: `${antes.nombre}: ${etiqueta(String(antes.estado))} → ${etiqueta(estado)}${m ? ` (${m})` : ""}`.slice(0, 600),
      antes: { Estado: etiqueta(String(antes.estado)) },
      despues: { Estado: etiqueta(estado) },
    });
    revalidar("/proyectos");
    return {};
  } catch (e) {
    return fallo(e, "No se pudo cambiar el estado.");
  }
}

/** Los flujos reales de un proyecto aprobado (un período vacío = sin dato todavía). */
export async function guardarRealesProyecto(id: unknown, reales: unknown): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if (!esUuid(id)) return { error: "Proyecto inválido." };
    const v = validarPeriodos(reales, true);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_proyectos").select("id, nombre, estado").eq("id", id).maybeSingle();
    if (!antes) return { error: "El proyecto no existe." };
    if (antes.estado !== "aprobado") return { error: "El seguimiento es de los proyectos aprobados." };
    // Sin períodos vacíos al final.
    let fin = v.length;
    while (fin > 0 && v[fin - 1] === null) fin--;
    const { error } = await supabase.from("fin_proyectos").update({ reales: v.slice(0, fin), actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: "No se pudieron guardar los flujos reales." };
    await registrarAuditoria({
      accion: "guardar_reales_proyecto",
      entidad: "fin_proyectos",
      entidadId: String(id),
      detalle: `${antes.nombre}: ${v.slice(0, fin).filter((x) => x !== null).length} períodos con dato real`,
    });
    revalidar("/proyectos");
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar los flujos reales.");
  }
}

export async function eliminarProyecto(id: unknown): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if (!esUuid(id)) return { error: "Proyecto inválido." };
    const supabase = createServiceClient();
    const { data } = await supabase.from("fin_proyectos").select("id, nombre, estado").eq("id", id).maybeSingle();
    if (!data) return { error: "El proyecto no existe." };
    if (data.estado === "aprobado") return { error: "Un proyecto aprobado no se elimina: se devuelve a borrador primero." };
    const { error } = await supabase.from("fin_proyectos").delete().eq("id", id);
    if (error) return { error: "No se pudo eliminar el proyecto." };
    await registrarAuditoria({ accion: "eliminar_proyecto", entidad: "fin_proyectos", entidadId: String(id), detalle: String(data.nombre) });
    revalidar("/proyectos");
    return {};
  } catch (e) {
    return fallo(e, "No se pudo eliminar el proyecto.");
  }
}

// ---------------------------------------------------------------------------------------------
// Supuestos (WACC y asignación)
// ---------------------------------------------------------------------------------------------
export async function guardarAjustesCapital(datos: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_CAPITAL).maybeSingle();
    const actual = leerConfigCapital(antes?.valor);
    const v = validarConfigCapital((c) => (datos && c in datos ? datos[c] : undefined), actual);
    if ("error" in v) return v;
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_CAPITAL, valor: configCapitalAGuardar(v.config), actualizado_por: p.usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudieron guardar los supuestos." };
    const texto = (c: typeof actual): Record<string, string> => ({
      WACC: c.wacc === null ? "Costo financiero" : `${c.wacc} %`,
      Elasticidad: String(c.asignacion.elasticidad),
      Piso: `${c.asignacion.pisoPct} %`,
      "Días de inventario": String(c.asignacion.diasInventario),
    });
    await registrarAuditoria({ accion: "guardar_ajustes_capital", entidad: "fin_config", detalle: "Supuestos de Capital y riesgo", antes: texto(actual), despues: texto(v.config) });
    revalidar("/proyectos");
    revalidar("/asignacion");
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar los supuestos.");
  }
}
