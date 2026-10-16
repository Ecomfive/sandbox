"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { primeroLibre, sugerirSku } from "@/lib/wms/sugerir-sku";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const RUTA = "/creacion-ofertas";
const MODULO = "creacion-ofertas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OFERTAS = 3;

/** Comprueba que la fila de Selección exista y sea de un país que la persona ve. */
async function filaPermitida(seleccionId: string, permitidos: string[] | null) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_seleccion_productos").select("id, nombre, pais_id").eq("id", seleccionId).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id))) return null;
  return data;
}

/**
 * Crea o guarda una oferta de un producto (de 1 a 3 por producto): nombre («2x1»), unidades y precio en dólares. Sin `id` la
 * crea en el siguiente lugar libre. Devuelve el error como valor.
 */
export async function guardarOferta(datos: {
  id?: string;
  seleccionId: string;
  nombre: string;
  unidades: number;
  precio: number | null;
  notas?: string;
}): Promise<{ error?: string; id?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const nombre = String(datos.nombre ?? "").trim().slice(0, 120);
  const unidades = Number(datos.unidades);
  const precio = datos.precio === null || datos.precio === undefined || (datos.precio as unknown) === "" ? null : Number(datos.precio);
  const notas = String(datos.notas ?? "").trim().slice(0, 2000) || null;
  if (!UUID.test(datos.seleccionId) || (datos.id && !UUID.test(datos.id))) return { error: "Oferta no válida." };
  if (!nombre) return { error: "Escribe el nombre de la oferta (p. ej. «2x1»)." };
  if (!Number.isInteger(unidades) || unidades < 1 || unidades > 99) return { error: "Las unidades van de 1 a 99." };
  if (precio !== null && !(Number.isFinite(precio) && precio >= 0 && precio < 1_000_000)) return { error: "El precio no es válido." };

  const fila = await filaPermitida(datos.seleccionId, usuario.paisesPermitidos);
  if (!fila) return { error: "El producto ya no existe o no es de tus países." };
  const supabase = createServiceClient();
  const valores = { nombre, unidades, precio: precio === null ? null : Math.round(precio * 100) / 100, notas, actualizado_en: new Date().toISOString() };

  if (datos.id) {
    const { error } = await supabase.from("wms_seleccion_ofertas").update(valores).eq("id", datos.id).eq("seleccion_id", fila.id);
    if (error) return { error: "No se pudo guardar la oferta." };
    revalidatePath(RUTA);
    return { id: datos.id };
  }

  const { data: actuales } = await supabase.from("wms_seleccion_ofertas").select("orden").eq("seleccion_id", fila.id);
  const usados = new Set((actuales ?? []).map((o) => o.orden));
  const orden = [1, 2, 3].find((n) => !usados.has(n));
  if (!orden) return { error: `Un producto tiene ${MAX_OFERTAS} ofertas como máximo.` };
  const { data, error } = await supabase
    .from("wms_seleccion_ofertas")
    .insert({ ...valores, seleccion_id: fila.id, orden, creado_por: usuario.id })
    .select("id")
    .single();
  if (error || !data) return { error: "No se pudo crear la oferta." };
  await registrarAuditoria({ accion: "crear_oferta_seleccion", entidad: "wms_seleccion_productos", entidadId: fila.id, detalle: `Oferta ${orden}: ${nombre}` });
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  return { id: data.id };
}

/** Quita una oferta de un producto. */
export async function eliminarOferta(id: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(id)) return { error: "Oferta no válida." };
  const supabase = createServiceClient();
  const { data: oferta } = await supabase.from("wms_seleccion_ofertas").select("id, nombre, orden, seleccion_id").eq("id", id).maybeSingle();
  if (!oferta) return {};
  if (!(await filaPermitida(oferta.seleccion_id, usuario.paisesPermitidos))) return { error: "El producto no es de tus países." };
  const { error } = await supabase.from("wms_seleccion_ofertas").delete().eq("id", id);
  if (error) return { error: "No se pudo quitar la oferta." };
  await registrarAuditoria({ accion: "eliminar_oferta_seleccion", entidad: "wms_seleccion_productos", entidadId: oferta.seleccion_id, detalle: `Oferta ${oferta.orden}: ${oferta.nombre}` });
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  return {};
}

const BUCKET_FOTOS = "wms-productos";
const PREFIJO_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;
const escribe = (u: { modulos: string[]; modulosSoloLectura: string[] }, m: string) => u.modulos.includes(m) && !u.modulosSoloLectura.includes(m);

/**
 * «Enviar a Test» (16 oct 2026): un producto con su oferta lista pasa a Test productos. Crea su producto en Producto (simple, en
 * Test, con un SKU libre sacado del nombre, código de barras interno y la foto copiada) y su registro en Test productos ya
 * vinculado a ese producto y a su fila de Selección (`seleccion_id`), con el precio de su primera oferta. La fila de Selección
 * pasa a «En test». Así queda enlazado el recorrido Sugerencia → Selección → Test → Filtro → Compra. Hace falta poder escribir
 * en Creación de ofertas, Producto y Test productos. Devuelve el error como valor.
 */
