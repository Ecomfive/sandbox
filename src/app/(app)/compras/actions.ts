"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { ETAPAS_COMPRA } from "./def-compras";

const ETAPAS_VALIDAS: Set<string> = new Set(ETAPAS_COMPRA.map((e) => e.valor));

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

const fechaOptativa = (formData: FormData, campo: string): string | null => (formData.get(campo) as string) || null;

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre, la etapa o el país). */
function leerCambios(formData: FormData) {
  return {
    proveedor: textoOptativo(formData, "proveedor"),
    cliente: textoOptativo(formData, "cliente"),
    tienda: textoOptativo(formData, "tienda"),
    track_id: textoOptativo(formData, "track_id"),
    orden: textoOptativo(formData, "orden"),
    producto_relacionado: textoOptativo(formData, "producto_relacionado"),
    qty_total: numeroOptativo(formData, "qty_total"),
    monto_total: numeroOptativo(formData, "monto_total"),
    primer_pago: numeroOptativo(formData, "primer_pago"),
    segundo_pago: numeroOptativo(formData, "segundo_pago"),
    pagado_a_proveedor: numeroOptativo(formData, "pagado_a_proveedor"),
    pago_pendiente: numeroOptativo(formData, "pago_pendiente"),
    cobrado_cliente: numeroOptativo(formData, "cobrado_cliente"),
    pendiente_cliente: numeroOptativo(formData, "pendiente_cliente"),
    pago_cliente: textoOptativo(formData, "pago_cliente"),
    cuenta_receptora: textoOptativo(formData, "cuenta_receptora"),
    factura: formData.get("factura") === "on",
    financiamiento: formData.get("financiamiento") === "on",
    revisado_aa: formData.get("revisado_aa") === "on",
    fecha_limite: fechaOptativa(formData, "fecha_limite"),
    fecha_llegada: fechaOptativa(formData, "fecha_llegada"),
    fecha_pago_1: fechaOptativa(formData, "fecha_pago_1"),
    fecha_pago_2: fechaOptativa(formData, "fecha_pago_2"),
    fecha_envio: fechaOptativa(formData, "fecha_envio"),
    inconveniente: textoOptativo(formData, "inconveniente"),
    planificacion: textoOptativo(formData, "planificacion"),
    documentos: textoOptativo(formData, "documentos"),
    notas: textoOptativo(formData, "notas"),
  };
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const pais_id = formData.get("pais_id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = (formData.get("etapa") as string) || "backlog";

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wms_compras")
    .insert({ pais_id, nombre, etapa, ...leerCambios(formData) })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await registrarAuditoria({ accion: "crear_compra", entidad: "wms_compras", entidadId: data.id, detalle: nombre });
  revalidatePath("/compras");
  return {};
}

/** Edita cualquier dato de una compra ya creada — todo junto, desde su ficha. */
export async function actualizarCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = formData.get("etapa") as string;

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("wms_compras")
    .update({ nombre, etapa, ...leerCambios(formData) })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/compras");
  return {};
}

export async function eliminarCompra(formData: FormData) {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("wms_compras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({ accion: "eliminar_compra", entidad: "wms_compras", entidadId: id, detalle: nombre });
  revalidatePath("/compras");
}
