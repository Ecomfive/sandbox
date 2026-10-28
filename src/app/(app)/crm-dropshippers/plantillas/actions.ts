"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import {
  CAMPOS_VARIABLE,
  CATEGORIAS,
  MAX_BOTON,
  MAX_BOTONES,
  MAX_CUERPO,
  MAX_EJEMPLO,
  MAX_ENCABEZADO,
  MAX_NOMBRE,
  MAX_PIE,
  NOMBRE_VALIDO,
  alinearVariables,
  normalizarCuerpo,
  validarPlantilla,
  type Categoria,
  type DatosPlantilla,
  type VariablePlantilla,
} from "@/lib/whatsapp/plantillas";
import { PLANTILLAS_SUGERIDAS } from "@/lib/whatsapp/plantillas-sugeridas";
import { COLUMNAS_PLANTILLA, RUTA_PLANTILLAS, eliminarPlantillaCompleta, enviarPlantillaAMeta, sincronizarPlantillas, type PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";

/** Quien abre el CRM; con `escribe`, además puede modificar Atención o Comercial. */
async function usuarioPlantillas(escribe: boolean): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return null;
  if (escribe) {
    const a = accesoCrm(u);
    if (!a.escribeAtencion && !a.escribeComercial && !a.escribeDireccion) return null;
  }
  return u;
}

const SIN_PERMISO = "No tienes permiso para manejar las plantillas.";
const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Lo que manda el formulario. Todo lo que llega del navegador se vuelve a limpiar y comprobar aquí. */
export interface EntradaPlantilla {
  nombre: string;
  idioma: string;
  categoria: string;
  encabezado: string;
  cuerpo: string;
  pie: string;
  botones: string[];
  variables: { campo: string; ejemplo: string; etiqueta?: string }[];
}

function leerDatos(e: EntradaPlantilla): DatosPlantilla {
  const texto = (v: unknown, max: number) => String(v ?? "").slice(0, max + 50).trim();
  const cuerpo = normalizarCuerpo(texto(e.cuerpo, MAX_CUERPO));
  const campos = new Set<string>(CAMPOS_VARIABLE.map((c) => c.campo));
  const variables: VariablePlantilla[] = (Array.isArray(e.variables) ? e.variables : []).slice(0, 20).map((v) => ({
    campo: (campos.has(String(v?.campo)) ? v.campo : "manual") as VariablePlantilla["campo"],
    ejemplo: texto(v?.ejemplo, MAX_EJEMPLO),
    ...(v?.etiqueta ? { etiqueta: texto(v.etiqueta, 40) } : {}),
  }));
  return {
    nombre: texto(e.nombre, MAX_NOMBRE),
    idioma: texto(e.idioma, 10),
    categoria: ((CATEGORIAS as readonly string[]).includes(String(e.categoria)) ? e.categoria : "marketing") as Categoria,
    encabezado: texto(e.encabezado, MAX_ENCABEZADO) || null,
    cuerpo,
    pie: texto(e.pie, MAX_PIE) || null,
    botones: (Array.isArray(e.botones) ? e.botones : []).slice(0, MAX_BOTONES + 1).map((b) => texto(b, MAX_BOTON)),
    variables: alinearVariables(cuerpo, variables),
  };
}

const CAMPOS_EDITABLES = ["encabezado", "cuerpo", "pie", "botones", "variables"] as const;

/**
 * Guarda una plantilla (nueva o editada) y, con `enviar`, la manda a Meta. Un borrador se puede guardar a medias (solo hace falta un nombre
 * válido y el mensaje); para mandarla a Meta tiene que pasar toda la revisión. Una plantilla ya enviada solo cambia mandándola a Meta, que
 * la vuelve a revisar: nombre, idioma y categoría no se pueden cambiar. Si Meta no la acepta, la plantilla queda como estaba y se dice por qué.
 */
