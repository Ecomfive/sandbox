"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { ESTADOS, TEST_NUMEROS } from "./def-productos-test";
import { crearProducto } from "../producto/actions";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { pasarTestsAFiltro } from "@/lib/productos-test/pasar-a-filtro";

const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS.map((e) => e.valor));
const TEST_NUMEROS_VALIDOS: Set<string> = new Set(TEST_NUMEROS.map((t) => t.valor));

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

const fechaOptativa = (formData: FormData, campo: string): string | null => textoOptativo(formData, campo);

/** Al vincular un test con su fila de Selección, esa fila pasa a «En test» (si todavía estaba antes). Nunca lanza. */
async function marcarSeleccionEnTest(supabase: ReturnType<typeof createServiceClient>, formData: FormData) {
  const seleccion = String(formData.get("seleccion_id") ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(seleccion)) return;
  await supabase.from("wms_seleccion_productos").update({ estado: "en_test", actualizado_en: new Date().toISOString() }).eq("id", seleccion).in("estado", ["seleccionado", "crear_oferta"]);
  revalidatePath("/seleccion-productos");
}

/**
 * Las filas de Selección de un país que todavía no tienen test (más la que ya tiene este), para el campo «Viene de
 * Selección» del formulario. Basta poder abrir Test productos. Devuelve el error como valor.
 */
