"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { PAIS_DE_DROP, plataformaDisponible } from "@/lib/plataformas";
import { faltantesCrearDrop, MAX_IMAGENES } from "@/lib/publicaciones-drop/crear";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0221 (Gestión de IDs Drop) en la base.";

/**
 * Vincula una publicación de Drop con su producto de Producto, la cambia a otro o le quita el vínculo (`skuId` null), desde la lista o la ficha (3 nov 2026).
 * Siempre lo decide una persona (como en Gestión de IDs Dropi, decisión de Alcides del 25 oct 2026: nada se vincula solo). Queda en la auditoría.
 */
export async function vincularPublicacionDrop(
  id: string,
  skuId: string | null,
): Promise<{ ok: true; producto: { id: string; codigo: string; nombre: string } | null } | { error: string }> {
  await requireModuloEscritura("publicaciones-drop");
  if (typeof id !== "string" || !UUID.test(id) || (skuId !== null && (typeof skuId !== "string" || !UUID.test(skuId)))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("drop_publicaciones").select("nombre, codigo, sku_maestro_id").eq("id", id).maybeSingle();
  if (errorAntes) return { error: /drop_publicaciones|schema cache|does not exist/i.test(errorAntes.message) ? FALTA : "No se pudo leer la publicación." };
  if (!antes) return { error: "Esa publicación ya no existe. Recarga la página." };
  let sku: { id: string; codigo: string; nombre: string } | null = null;
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
    sku = { id: data.id as string, codigo: data.codigo as string, nombre: data.nombre as string };
  }
  if ((antes.sku_maestro_id ?? null) === (sku?.id ?? null)) return { ok: true, producto: sku };
  const { error } = await supabase.from("drop_publicaciones").update({ sku_maestro_id: sku?.id ?? null, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  const nombre = `${antes.nombre as string}${antes.codigo ? ` (${antes.codigo as string})` : ""}`;
  await registrarAuditoria({
    accion: sku ? "vincular_publicacion_drop" : "desvincular_publicacion_drop",
    entidad: "drop_publicaciones",
    entidadId: id,
    detalle: sku ? `${nombre} → ${sku.codigo} ${sku.nombre}` : `${nombre}: se quitó el vínculo con su producto`,
  });
  revalidatePath("/publicaciones-drop");
  return { ok: true, producto: sku };
}

/**
 * El costo escrito a mano de una publicación de Drop (10 nov 2026, migración 0267): solo cuenta cuando su producto no tiene costo en Gestión de IDs Dropi del país, ni
 * otra variante del mismo producto. `valor` null lo quita. En la moneda de Drop. Queda en la auditoría.
 */
export async function guardarCostoManualDrop(id: string, valor: number | null): Promise<{ ok: true } | { error: string }> {
  await requireModuloEscritura("publicaciones-drop");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Datos no válidos." };
  if (valor !== null && (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 100_000_000)) return { error: "Escribe un costo válido." };
  const supabase = createServiceClient();
  const { data: antes, error: e } = await supabase.from("drop_publicaciones").select("nombre, codigo, costo_manual").eq("id", id).maybeSingle();
  if (e) return { error: /costo_manual|schema cache|does not exist/i.test(e.message) ? "Falta correr la migración 0267 en la base." : "No se pudo leer la publicación." };
  if (!antes) return { error: "Esa publicación ya no existe. Recarga la página." };
  const nuevo = valor === null ? null : Math.round(valor * 100) / 100;
  const { error } = await supabase.from("drop_publicaciones").update({ costo_manual: nuevo }).eq("id", id);
  if (error) return { error: "No se pudo guardar el costo." };
  await registrarAuditoria({
    accion: "costo_manual_publicacion_drop",
    entidad: "drop_publicaciones",
    entidadId: id,
    detalle: `${antes.nombre as string}${antes.codigo ? ` (${antes.codigo as string})` : ""}`,
    antes: { "Costo a mano": antes.costo_manual == null ? "—" : String(antes.costo_manual) },
    despues: { "Costo a mano": nuevo === null ? "—" : String(nuevo) },
  });
  revalidatePath("/publicaciones-drop");
  return { ok: true };
}

const SIN_ESCRITURA = "Todavía no se escribe en Drop desde el sistema: por ahora solo se leen sus publicaciones. Créalo en Drop.";

/**
 * «Crear producto» de Gestión de IDs Drop (3 nov 2026, según Nicole; DROP-REFERENCIA.md). Comprueba en el servidor lo mismo que el formulario (nombre, descripción, categoría, precio de
 * venta, de 1 a 5 imágenes, enlace de creativos opcional); **por ahora el sistema no escribe en Drop**, así que no crea nada y lo dice. Devuelve el error como valor.
 */
export async function crearProductoDrop(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("publicaciones-drop");
  const pais = await getPaisActual(createServiceClient());
  if (!plataformaDisponible("drop", pais.codigo)) return { error: `Drop solo existe en Costa Rica (${PAIS_DE_DROP}).` };
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const precio = texto("precio") === "" ? null : Number(texto("precio"));
  const imagenes = formData.getAll("imagenes").filter((f) => f instanceof File && f.size > 0).length;
  const faltan = faltantesCrearDrop({ nombre: texto("nombre"), descripcion: texto("descripcion"), categoria: texto("categoria"), precio, imagenes, enlaceCreativos: texto("enlace_creativos") });
  if (faltan.length) return { error: `Falta o está mal: ${faltan.join(", ")}.` };
  if (imagenes > MAX_IMAGENES) return { error: `Máximo ${MAX_IMAGENES} imágenes.` };
  // El producto nuestro con que se vincula (opcional): debe existir.
  const skuId = texto("sku_maestro_id");
  if (skuId) {
    if (!UUID.test(skuId)) return { error: "Datos no válidos." };
    const { data: sku } = await createServiceClient().from("skus_maestros").select("id").eq("id", skuId).maybeSingle();
    if (!sku) return { error: "Ese producto nuestro ya no existe." };
  }
  return { error: SIN_ESCRITURA };
}
