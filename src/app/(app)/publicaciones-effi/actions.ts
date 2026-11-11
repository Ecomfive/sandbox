"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { consultarEffi, modificarEffi } from "@/lib/effi/api";
import { montoEffi, tarifasEffi } from "@/lib/effi/articulos";
import { armarPreciosEffi, precioValido, type CambioPreciosEffi } from "@/lib/effi/precios";
import { sincronizarEffi, type ResumenLecturaEffi } from "@/lib/effi/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0230 (Gestión de IDs Effi) en la base.";

/** Vincula un artículo de Effi con su producto, lo cambia o le quita el vínculo (`skuId` null). Siempre lo decide una persona, como en Dropi y Drop. */
export async function vincularPublicacionEffi(
  id: string,
  skuId: string | null,
): Promise<{ ok: true; producto: { id: string; codigo: string; nombre: string } | null } | { error: string }> {
  await requireModuloEscritura("publicaciones-effi");
  if (typeof id !== "string" || !UUID.test(id) || (skuId !== null && (typeof skuId !== "string" || !UUID.test(skuId)))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("effi_publicaciones").select("nombre, effi_id, sku_maestro_id").eq("id", id).maybeSingle();
  if (errorAntes) return { error: /effi_publicaciones|schema cache|does not exist/i.test(errorAntes.message) ? FALTA : "No se pudo leer el artículo." };
  if (!antes) return { error: "Ese artículo ya no existe. Recarga la página." };
  let sku: { id: string; codigo: string; nombre: string } | null = null;
  if (skuId) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
    if (!data) return { error: "Ese producto ya no existe." };
    sku = { id: data.id as string, codigo: data.codigo as string, nombre: data.nombre as string };
  }
  if ((antes.sku_maestro_id ?? null) === (sku?.id ?? null)) return { ok: true, producto: sku };
  const { error } = await supabase.from("effi_publicaciones").update({ sku_maestro_id: sku?.id ?? null, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar el vínculo." };
  const nombre = `${antes.nombre as string} (ID ${antes.effi_id as string})`;
  await registrarAuditoria({
    accion: sku ? "vincular_publicacion_effi" : "desvincular_publicacion_effi",
    entidad: "effi_publicaciones",
    entidadId: id,
    detalle: sku ? `${nombre} → ${sku.codigo} ${sku.nombre}` : `${nombre}: se quitó el vínculo con su producto`,
  });
  revalidatePath("/publicaciones-effi");
  return { ok: true, producto: sku };
}

/** «Actualizar desde Effi»: la misma lectura del cron. Solo consulta Effi y guarda aquí. */
export async function actualizarDesdeEffi(): Promise<{ resumen?: ResumenLecturaEffi; error?: string }> {
  await requireModuloEscritura("publicaciones-effi");
  try {
    const resumen = await sincronizarEffi(createServiceClient());
    revalidatePath("/publicaciones-effi");
    return { resumen };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo leer Effi.";
    return { error: /effi_publicaciones|schema cache|does not exist/i.test(mensaje) ? FALTA : mensaje };
  }
}

const palabraEn = (tarifas: Map<string, number>, palabra: string) => [...tarifas].find(([nombre]) => nombre.includes(palabra))?.[1] ?? null;

/**
 * «Guardar precios en Effi» de la ficha (9 nov 2026): cambia en Effi la Tarifa Dropshipping, la Sugerida y el precio mínimo de un
 * artículo, al instante por su API (Effi sí deja modificar, a diferencia de Dropi). Lee el artículo y las tarifas justo antes para
 * mandar todas las tarifas (`armarPreciosEffi`), vuelve a leerlo después para guardar aquí lo que quedó en Effi y deja la auditoría.
 */
export async function cambiarPreciosEffi(
  id: string,
  nuevos: { precio?: unknown; precioSugerido?: unknown; precioMinimo?: unknown },
): Promise<{ ok: true; precio: number | null; precioSugerido: number | null; precioMinimo: number | null } | { error: string }> {
  await requireModuloEscritura("publicaciones-effi");
  if (typeof id !== "string" || !UUID.test(id) || !nuevos || typeof nuevos !== "object") return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: pub, error: errorPub } = await supabase.from("effi_publicaciones").select("nombre, effi_id, precio_dropshipping, precio_sugerido, precio_minimo, en_effi").eq("id", id).maybeSingle();
  if (errorPub) return { error: /effi_publicaciones|schema cache|does not exist/i.test(errorPub.message) ? FALTA : "No se pudo leer el artículo." };
  if (!pub) return { error: "Ese artículo ya no existe. Recarga la página." };
  if (!pub.en_effi) return { error: "Este artículo ya no aparece en Effi: no se puede cambiar su precio." };
  const effiId = Number(pub.effi_id);
  if (!Number.isInteger(effiId) || effiId <= 0) return { error: "El artículo no tiene un ID de Effi válido." };

  // Solo lo que cambió (con un margen de medio céntimo): lo demás no se manda.
  const cambio: CambioPreciosEffi = {};
  const campos = [
    ["precio", nuevos.precio, pub.precio_dropshipping, "Tarifa Dropshipping"],
    ["precioSugerido", nuevos.precioSugerido, pub.precio_sugerido, "Tarifa Sugerida"],
    ["precioMinimo", nuevos.precioMinimo, pub.precio_minimo, "Precio mínimo"],
  ] as const;
  for (const [clave, valor, antes, etiqueta] of campos) {
    if (valor === undefined || valor === null || valor === "") continue;
    const n = precioValido(valor);
    if (n === null) return { error: `${etiqueta}: escribe un precio válido (un número de 0 en adelante).` };
    if (antes === null || Math.abs(n - Number(antes)) > 0.004) cambio[clave] = n;
  }
  if (!Object.keys(cambio).length) return { error: "No cambiaste ningún precio." };

  const [articulo, tarifas] = await Promise.all([
    consultarEffi<Record<string, unknown>>("articulo", { id: effiId, pagina: 1, por_pagina: 1 }),
    cambio.precio !== undefined || cambio.precioSugerido !== undefined ? consultarEffi<Record<string, unknown>>("tarifa_precio", { pagina: 1, por_pagina: 100 }) : null,
  ]);
  if (!articulo.ok) return { error: articulo.error };
  const actual = articulo.data.find((a) => Number(a.id) === effiId);
  if (!actual) return { error: "Effi no encontró este artículo (¿lo anularon?). Pulsa «Actualizar desde Effi»." };
  if (tarifas && !tarifas.ok) return { error: tarifas.error };
  const vigentes = (tarifas?.ok ? tarifas.data : [])
    .filter((t) => String(t.vigente ?? "1") !== "0")
    .map((t) => ({ id: Number(t.id), nombre: String(t.nombre ?? "") }))
    .filter((t) => Number.isInteger(t.id) && t.nombre);
  const cuerpo = armarPreciosEffi(effiId, actual.precios_venta, vigentes, cambio);
  if ("error" in cuerpo) return cuerpo;

  const r = await modificarEffi("articulo", cuerpo);
  if (!r.ok) return { error: r.error };

  // Lo que quedó en Effi (no lo que se pidió): se vuelve a leer y se guarda aquí, igual que haría la lectura diaria.
  const despues = await consultarEffi<Record<string, unknown>>("articulo", { id: effiId, pagina: 1, por_pagina: 1 });
  const leido = despues.ok ? despues.data.find((a) => Number(a.id) === effiId) : undefined;
  const tarifasDespues = tarifasEffi(leido?.precios_venta);
  const quedo = {
    precio: leido ? palabraEn(tarifasDespues, "dropshipping") : (cambio.precio ?? (pub.precio_dropshipping as number | null)),
    precioSugerido: leido ? palabraEn(tarifasDespues, "sugerid") : (cambio.precioSugerido ?? (pub.precio_sugerido as number | null)),
    precioMinimo: leido ? montoEffi(leido.p_min_venta) : (cambio.precioMinimo ?? (pub.precio_minimo as number | null)),
  };
  await supabase
    .from("effi_publicaciones")
    .update({ precio_dropshipping: quedo.precio, precio_sugerido: quedo.precioSugerido, precio_minimo: quedo.precioMinimo, actualizado_en: new Date().toISOString() })
    .eq("id", id);

  const fmt = (n: unknown) => (n === null || n === undefined ? "—" : `₡${Number(n).toLocaleString("es-CR")}`);
  const antes: Record<string, string> = {};
  const ahora: Record<string, string> = {};
  for (const [clave, , valorAntes, etiqueta] of campos) {
    if (cambio[clave] === undefined) continue;
    antes[etiqueta] = fmt(valorAntes);
    ahora[etiqueta] = fmt(quedo[clave]);
  }
  await registrarAuditoria({
    accion: "cambiar_precio_effi",
    entidad: "effi_publicaciones",
    entidadId: id,
    detalle: `${pub.nombre as string} (ID ${pub.effi_id as string}): precios cambiados en Effi`,
    antes,
    despues: ahora,
  });
  revalidatePath("/publicaciones-effi");
  return { ok: true, ...quedo };
}