export async function enviarATest(seleccionId: string): Promise<{ error?: string; sku?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!escribe(usuario, "producto") || !escribe(usuario, "productos-test")) return { error: "Tu rol no puede crear productos ni tests (Producto y Test productos)." };
  if (!UUID.test(seleccionId)) return { error: "Producto no válido." };
  if (!(await filaPermitida(seleccionId, usuario.paisesPermitidos))) return { error: "El producto ya no existe o no es de tus países." };

  const supabase = createServiceClient();
  const [{ data: fila }, { data: ofertas }, { data: yaTest }] = await Promise.all([
    supabase.from("wms_seleccion_productos").select("id, numero, nombre, estado, pais_id, foto_url, categoria, url_pagina, codigo_fuente").eq("id", seleccionId).maybeSingle(),
    supabase.from("wms_seleccion_ofertas").select("orden, nombre, precio").eq("seleccion_id", seleccionId).order("orden"),
    supabase.from("wms_productos_test").select("id").eq("seleccion_id", seleccionId).limit(1),
  ]);
  if (!fila) return { error: "El producto ya no existe." };
  if (fila.estado !== "crear_oferta") return { error: "Solo se envía a Test un producto en «Crear oferta»." };
  if (yaTest?.length) return { error: "Este producto ya se envió a Test." };
  const primera = (ofertas ?? []).find((o) => o.precio !== null);
  if (!primera) return { error: "Arma al menos una oferta con su precio antes de enviarlo a Test." };

  // El SKU: las palabras del nombre con barra, el primero libre (como sugiere la ficha de Producto).
  const base = sugerirSku(String(fila.nombre).slice(0, 200));
  if (!base) return { error: "No se pudo sacar un SKU del nombre: créalo a mano en Producto." };
  const { data: parecidos } = await supabase.from("skus_maestros").select("codigo").ilike("codigo", `${base}%`);
  const usados = new Set((parecidos ?? []).map((p) => String(p.codigo).trim().toUpperCase()));
  const codigo = primeroLibre(base, (c) => usados.has(c));

  const { data: sku, error: errorSku } = await supabase
    .from("skus_maestros")
    .insert({ codigo, nombre: fila.nombre, tipo: "simple", clase: "test", estado: "aprobado", creado_por: usuario.id })
    .select("id")
    .single();
  if (errorSku || !sku) return { error: errorSku?.code === "23505" ? "Ya hay un producto con ese SKU; inténtalo de nuevo." : "No se pudo crear el producto." };
  await supabase.rpc("wms_asignar_codigo_barras_interno", { p_sku: sku.id });

  // La foto de Selección, copiada a la carpeta del producto (si luego se cambia una, no toca la otra).
  if (fila.foto_url && String(fila.foto_url).startsWith(PREFIJO_FOTOS)) {
    const origen = String(fila.foto_url).slice(PREFIJO_FOTOS.length);
    const destino = `productos/${sku.id}/${origen.split("/").pop()}`;
    const { error: errorCopia } = await supabase.storage.from(BUCKET_FOTOS).copy(origen, destino);
    if (!errorCopia) await supabase.from("skus_maestros").update({ foto_url: PREFIJO_FOTOS + destino }).eq("id", sku.id);
  }

  const { data: test, error: errorTest } = await supabase
    .from("wms_productos_test")
    .insert({
      pais_id: fila.pais_id,
      nombre: fila.nombre,
      sku_maestro_id: sku.id,
      seleccion_id: fila.id,
      estado: "pendiente",
      categoria: fila.categoria,
      pagina_producto_url: fila.url_pagina,
      metrica_oferta: Number(primera.precio),
    })
    .select("id")
    .single();
  if (errorTest || !test) {
    await supabase.from("skus_maestros").delete().eq("id", sku.id);
    return { error: "No se pudo crear el test. ¿Ya se corrió la migración 0110?" };
  }
  const { error: errorEstado } = await supabase.from("wms_seleccion_productos").update({ estado: "en_test", actualizado_en: new Date().toISOString() }).eq("id", fila.id);
  if (errorEstado) return { error: "El test se creó, pero la fila de Selección no pasó a «En test». ¿Ya se corrió la migración 0110?" };

  const sel = `SEL-${String(fila.numero).padStart(4, "0")}`;
  await registrarAuditoriaLote([
    { accion: "crear_producto", entidad: "skus_maestros", entidadId: sku.id, detalle: `SKU ${codigo} · simple · Test (desde Creación de ofertas, ${sel} · ${fila.codigo_fuente})` },
    { accion: "crear_producto_test", entidad: "wms_productos_test", entidadId: test.id, detalle: `${fila.nombre} (desde ${sel} · ${fila.codigo_fuente}, oferta «${primera.nombre}»)` },
    { accion: "enviar_a_test", entidad: "wms_seleccion_productos", entidadId: fila.id, antes: { Estado: "Crear oferta" }, despues: { Estado: "En test" } },
  ]);
  revalidatePath(RUTA);
  revalidatePath("/seleccion-productos");
  revalidatePath("/productos-test", "layout");
  revalidatePath("/producto");
  return { sku: codigo };
}
