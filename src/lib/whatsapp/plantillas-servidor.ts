// Plantillas de WhatsApp en el servidor (28 oct 2026): guardarlas, mandarlas a Meta, aplicar lo que Meta avisa y dejar alertas con avisos «Para
// ti». Reciben el cliente de Supabase (no lo crean) y usan rutas relativas porque también corren desde `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarPersonasConAcceso, type PerfilConRol, type PermisoDeRol, type PermisoPropioDeModulo } from "../acceso-seccion";
import { borrarPlantillaMeta, crearPlantillaMeta, editarPlantillaMeta, listarPlantillasMeta } from "./api-plantillas";
import { alertaDeEvento, extraerEventosCuenta, type AlertaNueva, type EventoCuenta } from "./eventos";
import {
  alinearVariables,
  calidadDeMeta,
  categoriaDeMeta,
  estadoDeMeta,
  normalizarIdioma,
  segundosDeEspera,
  textoEspera,
  validarPlantilla,
  type Calidad,
  type CategoriaMeta,
  type DatosPlantilla,
  type EstadoPlantilla,
  type VariablePlantilla,
} from "./plantillas";

export const RUTA_PLANTILLAS = "/crm-dropshippers/plantillas";
/** Los módulos del CRM: a quienes pueden modificar alguno les llega el aviso. */
const MODULOS_CRM = ["crm-dropshippers", "crm-comercial"];

/** Una plantilla tal como se guarda. */
export interface PlantillaGuardada {
  id: string;
  nombre: string;
  idioma: string;
  categoria: "marketing" | "utility";
  categoria_actual: CategoriaMeta | null;
  estado: EstadoPlantilla;
  calidad: Calidad;
  motivo: string | null;
  error_envio: string | null;
  meta_id: string | null;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  botones: string[];
  variables: VariablePlantilla[];
  sugerida: string | null;
  creado_por_nombre: string | null;
  enviada_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export const COLUMNAS_PLANTILLA =
  "id, nombre, idioma, categoria, categoria_actual, estado, calidad, motivo, error_envio, meta_id, encabezado, cuerpo, pie, botones, variables, sugerida, creado_por_nombre, enviada_en, creado_en, actualizado_en";

export const datosDe = (p: PlantillaGuardada): DatosPlantilla => ({
  nombre: p.nombre,
  idioma: p.idioma,
  categoria: p.categoria,
  encabezado: p.encabezado,
  cuerpo: p.cuerpo,
  pie: p.pie,
  botones: p.botones ?? [],
  variables: p.variables ?? [],
});

/** Quienes pueden modificar el CRM (Atención o Comercial): a ellos les llegan los avisos de WhatsApp. */
async function destinatariosCrm(supabase: SupabaseClient): Promise<string[]> {
  const [perfiles, permisos, propios, roles] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id, activo"),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura").in("modulo", MODULOS_CRM),
    supabase.from("permisos_persona").select("perfil_id, modulo, nivel").in("modulo", MODULOS_CRM),
    supabase.from("roles").select("id, nombre"),
  ]);
  const nombres = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const ids = new Set<string>();
  for (const modulo of MODULOS_CRM) {
    const deRol: PermisoDeRol[] = (permisos.data ?? [])
      .filter((p) => p.modulo === modulo)
      .map((p) => ({ rol_id: p.rol_id as string, solo_lectura: !!p.solo_lectura, rol: nombres.get(p.rol_id as string) ?? "" }));
    const propiosDe = (propios.error ? [] : (propios.data ?? []).filter((p) => p.modulo === modulo)) as PermisoPropioDeModulo[];
    for (const persona of armarPersonasConAcceso((perfiles.data ?? []) as PerfilConRol[], deRol, propiosDe, nombres)) if (!persona.soloLectura) ids.add(persona.id);
  }
  return [...ids];
}

/**
 * Deja una alerta (la pantalla de Plantillas y la de Bandeja la muestran) y un aviso «Para ti» a quienes manejan el CRM. No repite la misma
 * alerta de hace menos de 10 minutos (Meta a veces manda un aviso dos veces). Sin la migración 0169 no hace nada.
 */
