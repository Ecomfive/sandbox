"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { etiquetaTipoFoto, TIPOS_FOTO } from "@/lib/publicaciones/ia/asistente";
import { leerImagenModelo, MAX_GUIA, MAX_IMAGENES_MODELO, normalizarEstilo, pedidoEstiloImagen, TIPO_GENERAL } from "@/lib/publicaciones/ia/estilos";
import { pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "publicaciones-dropi";
const SIN_MIGRACION = "Falta correr en Supabase la migración 0135.";
const SIN_IA = "Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel).";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Cuántas guías puede haber: cada una se suma a los pedidos, no tiene sentido acumular decenas. */
const MAX_ESTILOS = 30;

const tipoValido = (t: unknown): t is string => t === TIPO_GENERAL || TIPOS_FOTO.some((x) => x.valor === t);
const nombreLimpio = (n: unknown) => (typeof n === "string" ? n.replace(/\s+/g, " ").trim().slice(0, 60) : "");
const guiaLimpia = (g: unknown) => (typeof g === "string" ? g.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_GUIA) : "");
const etiquetaTipo = (t: string) => (t === TIPO_GENERAL ? "todas las fotos" : etiquetaTipoFoto(t));

async function tablaLista(): Promise<boolean> {
  const { error } = await createServiceClient().from("dropi_ia_estilos_imagen").select("id").limit(1);
  return !error;
}

/**
 * Reentrenar la IA con imágenes modelo, paso 1: la IA mira las imágenes (ya reducidas por el navegador) y escribe la guía de estilo.
 * **No guarda nada**: ni las imágenes ni el texto; la persona revisa y corrige la guía antes de guardarla. Basta poder modificar el módulo.
 */
export async function analizarImagenesModeloIA(entrada: { tipo: string; imagenes: string[] }): Promise<{ error?: string; guia?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!tipoValido(entrada?.tipo)) return { error: "Elige a qué fotos aplica." };
  const lista = Array.isArray(entrada?.imagenes) ? entrada.imagenes : [];
  if (!lista.length) return { error: "Elige al menos una imagen." };
  if (lista.length > MAX_IMAGENES_MODELO) return { error: `Máximo ${MAX_IMAGENES_MODELO} imágenes a la vez.` };
  const imagenes: string[] = [];
  for (const i of lista) {
    const r = leerImagenModelo(i);
    if ("error" in r) return { error: r.error };
    imagenes.push(r.dataUrl);
  }
  if (!proveedorTexto()) return { error: SIN_IA };
  // Antes de pagar el análisis, que la guía se pueda guardar.
  if (!(await tablaLista())) return { error: SIN_MIGRACION };
  const r = await pedirIA(
    { ...pedidoEstiloImagen(entrada.tipo === TIPO_GENERAL ? null : etiquetaTipoFoto(entrada.tipo), imagenes.length), imagenes },
    false,
    { operacion: "estilo_imagen", modulo: MODULO, usuario },
  );
  if ("error" in r) return { error: r.error };
  const guia = normalizarEstilo(r.texto);
  if (!guia) return { error: "La IA no pudo describir el estilo de esas imágenes. Prueba con otras o con más de una." };
  return { guia };
}

/** Paso 2: guarda la guía (lo que quedó después de revisarla) con su nombre y a qué fotos aplica. Las imágenes no se guardan. */
export async function guardarEstiloImagenIA(entrada: { nombre: string; tipo: string; guia: string }): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const nombre = nombreLimpio(entrada?.nombre);
  const guia = guiaLimpia(entrada?.guia);
  if (nombre.length < 2) return { error: "Escribe un nombre." };
  if (!tipoValido(entrada?.tipo)) return { error: "Elige a qué fotos aplica." };
  if (guia.length < 20) return { error: "La guía es muy corta." };
  const supabase = createServiceClient();
  const { count, error: errorCuenta } = await supabase.from("dropi_ia_estilos_imagen").select("id", { count: "exact", head: true });
  if (errorCuenta) return { error: SIN_MIGRACION };
  if ((count ?? 0) >= MAX_ESTILOS) return { error: `Ya hay ${MAX_ESTILOS} guías: elimina alguna antes de agregar otra.` };
  const { error } = await supabase.from("dropi_ia_estilos_imagen").insert({ nombre, tipo: entrada.tipo, guia, creado_por: usuario.id, creado_por_nombre: usuario.nombre || usuario.email });
  if (error) return { error: "No se pudo guardar la guía." };
  await registrarAuditoria({ accion: "crear_estilo_imagen_ia", entidad: "dropi_publicaciones", detalle: `Imagen modelo «${nombre}» (${etiquetaTipo(entrada.tipo)})` });
  revalidatePath("/publicaciones-dropi/reglas");
  return {};
}

/** Cambia el nombre, el tipo, la guía o si está activa. Solo lo que llega en `cambios`. */
export async function actualizarEstiloImagenIA(id: string, cambios: { nombre?: string; tipo?: string; guia?: string; activo?: boolean }): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "No se encontró la guía." };
  const fila: Record<string, unknown> = {};
  if (cambios?.nombre !== undefined) {
    const n = nombreLimpio(cambios.nombre);
    if (n.length < 2) return { error: "Escribe un nombre." };
    fila.nombre = n;
  }
  if (cambios?.tipo !== undefined) {
    if (!tipoValido(cambios.tipo)) return { error: "Elige a qué fotos aplica." };
    fila.tipo = cambios.tipo;
  }
  if (cambios?.guia !== undefined) {
    const g = guiaLimpia(cambios.guia);
    if (g.length < 20) return { error: "La guía es muy corta." };
    fila.guia = g;
  }
  if (typeof cambios?.activo === "boolean") fila.activo = cambios.activo;
  if (!Object.keys(fila).length) return {};
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("dropi_ia_estilos_imagen").select("nombre").eq("id", id).maybeSingle();
  if (!antes) return { error: "No se encontró la guía." };
  const { error } = await supabase.from("dropi_ia_estilos_imagen").update({ ...fila, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el cambio." };
  const soloActivo = Object.keys(fila).length === 1 && "activo" in fila;
  await registrarAuditoria({
    accion: "editar_estilo_imagen_ia",
    entidad: "dropi_publicaciones",
    detalle: soloActivo ? `Imagen modelo «${antes.nombre}»: ${fila.activo ? "activada" : "apagada"}` : `Imagen modelo «${antes.nombre}»: cambió ${Object.keys(fila).join(", ")}`,
  });
  revalidatePath("/publicaciones-dropi/reglas");
  return {};
}

/** Borra una guía (la IA deja de usarla). */
export async function eliminarEstiloImagenIA(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "No se encontró la guía." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("dropi_ia_estilos_imagen").select("nombre").eq("id", id).maybeSingle();
  if (!antes) return { error: "No se encontró la guía." };
  const { error } = await supabase.from("dropi_ia_estilos_imagen").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la guía." };
  await registrarAuditoria({ accion: "eliminar_estilo_imagen_ia", entidad: "dropi_publicaciones", detalle: `Imagen modelo «${antes.nombre}» eliminada` });
  revalidatePath("/publicaciones-dropi/reglas");
  return {};
}
