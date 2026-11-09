"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { cargarUnidadesPauta, puedeEditarComite } from "@/lib/finanzas/cargar-comite";
import {
  CLAVE_COMITE,
  INDICADORES,
  configAGuardar,
  esEstadoDecision,
  leerConfigComite,
  limpiarTexto,
  validarConfigComite,
  validarDecision,
  type ConfigComite,
} from "@/lib/finanzas/comite";
import { CLAVE_TECHO_PAUTA, leerTecho, techoAGuardar, validarTecho, type ConfigTecho } from "@/lib/finanzas/pauta";
import { createServiceClient } from "@/lib/supabase/server";

const RUTAS = ["/panel-financiero", "/panel-financiero/comite", "/rentabilidad"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_MIGRACION = "Falta correr la migración 0942 (comité de dirección) en Supabase.";

async function exigirEditor(): Promise<UsuarioActual> {
  const u = await getUsuarioActual();
  if (!u) throw new Error("No hay sesión activa.");
  if (!(await puedeEditarComite(u))) throw new Error("Tu rol no puede modificar el comité de dirección.");
  return u;
}

const conError = async <T>(fn: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
};

const textoConfig = (c: ConfigComite, nombres: Map<string, string>) => ({
  ...Object.fromEntries(INDICADORES.map((d) => [`Meta · ${d.etiqueta}`, String(c.metas[d.clave])])),
  ...Object.fromEntries(INDICADORES.filter((d) => d.conPartida).map((d) => [`Partida · ${d.etiqueta}`, c.partida[d.clave] === null ? "—" : String(c.partida[d.clave])])),
  "Tiendas propias": c.tiendasPropias ? c.tiendasPropias.map((id) => nombres.get(id) ?? id).join(", ") : "Por defecto",
});

/** Guarda las metas, el valor de partida y las tiendas propias (`fin_config.comite`). */
export async function guardarConfigComite(formData: FormData): Promise<{ error?: string }> {
  return conError(async () => {
    const usuario = await exigirEditor();
    const supabase = createServiceClient();
    const unidades = await cargarUnidadesPauta(supabase);
    const leido = validarConfigComite(
      (c) => formData.get(c),
      (c) => formData.getAll(c),
      unidades.filter((u) => u.clase === "tienda").map((u) => u.id),
    );
    if ("error" in leido) return { error: leido.error };
    const previo = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_COMITE).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const antes = leerConfigComite(previo.data?.valor);
    const despues = { ...leido.config, tiendasPropias: formData.get("tiendas_elegidas") === "1" ? leido.config.tiendasPropias : antes.tiendasPropias };
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_COMITE, valor: configAGuardar(despues), actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    const nombres = new Map(unidades.map((u) => [u.id, u.nombre]));
    await registrarAuditoria({
      accion: "cambiar_comite",
      entidad: "fin_config",
      entidadId: CLAVE_COMITE,
      detalle: "Metas, partida y tiendas propias del comité de dirección",
      antes: textoConfig(antes, nombres),
      despues: textoConfig(despues, nombres),
    });
    for (const r of RUTAS) revalidatePath(r);
    return {};
  });
}

const textoTecho = (t: ConfigTecho, nombres: Map<string, string>) => ({
  "Techo general": `${t.general} %`,
  ...Object.fromEntries(Object.entries(t.porTienda).map(([id, v]) => [`Techo · ${nombres.get(id) ?? id}`, `${v} %`])),
});

/** Guarda el techo de pauta general y el de cada tienda (`fin_config.techo_pauta`). */
export async function guardarTechoPauta(formData: FormData): Promise<{ error?: string }> {
  return conError(async () => {
    const usuario = await exigirEditor();
    const supabase = createServiceClient();
    const unidades = await cargarUnidadesPauta(supabase);
    const leido = validarTecho((c) => formData.get(c), unidades.filter((u) => u.clase === "tienda").map((u) => u.id));
    if ("error" in leido) return { error: leido.error };
    const previo = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_TECHO_PAUTA).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const antes = leerTecho(previo.data?.valor);
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_TECHO_PAUTA, valor: techoAGuardar(leido.techo), actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    const nombres = new Map(unidades.map((u) => [u.id, u.nombre]));
    await registrarAuditoria({
      accion: "cambiar_techo_pauta",
      entidad: "fin_config",
      entidadId: CLAVE_TECHO_PAUTA,
      detalle: "Techo de pauta por tienda",
      antes: textoTecho(antes, nombres),
      despues: textoTecho(leido.techo, nombres),
    });
    for (const r of RUTAS) revalidatePath(r);
    return {};
  });
}

