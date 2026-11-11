"use server";

// «Guardar versión» del paquete bancario: vuelve a armar la foto en el servidor con el corte, la entidad y las secciones
// pedidos (no confía en cifras del navegador; solo en la carta, que se valida) y la guarda en `fin_paquetes_bancarios`.
// Pide poder modificar el Panel financiero y ver toda la empresa. Devuelve el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { armarPaqueteBancario, SIN_MIGRACION_PAQUETE } from "@/lib/finanzas/cargar-paquete-bancario";
import { leerCarta } from "@/lib/finanzas/paquete-bancario";
import { createServiceClient } from "@/lib/supabase/server";
import { leerParametrosPaquete, puedeVerPaquete, RUTA_PAQUETE } from "./parametros";

export async function guardarPaqueteBancario(entrada: { corte?: unknown; entidad?: unknown; secciones?: unknown; carta?: unknown }): Promise<{ error?: string; id?: string }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura("panel-financiero");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  if (!(await puedeVerPaquete())) return { error: "El paquete bancario es de toda la empresa." };
  const carta = leerCarta(entrada?.carta);
  if ("error" in carta) return { error: carta.error };
  const secciones = Array.isArray(entrada?.secciones) ? entrada.secciones.slice(0, 20).map(String) : undefined;
  const supabase = createServiceClient();
  const p = await leerParametrosPaquete(supabase, usuario, { corte: entrada?.corte, entidad: entrada?.entidad, secciones });
  const snap = await armarPaqueteBancario(supabase, { corte: p.corte, entidad: p.entidad, secciones: p.secciones, carta: carta.texto });
  const { data, error } = await supabase
    .from("fin_paquetes_bancarios")
    .insert({
      corte: snap.corte,
      entidad: snap.entidad,
      secciones: snap.secciones,
      carta: carta.texto || null,
      contenido: snap,
      creado_por: usuario.id,
      creado_por_nombre: usuario.nombre ?? usuario.email,
    })
    .select("id")
    .single();
  if (error || !data) return { error: SIN_MIGRACION_PAQUETE };
  await registrarAuditoria({
    accion: "guardar_paquete_bancario",
    entidad: "fin_paquetes_bancarios",
    entidadId: data.id as string,
    detalle: `Corte ${snap.corte.slice(0, 7)} · ${snap.entidad} · ${snap.secciones.length} secciones`,
  });
  revalidatePath(RUTA_PAQUETE);
  return { id: data.id as string };
}
