"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { DECISIONES, esDecision } from "@/lib/compras/sin-stock";
import { RUTA_SIN_STOCK } from "@/lib/compras/sin-stock-datos";
import { getPaisActual } from "@/lib/pais";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cuántos productos sin stock faltan por revisar en el país de la barra (las alertas abiertas): el mismo número que lleva «Compras» en el
 * menú, para que la pestaña «Sin stock» diga de dónde sale (30 oct 2026, pedido de Hernán). null si no tiene Compras o la consulta falla.
 */
export async function contarSinStockPorRevisar(): Promise<number | null> {
  const usuario = await getUsuarioActual();
  if (!usuario?.modulos.includes("compras")) return null;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { count, error } = await supabase.from("compras_alertas_sin_stock").select("*", { count: "exact", head: true }).eq("pais_id", pais.id).eq("estado", "abierta");
  return error ? null : (count ?? 0);
}

/**
 * Compras revisa una alerta de sin stock (migración 0167): anota qué decidió (comprar, hay inventario manual, no reponer) y una nota. Se
 * puede volver a cambiar mientras la alerta siga viva; queda en la auditoría. Devuelve el error como valor.
 */
export async function revisarAlertaSinStock(id: string, decision: string, nota: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!UUID.test(String(id))) return { error: "Alerta no válida." };
  if (!esDecision(decision)) return { error: "Elige qué se decidió." };
  const texto = String(nota ?? "")
    .trim()
    .slice(0, 1000);
  const supabase = createServiceClient();
  const { data: alerta } = await supabase.from("compras_alertas_sin_stock").select("id, pais_id, nombre, estado, decision").eq("id", id).maybeSingle();
  if (!alerta || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, alerta.pais_id as string)))
    return { error: "La alerta ya no existe o no es de tus países." };
  if (alerta.estado === "cerrada")
    return {
      error: "Esta alerta ya se cerró: el producto volvió a tener stock.",
    };
  const { error } = await supabase
    .from("compras_alertas_sin_stock")
    .update({
      estado: "revisada",
      decision,
      nota: texto || null,
      revisada_por: usuario.id,
      revisada_por_nombre: usuario.nombre || usuario.email,
      revisada_en: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar." };
  const etiqueta = (v: unknown) => DECISIONES.find((d) => d.valor === v)?.etiqueta ?? "—";
  await registrarAuditoria({
    accion: "revisar_sin_stock",
    entidad: "compras_alertas_sin_stock",
    entidadId: id,
    detalle: `${alerta.nombre}${texto ? ` · ${texto}` : ""}`,
    antes: { Decisión: etiqueta(alerta.decision) },
    despues: { Decisión: etiqueta(decision) },
  });
  revalidatePath(RUTA_SIN_STOCK);
  return {};
}
