"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerFulfillment } from "@/lib/publicaciones/fulfillment-pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dinero = (n: number | null) => (n === null ? "sin dato" : `$${n.toFixed(2)}`);

/**
 * «Fulfillment por pedido» de un país, en Bodegas (pedido de Hernán, 31 oct 2026; migración 0208). Guarda el valor del país y lo pone en **todas**
 * las publicaciones de Gestión de IDs Dropi de ese país que tenían otro (su utilidad y su margen se recalculan solos), con el valor de antes en la
 * Actividad de cada una; las nuevas lo traen. Vacío = en ese país se vuelve a escribir en cada publicación (no se toca ninguna). Hace falta poder
 * escribir en Bodegas y en Gestión de IDs Dropi.
 */
export async function guardarFulfillmentPais(paisId: string, texto: string): Promise<{ ok: true; cambiadas: number; valor: number | null } | { error: string }> {
  const usuario = await requireModuloEscritura("wms-bodegas");
  if (!usuario.modulos.includes("publicaciones-dropi") || usuario.modulosSoloLectura.includes("publicaciones-dropi"))
    return { error: "Cambiar el fulfillment cambia el margen de las publicaciones: hace falta poder escribir en Gestión de IDs Dropi." };
  if (typeof paisId !== "string" || !UUID.test(paisId)) return { error: "País no válido." };
  const leido = leerFulfillment(texto);
  if ("error" in leido) return leido;
  const { valor } = leido;
  const supabase = createServiceClient();
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return { error: "No tienes acceso a este país." };

  const { data: pais, error: errorPais } = await supabase.from("paises").select("nombre, fulfillment").eq("id", paisId).maybeSingle();
  if (errorPais) return { error: /fulfillment|column|schema cache/i.test(errorPais.message) ? "Falta correr la migración 0208 (fulfillment por país) en la base." : "No se pudo leer el país." };
  if (!pais) return { error: "Ese país no existe." };
  const antes = pais.fulfillment === null || pais.fulfillment === undefined ? null : Number(pais.fulfillment);
  const { error: errorGuardar } = await supabase.from("paises").update({ fulfillment: valor }).eq("id", paisId);
  if (errorGuardar) return { error: "No se pudo guardar el fulfillment." };

  // Las publicaciones del país que tienen otro fulfillment toman el nuevo, con el de antes en su Actividad.
  let cambiadas = 0;
  if (valor !== null) {
    const distintas = (
      await traerTodasLasFilas<{ id: string; fulfillment: number | null }>((d, h) => supabase.from("dropi_publicaciones").select("id, fulfillment").eq("pais_id", paisId).order("id").range(d, h))
    ).filter((p) => p.fulfillment === null || Number(p.fulfillment) !== valor);
    for (let i = 0; i < distintas.length; i += 500) {
      const lote = distintas.slice(i, i + 500);
      const { error: errorLote } = await supabase.from("dropi_publicaciones").update({ fulfillment: valor }).in("id", lote.map((p) => p.id));
      if (errorLote) return { error: `Se guardó el fulfillment del país, pero no se pudo poner en todas sus publicaciones (${cambiadas} de ${distintas.length}). Vuelve a guardarlo.` };
      await supabase.from("dropi_publicacion_comentarios").insert(
        lote.map((p) => ({
          publicacion_id: p.id,
          autor: "Fulfillment del país",
          texto: `Fulfillment: ${dinero(p.fulfillment === null ? null : Number(p.fulfillment))} → ${dinero(valor)} (el de ${pais.nombre}, cambiado en Bodegas por ${usuario.nombre || usuario.email})`,
        })),
      );
      cambiadas += lote.length;
    }
  }
  await registrarAuditoria({
    accion: "fulfillment_pais",
    entidad: "paises",
    entidadId: paisId,
    detalle: `${pais.nombre}: fulfillment ${dinero(antes)} → ${valor === null ? "se escribe en cada publicación" : dinero(valor)}${cambiadas ? ` · ${cambiadas} publicaciones cambiadas` : ""}`,
  });
  revalidatePath("/wms-bodegas");
  revalidatePath("/publicaciones-dropi");
  return { ok: true, cambiadas, valor };
}