export async function registrarAlerta(supabase: SupabaseClient, a: AlertaNueva, plantillaId: string | null): Promise<void> {
  const desde = new Date(Date.now() - 10 * 60_000).toISOString();
  const repetida = await supabase.from("whatsapp_alertas").select("id", { count: "exact", head: true }).eq("tipo", a.tipo).eq("titulo", a.titulo).gte("creado_en", desde);
  if (repetida.error || repetida.count) return;
  const { error } = await supabase.from("whatsapp_alertas").insert({ tipo: a.tipo, severidad: a.severidad, titulo: a.titulo, detalle: a.detalle, plantilla_id: plantillaId });
  if (error) return;
  const personas = await destinatariosCrm(supabase);
  if (personas.length) {
    await supabase.from("notificaciones_usuario").insert(
      personas.map((id) => ({ usuario_id: id, tipo: "whatsapp", titulo: a.titulo.slice(0, 200), texto: a.detalle ? a.detalle.slice(0, 500) : null, href: RUTA_PLANTILLAS, autor_nombre: "Sistema" })),
    );
  }
}

/**
 * Manda la plantilla a Meta: nueva, la crea y queda «en revisión»; ya enviada y aprobada o rechazada (o pausada), cambia su texto y Meta la
 * vuelve a revisar. Si Meta no la acepta, el motivo queda anotado en la plantilla (no se pierde nada de lo escrito).
 */
export async function enviarPlantillaAMeta(supabase: SupabaseClient, id: string): Promise<{ ok: true; editada: boolean } | { error: string }> {
  const { data } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("id", id).maybeSingle();
  if (!data) return { error: "La plantilla ya no existe." };
  const p = data as PlantillaGuardada;
  const d = datosDe(p);
  const revision = validarPlantilla(d);
  if (revision.errores.length) return { error: revision.errores[0] };
  const yaEnMeta = !!p.meta_id;
  if (yaEnMeta && p.estado === "pendiente") return { error: "Meta la está revisando: espera su respuesta para cambiarla." };
  if (yaEnMeta && p.estado === "deshabilitada") return { error: "Meta la deshabilitó y no se puede cambiar. Crea otra con otro nombre." };
  // Dos minutos entre una plantilla y otra, venga de la pantalla o del script: así no parece un envío en masa.
  const { data: ultima } = await supabase.from("whatsapp_plantillas").select("enviada_en").neq("id", id).not("enviada_en", "is", null).order("enviada_en", { ascending: false }).limit(1).maybeSingle();
  const espera = segundosDeEspera((ultima?.enviada_en as string | null) ?? null);
  if (espera > 0) return { error: `Acabas de mandar otra plantilla a Meta. Espera ${textoEspera(espera)} antes de mandar la siguiente: así no parece un envío en masa.` };

  let metaId = p.meta_id;
  let categoria = p.categoria_actual;
  let estado: EstadoPlantilla = "pendiente";
  if (yaEnMeta) {
    const r = await editarPlantillaMeta(p.meta_id!, d);
    if ("error" in r) {
      await supabase.from("whatsapp_plantillas").update({ error_envio: r.error, actualizado_en: new Date().toISOString() }).eq("id", id);
      return r;
    }
  } else {
    const r = await crearPlantillaMeta(d);
    if ("error" in r) {
      if (!r.error.startsWith("WhatsApp todavía no está conectado") && !r.error.startsWith("Falta el identificador") && !r.error.startsWith("El sandbox")) {
        await supabase.from("whatsapp_plantillas").update({ error_envio: r.error, actualizado_en: new Date().toISOString() }).eq("id", id);
      }
      return r;
    }
    metaId = r.metaId;
    categoria = categoriaDeMeta(r.categoria) ?? p.categoria;
    estado = estadoDeMeta(r.estado) ?? "pendiente";
  }
  const ahora = new Date().toISOString();
  await supabase.from("whatsapp_plantillas").update({ meta_id: metaId, estado, categoria_actual: categoria, enviada_en: ahora, error_envio: null, motivo: null, actualizado_en: ahora }).eq("id", id);
  await registrarAlerta(
    supabase,
    { tipo: "plantilla_enviada", severidad: "info", titulo: `Se mandó a Meta la plantilla «${p.nombre}»`, detalle: "Meta la revisa: suele tardar de unos minutos a 24 horas. Te avisamos cuando responda." },
    id,
  );
  return { ok: true, editada: yaEnMeta };
}

