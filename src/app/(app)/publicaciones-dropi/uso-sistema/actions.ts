"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { MOTIVOS_FUERA, esMotivoFuera } from "@/lib/publicaciones/origen";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTA = 300;

/** Anota por qué algo se hizo en Dropi. Sin motivo, lo quita. */
export async function guardarMotivoUso(publicacionId: string, motivo: string, nota: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("uso-sistema");
  if (typeof publicacionId !== "string" || !UUID.test(publicacionId)) return { error: "Publicación no válida." };
  if (motivo !== "" && !esMotivoFuera(motivo)) return { error: "Motivo no válido." };
  const texto = typeof nota === "string" ? nota.trim().slice(0, MAX_NOTA) : "";

  const supabase = createServiceClient();
  const { data: pub } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, pais_id, origen").eq("id", publicacionId).maybeSingle();
  if (!pub || pub.origen !== "dropi") return { error: "Esa publicación no se creó en Dropi." };
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pub.pais_id as string))) return { error: "No tienes acceso a este país." };

  const { error } = motivo
    ? await supabase.from("uso_sistema_motivos").upsert({
        publicacion_id: publicacionId,
        motivo,
        nota: texto || null,
        actualizado_por: usuario.id,
        actualizado_por_nombre: usuario.nombre || usuario.email,
        actualizado_en: new Date().toISOString(),
      })
    : await supabase.from("uso_sistema_motivos").delete().eq("publicacion_id", publicacionId);
  if (error) return { error: "No se pudo guardar el motivo." };

  const etiqueta = MOTIVOS_FUERA.find((m) => m.valor === motivo)?.etiqueta ?? "sin motivo";
  await registrarAuditoria({
    accion: "motivo_uso_sistema",
    entidad: "dropi_publicaciones",
    entidadId: publicacionId,
    detalle: `${numeroPublicacion(pub.numero as number | null)} (${pub.nombre as string}): ${etiqueta}${texto ? ` · ${texto}` : ""}`,
  });
  revalidatePath("/publicaciones-dropi/uso-sistema");
  return {};
}
