"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { ETIQUETA_ESTADO } from "./def-catalogo";

function generarCodigo(prefijo: "MSK" | "CMB") {
  return `${prefijo}-${Date.now().toString(36).toUpperCase()}`;
}

export async function crearSkuSimple(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const nombre = (formData.get("nombre") as string).trim();
  const codigoManual = (formData.get("codigo") as string)?.trim();
  const codigo = codigoManual || generarCodigo("MSK");

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("skus_maestros")
    .insert({ codigo, nombre, tipo: "simple", estado: "propuesto", creado_por: usuario.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  await registrarAuditoria({
    accion: "crear_sku",
    entidad: "skus_maestros",
    entidadId: data.id,
    detalle: `código=${codigo}`,
  });
  revalidatePath("/catalogo-maestro");
}

export async function crearCombo(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const nombre = (formData.get("nombre") as string).trim();
  const codigoManual = (formData.get("codigo") as string)?.trim();
  const componenteIds = formData.getAll("componente_id") as string[];
  const cantidades = formData.getAll("cantidad") as string[];

  const componentes = componenteIds
    .map((id, i) => ({ id, cantidad: Number(cantidades[i]) || 0 }))
    .filter((c) => c.id && c.cantidad > 0);

  if (componentes.length === 0) {
    throw new Error("Un combo necesita al menos un componente con cantidad mayor a cero.");
  }

  const codigo = codigoManual || generarCodigo("CMB");
  const supabase = createServiceClient();
  const { data: combo, error } = await supabase
    .from("skus_maestros")
    .insert({ codigo, nombre, tipo: "combo", estado: "propuesto", creado_por: usuario.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { error: errorComponentes } = await supabase.from("sku_maestro_componentes").insert(
    componentes.map((c) => ({
      combo_id: combo.id,
      componente_id: c.id,
      cantidad: c.cantidad,
    }))
  );

  if (errorComponentes) throw new Error(errorComponentes.message);
  await registrarAuditoria({
    accion: "crear_sku",
    entidad: "skus_maestros",
    entidadId: combo.id,
    detalle: `código=${codigo}, ${componentes.length} componente(s)`,
  });
  revalidatePath("/catalogo-maestro");
}

/** «Nuevo SKU» de la ficha: crea un SKU simple o un combo según el `tipo`, con el error como valor (`{ error }`). */
export async function proponerSku(formData: FormData): Promise<{ error?: string }> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "Escribe el nombre del SKU." };
  try {
    if (formData.get("tipo") === "combo") await crearCombo(formData);
    else await crearSkuSimple(formData);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo guardar el SKU." };
  }
}

const TRANSICIONES: Record<string, string[]> = {
  propuesto: ["en_revision"],
  en_revision: ["propuesto", "aprobado"],
  aprobado: ["en_revision"],
};

export async function cambiarEstadoSku(formData: FormData) {
  const usuario = await requireModuloEscritura("catalogo-maestro");

  const id = formData.get("id") as string;
  const nuevoEstado = formData.get("nuevo_estado") as string;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("estado").eq("id", id).single();
  if (!actual || !TRANSICIONES[actual.estado]?.includes(nuevoEstado)) {
    throw new Error(`Transición inválida: ${actual?.estado} → ${nuevoEstado}`);
  }

  const { error } = await supabase
    .from("skus_maestros")
    .update({
      estado: nuevoEstado,
      aprobado_por: nuevoEstado === "aprobado" ? usuario.id : null,
      aprobado_en: nuevoEstado === "aprobado" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  await registrarAuditoria({
    accion: "cambiar_estado_sku",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Estado: ETIQUETA_ESTADO[actual.estado] ?? actual.estado },
    despues: { Estado: ETIQUETA_ESTADO[nuevoEstado] ?? nuevoEstado },
  });
  revalidatePath("/catalogo-maestro");
}

/** La actividad de un SKU (propuesto, cambios de estado...) para su ficha. Es una lectura, así que basta poder
 * abrir Catálogo. Devuelve el error como valor, no lo lanza. */
export async function obtenerHistorialSku(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo("catalogo-maestro");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "SKU no válido." };

  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "skus_maestros")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };

  return {
    eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })),
  };
}

export async function vincularProductoASku(formData: FormData) {
  await requireModuloEscritura("catalogo-maestro");
  const productoId = formData.get("producto_id") as string;
  const skuMaestroId = (formData.get("sku_maestro_id") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("productos")
    .update({ sku_maestro_id: skuMaestroId })
    .eq("id", productoId);

  if (error) throw new Error(error.message);
  revalidatePath("/productos");
}