export async function opcionesSeleccionParaTest(paisId: string, actual: string | null): Promise<{ opciones: { id: string; etiqueta: string }[] } | { error: string }> {
  await requireModulo("productos-test");
  if (!/^[0-9a-fA-F-]{36}$/.test(paisId)) return { error: "País no válido." };
  const supabase = createServiceClient();
  const [{ data: filas, error }, { data: conTest }] = await Promise.all([
    supabase.from("wms_seleccion_productos").select("id, numero, nombre, codigo_fuente").eq("pais_id", paisId).neq("estado", "descartado").order("numero", { ascending: false }).limit(500),
    supabase.from("wms_productos_test").select("seleccion_id").not("seleccion_id", "is", null),
  ]);
  if (error) return { error: "No se pudo cargar Selección." };
  const ocupadas = new Set((conTest ?? []).map((t) => t.seleccion_id as string));
  return {
    opciones: (filas ?? [])
      .filter((f) => f.id === actual || !ocupadas.has(f.id))
      .map((f) => ({ id: f.id as string, etiqueta: `SEL-${String(f.numero).padStart(4, "0")} · ${f.codigo_fuente} · ${f.nombre}` })),
  };
}

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre, el país o el estado). */
function leerCambios(formData: FormData) {
  const testNumero = (formData.get("test_numero") as string | null) || null;
  const sku = String(formData.get("sku_maestro_id") ?? "").trim();
  const seleccion = String(formData.get("seleccion_id") ?? "").trim();
  return {
    // El producto de Producto con que se vincula (vacío = ninguno).
    sku_maestro_id: /^[0-9a-fA-F-]{36}$/.test(sku) ? sku : null,
    // La fila de Selección de la que viene (migración 0110; vacío = ninguna): enlaza el recorrido del producto.
    ...(formData.has("seleccion_id") ? { seleccion_id: /^[0-9a-fA-F-]{36}$/.test(seleccion) ? seleccion : null } : {}),
    fecha_creacion: fechaOptativa(formData, "fecha_creacion"),
    fuente: textoOptativo(formData, "fuente"),
    pagina_producto_url: textoOptativo(formData, "pagina_producto_url"),
    video_url: textoOptativo(formData, "video_url"),
    categoria: textoOptativo(formData, "categoria"),
    angulo_venta: textoOptativo(formData, "angulo_venta"),
    worldwide: textoOptativo(formData, "worldwide"),
    ad_library: textoOptativo(formData, "ad_library"),
    fecha_test: fechaOptativa(formData, "fecha_test"),
    clickup: formData.get("clickup") === "on",
    test_numero: testNumero && TEST_NUMEROS_VALIDOS.has(testNumero) ? testNumero : null,
    calculadora_url: textoOptativo(formData, "calculadora_url"),
    campana_url: textoOptativo(formData, "campana_url"),
    metrica_oferta: numeroOptativo(formData, "metrica_oferta"),
    metrica_cpm: numeroOptativo(formData, "metrica_cpm"),
    metrica_efectividad: numeroOptativo(formData, "metrica_efectividad"),
    metrica_hook_rate: numeroOptativo(formData, "metrica_hook_rate"),
    metrica_ctr: numeroOptativo(formData, "metrica_ctr"),
    metrica_cpa: numeroOptativo(formData, "metrica_cpa"),
    metrica_gasto: numeroOptativo(formData, "metrica_gasto"),
    metrica_compras: numeroOptativo(formData, "metrica_compras"),
    metrica_cvr: numeroOptativo(formData, "metrica_cvr"),
  };
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearProductoTest(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("productos-test");
  const pais_id = formData.get("pais_id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const estado = (formData.get("estado") as string) || "pendiente";

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wms_productos_test")
    .insert({ pais_id, nombre, estado, creado_por: usuario.id, ...leerCambios(formData) })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Esa fila de Selección ya está vinculada a otro test." : error.message };

  await marcarSeleccionEnTest(supabase, formData);
  await registrarAuditoria({ accion: "crear_producto_test", entidad: "wms_productos_test", entidadId: data.id, detalle: nombre });
  // Vinculado a un producto Activo: pasa a Filtro de productos.
  if (await pasarTestsAFiltro(supabase, { testIds: [data.id] })) revalidatePath("/filtro-productos");
  revalidatePath("/productos-test", "layout");
  return {};
}

/** Edita cualquier dato de un producto en test ya creado — todo junto, desde su ficha. */
export async function actualizarProductoTest(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("productos-test");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const estado = formData.get("estado") as string;

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("wms_productos_test")
    .update({ nombre, estado, actualizado_en: new Date().toISOString(), ...leerCambios(formData) })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "Esa fila de Selección ya está vinculada a otro test." : error.message };

  await marcarSeleccionEnTest(supabase, formData);
  // Vinculado a un producto Activo: pasa a Filtro de productos.
  if (await pasarTestsAFiltro(supabase, { testIds: [id] })) revalidatePath("/filtro-productos");
  revalidatePath("/productos-test", "layout");
  return {};
}

export async function eliminarProductoTest(formData: FormData) {
  await requireModuloEscritura("productos-test");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;

  const supabase = createServiceClient();
  const { error } = await supabase.from("wms_productos_test").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({ accion: "eliminar_producto_test", entidad: "wms_productos_test", entidadId: id, detalle: nombre });
  revalidatePath("/productos-test", "layout");
}

/**
 * «Nuevo producto» junto al campo «Producto» del formulario de Test productos: crea el producto en Producto con la misma ficha
 * (y las mismas reglas: `crearProducto` pide poder modificar Producto) y lo devuelve para dejarlo elegido en el formulario,
 * donde se completan las métricas del test y se guarda como siempre.
 */
export async function crearProductoParaTest(formData: FormData): Promise<{ error?: string; producto?: OpcionSkuMaestro }> {
  await requireModuloEscritura("productos-test");
  const creado = await crearProducto(formData);
  if (creado.error || !creado.id) return { error: creado.error ?? "No se pudo crear el producto." };
  const { data } = await createServiceClient().from("skus_maestros").select("id, codigo, nombre, estado, numero, foto_url").eq("id", creado.id).maybeSingle();
  if (!data) return { error: "El producto se creó, pero no se pudo leer: búscalo en «Producto»." };
  revalidatePath("/producto");
  return { producto: { id: data.id, codigo: data.codigo, nombre: data.nombre, estado: data.estado, numero: data.numero ?? null, foto: data.foto_url ?? null } };
}
