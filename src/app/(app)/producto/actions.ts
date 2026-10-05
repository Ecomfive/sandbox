"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { esCodigoBarrasValido, normalizarCodigoBarras } from "@/lib/wms/codigo-barras";
import { ETIQUETA_CLASE } from "./def-producto";

const MODULO = "producto";
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

/**
 * Crea un producto: simple o compuesto, físico o de prueba (test). El código (SKU) es la llave con la que una venta de
 * Dropi o de una tienda de Shopify encuentra el producto para descontar el inventario, así que es obligatorio y único sin
 * importar mayúsculas ni espacios. Un compuesto se arma con productos simples. Devuelve el error como valor, porque en
 * producción Next.js oculta el mensaje de una excepción de una acción.
 */
export async function crearProducto(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const nombre = texto(formData, "nombre");
  const codigo = texto(formData, "codigo");
  const tipo = texto(formData, "tipo");
  const clase = texto(formData, "clase");
  // El código de barras es opcional: se escribe el del fabricante o se pide uno interno (no las dos cosas).
  const barras = normalizarCodigoBarras(texto(formData, "codigo_barras"));
  const generarBarras = texto(formData, "generar_barras") === "1";

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (nombre.length > 200) return { error: "El nombre es muy largo (máximo 200 caracteres)." };
  if (!codigo) return { error: "Escribe el SKU del producto." };
  if (codigo.length > 60 || /\s/.test(codigo)) return { error: "El SKU no puede llevar espacios ni pasar de 60 caracteres." };
  if (tipo !== "simple" && tipo !== "combo") return { error: "Elige si es simple o compuesto." };
  if (clase !== "fisico" && clase !== "test") return { error: "Elige si es físico o de prueba (test)." };
  if (barras && generarBarras) return { error: "Escribe el código de barras o pide uno interno, no las dos cosas." };
  if (barras && !esCodigoBarrasValido(barras)) return { error: "El código de barras no es válido: debe ser un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto." };

  // Un compuesto: pares (componente, cantidad), sin repetir un componente.
  const ids = formData.getAll("componente_id").map(String);
  const cantidades = formData.getAll("cantidad").map(String);
  const componentes = new Map<string, number>();
  if (tipo === "combo") {
    ids.forEach((id, i) => {
      const cantidad = Number(cantidades[i]);
      if (!ES_ID(id) || !Number.isInteger(cantidad) || cantidad <= 0) return;
      componentes.set(id, (componentes.get(id) ?? 0) + cantidad);
    });
    if (componentes.size === 0) return { error: "Un producto compuesto necesita al menos un componente con cantidad mayor a cero." };
  }

  const supabase = createServiceClient();
  if (componentes.size > 0) {
    const { data: simples } = await supabase.from("skus_maestros").select("id").eq("tipo", "simple").in("id", [...componentes.keys()]);
    if ((simples ?? []).length !== componentes.size) return { error: "Un componente no es un producto simple válido." };
  }

  const { data, error } = await supabase
    .from("skus_maestros")
    .insert({ codigo, nombre, tipo, clase, estado: "aprobado", creado_por: usuario.id, ...(barras ? { codigo_barras: barras, codigo_barras_origen: "fabricante" } : {}) })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: error.message.includes("barras") ? "Otro producto ya tiene ese código de barras." : "Ya hay un producto con ese SKU." };
    return { error: "No se pudo crear el producto." };
  }

  if (componentes.size > 0) {
    const { error: errorComponentes } = await supabase
      .from("sku_maestro_componentes")
      .insert([...componentes.entries()].map(([componente_id, cantidad]) => ({ combo_id: data.id, componente_id, cantidad })));
    if (errorComponentes) {
      await supabase.from("skus_maestros").delete().eq("id", data.id);
      return { error: "No se pudieron guardar los componentes." };
    }
  }

  // Si se pidió un código interno y no se pudo generar, el producto queda creado: se genera después desde su ficha.
  if (generarBarras) await supabase.rpc("wms_asignar_codigo_barras_interno", { p_sku: data.id });

  await registrarAuditoria({
    accion: "crear_producto",
    entidad: "skus_maestros",
    entidadId: data.id,
    detalle: `SKU ${codigo} · ${tipo === "combo" ? `compuesto de ${componentes.size}` : "simple"} · ${ETIQUETA_CLASE[clase]}`,
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/**
 * Pasa un producto de test a físico (se decidió comprarlo) o de físico a test. Vuelve a test solo si nunca tuvo movimientos
 * de inventario: con historia ya no es una prueba. Devuelve el error como valor.
 */
export async function cambiarClaseProducto(id: string, clase: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  if (clase !== "fisico" && clase !== "test") return { error: "Clase no válida." };

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo, clase").eq("id", id).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if (actual.clase === clase) return {};

  if (clase === "test") {
    const { count } = await supabase.from("wms_movimientos").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id);
    if ((count ?? 0) > 0) return { error: "Ya tiene movimientos de inventario: no se puede volver a marcar como test." };
  }

  const { error } = await supabase.from("skus_maestros").update({ clase }).eq("id", id);
  if (error) return { error: "No se pudo cambiar la clase." };
  await registrarAuditoria({
    accion: "cambiar_clase_producto",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Clase: ETIQUETA_CLASE[actual.clase] ?? actual.clase },
    despues: { Clase: ETIQUETA_CLASE[clase] },
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/** La actividad de un producto (creación, cambios de clase) para su ficha. Basta poder abrir Producto. */
export async function obtenerHistorialProducto(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };

  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "skus_maestros")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/** Vincula un producto que llega en los pedidos de Dropi (tabla `productos`) con un producto del sistema (o lo desvincula). */
export async function vincularProductoASku(formData: FormData) {
  await requireModuloEscritura(MODULO);
  const productoId = formData.get("producto_id") as string;
  const skuMaestroId = (formData.get("sku_maestro_id") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase.from("productos").update({ sku_maestro_id: skuMaestroId }).eq("id", productoId);
  if (error) throw new Error(error.message);
  revalidatePath("/productos");
}

/**
 * Guarda el código de barras del fabricante (EAN-8, UPC-A, EAN-13 o GTIN-14) de un producto, o lo quita si llega vacío. Se
 * comprueba el dígito de control: un código mal escrito se rechaza. Devuelve el error como valor.
 */
export async function guardarCodigoBarras(id: string, codigoTexto: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const codigo = normalizarCodigoBarras(codigoTexto);
  if (codigo && !esCodigoBarrasValido(codigo)) {
    return { error: "El código no es válido: debe ser un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto." };
  }

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo, codigo_barras").eq("id", id).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if ((actual.codigo_barras ?? "") === codigo) return {};

  const { error } = await supabase
    .from("skus_maestros")
    .update({ codigo_barras: codigo || null, codigo_barras_origen: codigo ? "fabricante" : null })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "Otro producto ya tiene ese código de barras." : "No se pudo guardar el código de barras." };

  await registrarAuditoria({
    accion: "guardar_codigo_barras",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { "Código de barras": actual.codigo_barras ?? "—" },
    despues: { "Código de barras": codigo || "—" },
  });
  revalidatePath("/producto");
  return {};
}

/**
 * Le genera a un producto que no tiene código de barras uno INTERNO (EAN-13 con prefijo 20, reservado por GS1 para uso interno),
 * para poder manejarlo en la bodega con escáner. Lo hace la base en una sola operación: dos personas a la vez no obtienen el
 * mismo código. Devuelve el código, o el error como valor.
 */
export async function generarCodigoBarrasInterno(id: string): Promise<{ codigo?: string; error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient().rpc("wms_asignar_codigo_barras_interno", { p_sku: id });
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo generar el código de barras." };
  await registrarAuditoria({
    accion: "generar_codigo_barras",
    entidad: "skus_maestros",
    entidadId: id,
    detalle: `código interno ${data}`,
  });
  revalidatePath("/producto");
  return { codigo: String(data) };
}
