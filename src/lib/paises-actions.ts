"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

/** El primer prefijo de compras «ECOM##» que no usa ningún país ni Importadora (ECOM01 es Panamá, ECOM07 Importadora…). */
async function siguientePrefijoLibre(): Promise<string> {
  const { data } = await createServiceClient().from("wms_compras_correlativo").select("prefijo");
  const usados = new Set((data ?? []).map((c) => c.prefijo as string | null));
  for (let n = 1; ; n++) {
    const prefijo = `ECOM${String(n).padStart(2, "0")}`;
    if (!usados.has(prefijo)) return prefijo;
  }
}

/**
 * Agrega un país al sistema (código ISO de dos letras y nombre): queda disponible en Compras, el CRM y donde se elija un
 * país. Toma solo el prefijo de sus órdenes de compra: el siguiente «ECOM##» libre (se puede cambiar en Configuración).
 * Los países son de toda la empresa, así que pide poder modificar Configuración. Devuelve el error como valor.
 */
export async function crearPais(formData: FormData): Promise<{ error?: string }> {
  const r = await agregarPais(String(formData.get("codigo") ?? ""), String(formData.get("nombre") ?? ""));
  return r.error ? { error: r.error } : {};
}

/**
 * Lo mismo, desde «Agregar país» de la compra nueva (se elige de la lista de países del mundo): devuelve el país agregado
 * para elegirlo ahí mismo.
 */
export async function agregarPaisRapido(codigo: string, nombre: string): Promise<{ error?: string; pais?: { id: string; codigo: string; nombre: string } }> {
  return agregarPais(codigo, nombre);
}

async function agregarPais(codigoBruto: string, nombreBruto: string): Promise<{ error?: string; pais?: { id: string; codigo: string; nombre: string } }> {
  await requireModuloEscritura("configuracion");
  const codigo = String(codigoBruto ?? "").trim().toUpperCase();
  const nombre = String(nombreBruto ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[A-Z]{2}$/.test(codigo)) return { error: "El código son dos letras (el código ISO del país, Ej: MX)." };
  if (!nombre) return { error: "Escribe el nombre del país." };

  const supabase = createServiceClient();
  const { data: existente } = await supabase.from("paises").select("nombre").eq("codigo", codigo).maybeSingle();
  if (existente) return { error: `Ya existe: ${codigo} es ${existente.nombre}.` };

  const { data, error } = await supabase.from("paises").insert({ codigo, nombre }).select("id").single();
  if (error || !data) return { error: "No se pudo agregar el país." };
  const prefijo = await siguientePrefijoLibre();
  await supabase.from("wms_compras_correlativo").upsert({ clave: codigo, prefijo }, { onConflict: "clave", ignoreDuplicates: true });
  await registrarAuditoria({ accion: "crear_pais", entidad: "paises", entidadId: data.id, detalle: `${codigo} · ${nombre} · compras ${prefijo}` });
  revalidatePath("/configuracion");
  revalidatePath("/compras");
  return { pais: { id: data.id as string, codigo, nombre } };
}

/**
 * El prefijo de las órdenes de compra de un país («ECOM05»): las compras nuevas de ese país toman el número siguiente
 * («ECOM05-0001»…). Cambiar el prefijo no toca los códigos que ya existen ni reinicia la numeración. Dos países no pueden
 * compartir prefijo. Pide poder modificar Configuración. Devuelve el error como valor.
 */
export async function guardarPrefijoCompras(codigoPais: string, prefijo: string): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  const limpio = String(prefijo ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(codigoPais)) return { error: "País no válido." };
  if (!/^[A-Z0-9]{2,12}$/.test(limpio)) return { error: "El prefijo son de 2 a 12 letras o números, sin espacios (Ej: ECOM05)." };
  const supabase = createServiceClient();
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", codigoPais).maybeSingle();
  if (!pais) return { error: "País no válido." };
  const { data: otro } = await supabase.from("wms_compras_correlativo").select("clave").eq("prefijo", limpio).neq("clave", codigoPais).maybeSingle();
  if (otro) return { error: `Ese prefijo ya lo usa ${otro.clave === "importacion" ? "Importadora" : otro.clave}.` };
  const { error } = await supabase
    .from("wms_compras_correlativo")
    .upsert({ clave: codigoPais, prefijo: limpio, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
  if (error) return { error: "No se pudo guardar el prefijo." };
  await registrarAuditoria({ accion: "prefijo_compras", entidad: "paises", entidadId: pais.id, detalle: `${codigoPais} · ${limpio}` });
  revalidatePath("/configuracion");
  return {};
}