/** Agrega una decisión al acta de un comité. */
export async function crearDecision(formData: FormData): Promise<{ error?: string }> {
  return conError(async () => {
    const usuario = await exigirEditor();
    const v = validarDecision((c) => formData.get(c));
    if ("error" in v) return { error: v.error };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fin_comite_acta")
      .insert({
        periodo: v.periodo,
        decision: v.decision,
        responsable: v.responsable,
        fecha_compromiso: v.fechaCompromiso,
        creado_por: usuario.id,
        actualizado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error) return { error: /relation|does not exist|schema cache/i.test(error.message) ? SIN_MIGRACION : "No se pudo guardar." };
    await registrarAuditoria({
      accion: "crear_decision_comite",
      entidad: "fin_comite_acta",
      entidadId: String(data.id),
      detalle: `Comité ${v.periodo.slice(0, 7)}: ${v.decision.slice(0, 200)}`,
      despues: { Responsable: v.responsable ?? "—", "Fecha comprometida": v.fechaCompromiso ?? "—" },
    });
    revalidatePath("/panel-financiero/comite");
    return {};
  });
}

async function leerDecision(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await createServiceClient().from("fin_comite_acta").select("id, periodo, decision, estado, seguimiento").eq("id", id).maybeSingle();
  return data as { id: string; periodo: string; decision: string; estado: string; seguimiento: string | null } | null;
}

/** Marca una decisión como hecha o la vuelve a pendiente. */
export async function cambiarEstadoDecision(id: string, estado: string): Promise<{ error?: string }> {
  return conError(async () => {
    const usuario = await exigirEditor();
    if (!esEstadoDecision(estado)) return { error: "Estado no válido." };
    const previa = await leerDecision(id);
    if (!previa) return { error: "No se encontró la decisión." };
    if (previa.estado === estado) return {};
    const { error } = await createServiceClient()
      .from("fin_comite_acta")
      .update({ estado, hecha_en: estado === "hecha" ? new Date().toISOString() : null, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar." };
    const nombre = (e: string) => (e === "hecha" ? "Hecha" : "Pendiente");
    await registrarAuditoria({
      accion: "cambiar_decision_comite",
      entidad: "fin_comite_acta",
      entidadId: id,
      detalle: previa.decision.slice(0, 200),
      antes: { Estado: nombre(previa.estado) },
      despues: { Estado: nombre(estado) },
    });
    revalidatePath("/panel-financiero/comite");
    return {};
  });
}

/** El seguimiento de una decisión (lo que se dijo en el comité siguiente). Texto simple. */
export async function guardarSeguimiento(id: string, texto: string): Promise<{ error?: string }> {
  return conError(async () => {
    const usuario = await exigirEditor();
    const previa = await leerDecision(id);
    if (!previa) return { error: "No se encontró la decisión." };
    const limpio = limpiarTexto(texto, 1000) || null;
    if ((previa.seguimiento ?? null) === limpio) return {};
    const { error } = await createServiceClient()
      .from("fin_comite_acta")
      .update({ seguimiento: limpio, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_decision_comite",
      entidad: "fin_comite_acta",
      entidadId: id,
      detalle: previa.decision.slice(0, 200),
      antes: { Seguimiento: previa.seguimiento ?? "—" },
      despues: { Seguimiento: limpio ?? "—" },
    });
    revalidatePath("/panel-financiero/comite");
    return {};
  });
}

/** Quita una decisión del acta. */
export async function eliminarDecision(id: string): Promise<{ error?: string }> {
  return conError(async () => {
    await exigirEditor();
    const previa = await leerDecision(id);
    if (!previa) return { error: "No se encontró la decisión." };
    const { error } = await createServiceClient().from("fin_comite_acta").delete().eq("id", id);
    if (error) return { error: "No se pudo eliminar." };
    await registrarAuditoria({
      accion: "eliminar_decision_comite",
      entidad: "fin_comite_acta",
      entidadId: id,
      detalle: `Comité ${String(previa.periodo).slice(0, 7)}: ${previa.decision.slice(0, 200)}`,
    });
    revalidatePath("/panel-financiero/comite");
    return {};
  });
}
