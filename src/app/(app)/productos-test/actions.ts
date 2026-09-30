"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { ESTADOS, NIVELES_EXPLOTACION, TEST_NUMEROS } from "./def-productos-test";

const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS.map((e) => e.valor));
const TEST_NUMEROS_VALIDOS: Set<string> = new Set(TEST_NUMEROS.map((t) => t.valor));
const EXPLOTACION_VALIDA: Set<string> = new Set(NIVELES_EXPLOTACION.map((e) => e.valor));

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

const fechaOptativa = (formData: FormData, campo: string): string | null => textoOptativo(formData, campo);

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre, el país o el estado). */
function leerCambios(formData: FormData) {
  const testNumero = (formData.get("test_numero") as string | null) || null;
  const explotacion = (formData.get("explotacion") as string | null) || null;
  return {
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
    revisado: formData.get("revisado") === "on",
    ultima_revision: fechaOptativa(formData, "ultima_revision"),
    observacion: textoOptativo(formData, "observacion"),
    explotacion: explotacion && EXPLOTACION_VALIDA.has(explotacion) ? explotacion : null,
  };
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearProductoTest(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("productos-test");
  const pais_id = formData.get("pais_id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const estado = (formData.get("estado") as string) || "sin_definir";

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("wms_productos_test")
    .insert({ pais_id, nombre, estado, creado_por: usuario.id, ...leerCambios(formData) })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await registrarAuditoria({ accion: "crear_producto_test", entidad: "wms_productos_test", entidadId: data.id, detalle: nombre });
  revalidatePath("/productos-test");
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
  if (error) return { error: error.message };

  revalidatePath("/productos-test");
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
  revalidatePath("/productos-test");
}
