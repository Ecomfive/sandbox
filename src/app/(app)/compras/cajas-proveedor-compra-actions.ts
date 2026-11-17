"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { aplicarCajasEcomfive } from "@/lib/proveedor/aplicar";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { BUCKET_PROVEEDOR, rutaEtiqueta } from "@/lib/proveedor/rutas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "./acceso-compras";

export interface CajasProveedorCompra {
  proveedor: string;
  cajas: number | null;
  etiquetas: EtiquetaPedido[];
  /** La persona puede anotar o corregir las cajas y la etiqueta (modificar Compras). */
  puedeEditar: boolean;
}

/**
 * Las cajas («Cartons») y la etiqueta de las cajas de una compra (16 nov 2026, pedido de Hernán), para su ficha y para el editor: lo que anotó el proveedor o lo que anotó el equipo, que es lo
 * mismo (los dos escriben en el mismo espejo que ve el portal del proveedor). Null si la compra no es de un proveedor con portal; sin cajas todavía, solo lo ve quien puede anotarlas.
 */
export async function obtenerCajasProveedorCompra(compraId: string): Promise<CajasProveedorCompra | null> {
  const usuario = await requireModulo("compras");
  if (!esUuid(compraId)) return null;
  // Solo de una compra que la persona puede ver (su país y su alcance).
  if (await sinAccesoACompras([compraId], usuario)) return null;
  const supabase = createServiceClient();
  const { data: p, error } = await supabase.from("proveedor_pedidos").select("visible, cajas, etiquetas_rutas, proveedores(nombre)").eq("compra_id", compraId).maybeSingle();
  if (error || !p || !p.visible) return null;
  const puedeEditar = !usuario.modulosSoloLectura.includes("compras");
  const rutas = ((p.etiquetas_rutas as string[] | null) ?? []).map(String);
  if (p.cajas == null && rutas.length === 0 && !puedeEditar) return null;
  const prov = p.proveedores as unknown as { nombre: string } | null;
  return { proveedor: prov?.nombre ?? "Proveedor", cajas: p.cajas == null ? null : Number(p.cajas), etiquetas: await direccionesDeEtiquetas(supabase, rutas), puedeEditar };
}

/** El permiso firmado para subir una imagen de etiqueta de las cajas de esa compra (carpeta de su pedido en el almacenamiento del portal). */
export async function prepararSubidaEtiquetaCompra(compraId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("compras");
  if (!esUuid(compraId)) return { error: "Compra no válida." };
  if (await sinAccesoACompras([compraId])) return { error: "No tienes acceso a esta compra." };
  const supabase = createServiceClient();
  const { data: p } = await supabase.from("proveedor_pedidos").select("id, proveedor_id, visible").eq("compra_id", compraId).maybeSingle();
  if (!p || !p.visible) return { error: "Esta compra no está en el portal de un proveedor." };
  const ruta = rutaEtiqueta(p.proveedor_id as string, p.id as string, String(nombreArchivo ?? ""), randomUUID());
  if (!ruta) return { error: "No se pudo preparar la subida." };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUploadUrl(ruta);
  if (error || !firmada) return { error: "No se pudo preparar la subida." };
  return { ruta, token: firmada.token };
}

/**
 * Anota o corrige las cajas y la etiqueta de las cajas de una compra a mano (para los envíos viejos que el proveedor no anotó). Queda en el espejo del proveedor (su portal lo ve), en la Actividad de
 * la compra (cambio de «Cajas» y un comentario con la etiqueta adjunta) y en la auditoría. `cajas` vacío deja las que ya tenía. Devuelve el error como valor.
 */
export async function guardarCajasCompra(
  compraId: string,
  datos: { cajas: string; nuevas: string[]; quitar: string[] },
): Promise<{ error?: string; cajas?: number; etiquetas?: EtiquetaPedido[] }> {
  const usuario = await requireModuloEscritura("compras");
  if (!esUuid(compraId) || !datos || typeof datos !== "object") return { error: "Compra no válida." };
  if (await sinAccesoACompras([compraId], usuario)) return { error: "No tienes acceso a esta compra." };
  const r = await aplicarCajasEcomfive(compraId, { id: usuario.id, nombre: usuario.nombre || usuario.email }, { cajas: datos.cajas, nuevas: Array.isArray(datos.nuevas) ? datos.nuevas : [], quitar: Array.isArray(datos.quitar) ? datos.quitar : [] });
  if ("error" in r) return r;
  await registrarAuditoria({
    accion: "editar_cajas_compra",
    entidad: "wms_compras",
    entidadId: compraId,
    detalle: `Cajas y etiqueta anotadas desde Compras: ${r.cajas} ${r.cajas === 1 ? "caja" : "cajas"}, ${r.etiquetas.length} ${r.etiquetas.length === 1 ? "imagen" : "imágenes"} de etiqueta`,
  });
  revalidatePath("/compras/lista");
  revalidatePath("/compras/tablero-chin");
  return { cajas: r.cajas, etiquetas: await direccionesDeEtiquetas(createServiceClient(), r.etiquetas) };
}