export async function guardarPlantilla(id: string | null, entrada: EntradaPlantilla, enviar: boolean): Promise<{ id?: string; enviada?: boolean; error?: string }> {
  const u = await usuarioPlantillas(true);
  if (!u) return { error: SIN_PERMISO };
  if (id !== null && !ES_ID(id)) return { error: "Plantilla no válida." };
  const supabase = createServiceClient();
  const d = leerDatos(entrada);
  const autor = u.nombre || u.email;
  const revision = validarPlantilla(d);

  let previa: PlantillaGuardada | null = null;
  if (id) {
    const { data } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("id", id).maybeSingle();
    if (!data) return { error: "La plantilla ya no existe." };
    previa = data as PlantillaGuardada;
    if (previa.estado !== "borrador" && !enviar) return { error: "Una plantilla que ya está en Meta solo se cambia mandándola otra vez." };
    // Lo que Meta no deja cambiar se queda como estaba.
    if (previa.estado !== "borrador") {
      d.nombre = previa.nombre;
      d.idioma = previa.idioma;
      d.categoria = previa.categoria;
    }
  }
  if (!NOMBRE_VALIDO.test(d.nombre)) return { error: "El nombre solo lleva minúsculas, números y guiones bajos (ej: retomar_compra)." };
  if (!d.cuerpo) return { error: "Escribe el mensaje." };
  if (enviar && revision.errores.length) return { error: revision.errores[0] };

  const fila = {
    nombre: d.nombre,
    idioma: d.idioma,
    categoria: d.categoria,
    encabezado: d.encabezado,
    cuerpo: d.cuerpo,
    pie: d.pie,
    botones: d.botones.filter(Boolean),
    variables: d.variables,
    error_envio: null,
    actualizado_en: new Date().toISOString(),
  };
  if (previa) {
    const { error } = await supabase.from("whatsapp_plantillas").update(fila).eq("id", previa.id);
    if (error) return { error: "No se pudo guardar la plantilla." };
  } else {
    const { data, error } = await supabase.from("whatsapp_plantillas").insert({ ...fila, categoria_actual: null, creado_por: u.id, creado_por_nombre: autor }).select("id").single();
    if (error) {
      if (error.code === "23505") return { error: "Ya tienes una plantilla con ese nombre y ese idioma." };
      if (error.code === "42P01") return { error: "Falta correr la migración 0170 (plantillas de WhatsApp)." };
      return { error: "No se pudo guardar la plantilla." };
    }
    id = data.id as string;
    await registrarAuditoria({ accion: "crear_plantilla_whatsapp", entidad: "whatsapp_plantillas", entidadId: id, detalle: `${d.nombre} · ${d.categoria === "marketing" ? "Marketing" : "Utilidad"}` });
  }
  if (previa) await registrarAuditoria({ accion: "editar_plantilla_whatsapp", entidad: "whatsapp_plantillas", entidadId: previa.id, detalle: d.nombre });

  if (!enviar) {
    revalidatePath(RUTA_PLANTILLAS);
    return { id: id! };
  }
  const r = await enviarPlantillaAMeta(supabase, id!);
  if ("error" in r) {
    // Si era una edición de una plantilla ya enviada y Meta no la aceptó, vuelve a como estaba (lo que ve Meta y lo que se ve aquí no se separan).
    if (previa && previa.estado !== "borrador") {
      const revertir = Object.fromEntries(CAMPOS_EDITABLES.map((c) => [c, previa[c]]));
      await supabase.from("whatsapp_plantillas").update({ ...revertir, error_envio: r.error }).eq("id", previa.id);
    }
    revalidatePath(RUTA_PLANTILLAS);
    return { id: id!, error: r.error };
  }
  await registrarAuditoria({ accion: "enviar_plantilla_meta", entidad: "whatsapp_plantillas", entidadId: id!, detalle: `${d.nombre}${r.editada ? " (cambio)" : ""}` });
  revalidatePath(RUTA_PLANTILLAS);
  return { id: id!, enviada: true };
}