/** Borra la plantilla en Meta (si ya estaba allá) y de la base. Si Meta no la borra, no se borra nada. */
export async function eliminarPlantillaCompleta(supabase: SupabaseClient, id: string): Promise<{ ok: true } | { error: string }> {
  const { data } = await supabase.from("whatsapp_plantillas").select("id, nombre, meta_id").eq("id", id).maybeSingle();
  if (!data) return { ok: true };
  if (data.meta_id) {
    const r = await borrarPlantillaMeta(data.nombre as string, data.meta_id as string);
    if ("error" in r) return r;
  }
  const { error } = await supabase.from("whatsapp_plantillas").delete().eq("id", id);
  return error ? { error: "No se pudo borrar la plantilla." } : { ok: true };
}

async function buscarPlantilla(supabase: SupabaseClient, e: { metaId: string | null; nombre: string; idioma: string }): Promise<PlantillaGuardada | null> {
  if (e.metaId) {
    const { data } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("meta_id", e.metaId).maybeSingle();
    if (data) return data as PlantillaGuardada;
  }
  const { data } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("nombre", e.nombre);
  return ((data ?? []) as PlantillaGuardada[]).find((p) => normalizarIdioma(p.idioma) === normalizarIdioma(e.idioma)) ?? null;
}

const soloNumeros = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

async function aplicarUno(supabase: SupabaseClient, e: EventoCuenta): Promise<void> {
  if (e.tipo === "numero_limite") {
    const objetivo = soloNumeros(e.numero);
    if (!objetivo || !e.limite) return;
    const { data } = await supabase.from("whatsapp_numeros").select("id, numero");
    const numero = (data ?? []).find((n) => soloNumeros(n.numero as string) === objetivo);
    if (numero) await supabase.from("whatsapp_numeros").update({ limite_mensajes: e.limite, limite_actualizado_en: new Date().toISOString() }).eq("id", numero.id);
    return;
  }
  let plantillaId: string | null = null;
  if (e.tipo !== "cuenta") {
    const p = await buscarPlantilla(supabase, e);
    plantillaId = p?.id ?? null;
    if (p) {
      const cambios: Record<string, unknown> = {};
      if (e.tipo === "plantilla_estado") {
        const nuevo = estadoDeMeta(e.evento);
        if (nuevo) {
          cambios.estado = nuevo;
          if (nuevo === "aprobada") cambios.motivo = null;
          else if (e.motivo && (nuevo === "rechazada" || nuevo === "pausada" || nuevo === "deshabilitada")) cambios.motivo = e.motivo;
        }
        const categoria = categoriaDeMeta(e.categoria);
        if (categoria) cambios.categoria_actual = categoria;
      } else if (e.tipo === "plantilla_calidad") {
        const calidad = calidadDeMeta(e.nueva);
        if (calidad) cambios.calidad = calidad;
      } else if (e.tipo === "plantilla_categoria" && !e.programada) {
        const categoria = categoriaDeMeta(e.nueva);
        if (categoria) cambios.categoria_actual = categoria;
      }
      if (e.metaId && !p.meta_id) cambios.meta_id = e.metaId;
      if (Object.keys(cambios).length) await supabase.from("whatsapp_plantillas").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", p.id);
    }
  }
  const alerta = alertaDeEvento(e);
  if (alerta) await registrarAlerta(supabase, alerta, plantillaId);
}

