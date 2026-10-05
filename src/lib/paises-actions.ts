"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

/**
 * Agrega un país al sistema (código ISO de dos letras y nombre): queda disponible en Compras, el CRM y donde se elija un
 * país. Los países son de toda la empresa, así que pide poder modificar Configuración. Devuelve el error como valor.
 */
export async function crearPais(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[A-Z]{2}$/.test(codigo)) return { error: "El código son dos letras (el código ISO del país, Ej: MX)." };
  if (!nombre) return { error: "Escribe el nombre del país." };

  const supabase = createServiceClient();
  const { data: existente } = await supabase.from("paises").select("nombre").eq("codigo", codigo).maybeSingle();
  if (existente) return { error: `Ya existe: ${codigo} es ${existente.nombre}.` };

  const { data, error } = await supabase.from("paises").insert({ codigo, nombre }).select("id").single();
  if (error || !data) return { error: "No se pudo agregar el país." };
  await registrarAuditoria({ accion: "crear_pais", entidad: "paises", entidadId: data.id, detalle: `${codigo} · ${nombre}` });
  revalidatePath("/configuracion");
  revalidatePath("/compras");
  return {};
}