/** Manda a Meta una plantilla que estaba como borrador (o vuelve a mandar una que Meta no pudo recibir). */
export async function enviarPlantillaABorrador(id: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioPlantillas(true);
  if (!u) return { error: SIN_PERMISO };
  if (!ES_ID(id)) return { error: "Plantilla no válida." };
  const r = await enviarPlantillaAMeta(createServiceClient(), id);
  revalidatePath(RUTA_PLANTILLAS);
  if ("error" in r) return r;
  await registrarAuditoria({ accion: "enviar_plantilla_meta", entidad: "whatsapp_plantillas", entidadId: id });
  return { ok: true };
}

/** Borra la plantilla aquí y en Meta. Solo quien administra el sistema: borrar una aprobada impide usar su nombre por 30 días. */
export async function eliminarPlantilla(id: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioPlantillas(true);
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede eliminar plantillas." };
  if (!ES_ID(id)) return { error: "Plantilla no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("whatsapp_plantillas").select("nombre").eq("id", id).maybeSingle();
  const r = await eliminarPlantillaCompleta(supabase, id);
  if ("error" in r) return r;
  await registrarAuditoria({ accion: "eliminar_plantilla_whatsapp", entidad: "whatsapp_plantillas", entidadId: id, detalle: (data?.nombre as string | undefined) ?? undefined });
  revalidatePath(RUTA_PLANTILLAS);
  return { ok: true };
}

/** Pregunta a Meta cómo van las plantillas (estado, calidad y categoría) y trae las que se crearon directo en Meta. */
export async function actualizarEstadoPlantillas(): Promise<{ actualizadas: number; nuevas: number } | { error: string }> {
  const u = await usuarioPlantillas(false);
  if (!u) return { error: SIN_PERMISO };
  const r = await sincronizarPlantillas(createServiceClient());
  if (!("error" in r)) revalidatePath(RUTA_PLANTILLAS);
  return r;
}

/** Agrega una plantilla sugerida como borrador (todavía no va a Meta). */
export async function agregarSugerida(clave: string): Promise<{ id: string } | { error: string }> {
  const u = await usuarioPlantillas(true);
  if (!u) return { error: SIN_PERMISO };
  const s = PLANTILLAS_SUGERIDAS.find((p) => p.clave === clave);
  if (!s) return { error: "Esa plantilla sugerida no existe." };
  const { data, error } = await createServiceClient()
    .from("whatsapp_plantillas")
    .insert({
      nombre: s.nombre,
      idioma: "es",
      categoria: s.categoria,
      cuerpo: s.cuerpo,
      botones: s.botones,
      variables: s.variables,
      sugerida: s.clave,
      creado_por: u.id,
      creado_por_nombre: u.nombre || u.email,
    })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Esa plantilla ya está en la lista." : error.code === "42P01" ? "Falta correr la migración 0170 (plantillas de WhatsApp)." : "No se pudo agregar." };
  await registrarAuditoria({ accion: "crear_plantilla_whatsapp", entidad: "whatsapp_plantillas", entidadId: data.id as string, detalle: `${s.nombre} (sugerida)` });
  revalidatePath(RUTA_PLANTILLAS);
  return { id: data.id as string };
}

/** Marca las alertas como vistas (las de la lista, o solo una). */
export async function marcarAlertasVistas(id?: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioPlantillas(false);
  if (!u) return { error: SIN_PERMISO };
  if (id !== undefined && !ES_ID(id)) return { error: "Alerta no válida." };
  let q = createServiceClient().from("whatsapp_alertas").update({ vista_en: new Date().toISOString() }).is("vista_en", null);
  if (id) q = q.eq("id", id);
  const { error } = await q;
  if (error) return { error: "No se pudo marcar." };
  revalidatePath(RUTA_PLANTILLAS);
  return { ok: true };
}
