"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { ESTADOS, ESTADOS_REGISTRO, PRIORIDADES, TIPOS_ENVIO } from "./def-filtros";

const REGISTROS_VALIDOS: Set<string> = new Set(ESTADOS_REGISTRO.map((e) => e.valor));
const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS.map((e) => e.valor));
const ENVIOS_VALIDOS: Set<string> = new Set(TIPOS_ENVIO.map((t) => t.valor));
const PRIORIDADES_VALIDAS: Set<string> = new Set(PRIORIDADES.map((p) => p.valor));

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre o el país). */
function leerCambios(formData: FormData) {
  const tipoEnvio = (formData.get("tipo_envio") as string | null) || null;
  return {
    foto_url: textoOptativo(formData, "foto_url"),
    tipo_envio: tipoEnvio && ENVIOS_VALIDOS.has(tipoEnvio) ? tipoEnvio : null,
    qty_producto: numeroOptativo(formData, "qty_producto"),
    precio_total: numeroOptativo(formData, "precio_total"),
    precio_unitario: numeroOptativo(formData, "precio_unitario"),
    aprobacion_gestionada: formData.get("aprobacion_gestionada") === "on",
    comentarios: textoOptativo(formData, "comentarios"),
  };
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearFiltro(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  const pais_id = formData.get("pais_id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const estado_registro = (formData.get("estado_registro") as string) || "en_cola";
  const estado = (formData.get("estado") as string) || "pendiente";
  const prioridad = (formData.get("prioridad") as string) || "normal";

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!REGISTROS_VALIDOS.has(estado_registro)) return { error: "Elige un estado del registro válido." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };
  if (!PRIORIDADES_VALIDAS.has(prioridad)) return { error: "Elige una prioridad válida." };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wms_filtro_productos")
    .insert({ pais_id, nombre, estado_registro, estado, prioridad, creado_por: usuario.id, ...leerCambios(formData) })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await registrarAuditoria({ accion: "crear_filtro_producto", entidad: "wms_filtro_productos", entidadId: data.id, detalle: nombre });
  revalidatePath("/compras/filtros");
  return {};
}

/** Edita cualquier dato de un producto candidato ya creado — todo junto, desde su ficha. */
export async function actualizarFiltro(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const estado_registro = formData.get("estado_registro") as string;
  const estado = formData.get("estado") as string;
  const prioridad = formData.get("prioridad") as string;

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!REGISTROS_VALIDOS.has(estado_registro)) return { error: "Elige un estado del registro válido." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };
  if (!PRIORIDADES_VALIDAS.has(prioridad)) return { error: "Elige una prioridad válida." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("wms_filtro_productos")
    .update({ nombre, estado_registro, estado, prioridad, actualizado_en: new Date().toISOString(), ...leerCambios(formData) })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/compras/filtros");
  return {};
}

export async function eliminarFiltro(formData: FormData) {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("wms_filtro_productos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({ accion: "eliminar_filtro_producto", entidad: "wms_filtro_productos", entidadId: id, detalle: nombre });
  revalidatePath("/compras/filtros");
}