/** Aplica lo que avisó Meta (estado, calidad y categoría de plantillas, límite del número, cuenta) y deja las alertas. Un fallo no frena los demás. */
export async function aplicarEventosCuenta(supabase: SupabaseClient, eventos: EventoCuenta[]): Promise<void> {
  for (const e of eventos) {
    try {
      await aplicarUno(supabase, e);
    } catch (error) {
      console.error("WhatsApp: no se pudo aplicar un aviso de Meta", e.tipo, error instanceof Error ? error.message : error);
    }
  }
}

/** Lo que hace cada webhook con el aviso entero: sacar los eventos de plantillas y de cuenta y aplicarlos. */
export async function guardarAvisoDeCuenta(supabase: SupabaseClient, aviso: unknown, sinObjeto = false): Promise<number> {
  const eventos = extraerEventosCuenta(aviso, sinObjeto);
  if (eventos.length) await aplicarEventosCuenta(supabase, eventos);
  return eventos.length;
}

const EVENTO_DE_ESTADO: Record<string, string> = { aprobada: "APPROVED", rechazada: "REJECTED", pausada: "PAUSED", deshabilitada: "DISABLED" };

/**
 * Pone al día las plantillas con lo que dice Meta ahora (por si se perdió algún aviso): estado, calidad y categoría de las que ya están,
 * y trae las que se crearon directo en Meta. Un cambio de estado deja su alerta, como si hubiera llegado el aviso.
 */
export async function sincronizarPlantillas(supabase: SupabaseClient): Promise<{ actualizadas: number; nuevas: number } | { error: string }> {
  const lista = await listarPlantillasMeta();
  if ("error" in lista) return lista;
  const { data, error } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA);
  if (error) return { error: "Falta correr la migración 0169 (plantillas de WhatsApp)." };
  const locales = (data ?? []) as PlantillaGuardada[];
  let actualizadas = 0;
  let nuevas = 0;
  for (const m of lista.plantillas) {
    const local = locales.find((l) => l.meta_id === m.metaId) ?? locales.find((l) => l.nombre === m.nombre && normalizarIdioma(l.idioma) === normalizarIdioma(m.idioma));
    if (!local) {
      if (!m.categoria || m.categoria === "authentication") continue;
      const variables = alinearVariables(m.cuerpo, m.ejemplos.map((ejemplo, i) => ({ campo: "manual" as const, ejemplo, etiqueta: `Dato ${i + 1}` })));
      const { error: e } = await supabase.from("whatsapp_plantillas").insert({
        nombre: m.nombre,
        idioma: m.idioma,
        categoria: m.categoria,
        categoria_actual: m.categoria,
        estado: m.estado ?? "pendiente",
        calidad: m.calidad ?? "pendiente",
        motivo: m.motivo,
        meta_id: m.metaId,
        encabezado: m.encabezado,
        cuerpo: m.cuerpo,
        pie: m.pie,
        botones: m.botones,
        variables,
        creado_por_nombre: "Meta",
      });
      if (!e) nuevas++;
      continue;
    }
    const cambios: Record<string, unknown> = {};
    if (local.meta_id !== m.metaId) cambios.meta_id = m.metaId;
    if (m.estado && m.estado !== local.estado) cambios.estado = m.estado;
    if (m.calidad && m.calidad !== local.calidad) cambios.calidad = m.calidad;
    if (m.categoria && m.categoria !== local.categoria_actual) cambios.categoria_actual = m.categoria;
    if (m.motivo !== local.motivo && (m.estado === "rechazada" || m.estado === "pausada" || m.estado === "deshabilitada")) cambios.motivo = m.motivo;
    if (m.estado === "aprobada" && local.motivo) cambios.motivo = null;
    if (!Object.keys(cambios).length) continue;
    await supabase.from("whatsapp_plantillas").update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", local.id);
    actualizadas++;
    if (cambios.estado && EVENTO_DE_ESTADO[cambios.estado as string]) {
      const alerta = alertaDeEvento({ tipo: "plantilla_estado", metaId: m.metaId, nombre: m.nombre, idioma: m.idioma, evento: EVENTO_DE_ESTADO[cambios.estado as string], motivo: m.motivo, categoria: null });
      if (alerta) await registrarAlerta(supabase, alerta, local.id);
    }
  }
  return { actualizadas, nuevas };
}
