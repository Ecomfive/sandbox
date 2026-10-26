import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { llegadaDeCompra, resumenLlegada, type ResumenLlegada } from "@/lib/compras/en-camino";
import { cargarEnCaminoDatos } from "@/lib/compras/en-camino-datos";
import { cargarTiempos, claveTransito } from "@/lib/compras/tiempos-datos";

/**
 * Lo que viene en camino de cada producto de un país: las unidades de las órdenes ya pedidas que todavía no llegan (ya salieron o están
 * en producción, tracking o arribo: `lineaEnCamino`), cuándo llegan (la más próxima, `llegadaDeCompra`: la fecha límite de la compra o la
 * estimada con su fecha y vía de envío) y cuántas unidades no tienen fecha todavía, por id de producto. Un producto con variantes
 * suma las de sus variantes; un combo («Pack 2») cuenta lo que viene de sus componentes y al revés; y una orden que todavía no tiene
 * productos vinculados se cuenta para el producto que se llama igual (`cargarEnCaminoDatos`). Respeta el alcance de Compras de la
 * persona (Usuarios y roles › Afinar). Solo unidades y fechas: no trae costos. Si algo falla, un mapa vacío.
 */
export async function cargarEnCamino(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual): Promise<Map<string, ResumenLlegada>> {
  const resumen = new Map<string, ResumenLlegada>();
  const { porProducto, ordenes } = await cargarEnCaminoDatos(supabase, usuario, paisId);
  if (!porProducto.size) return resumen;
  const tiempos = await cargarTiempos();
  const llegadaDe = new Map([...ordenes.values()].map((o) => [o.id, llegadaDeCompra(tiempos, { fechaLimite: o.fechaLimite, fechaEnvio: o.fechaEnvio, vias: o.viaEnvio, clave: claveTransito(o.tipo, o.paisId) })?.fecha ?? null]));
  for (const [sku, aportes] of porProducto) {
    resumen.set(
      sku,
      resumenLlegada(aportes.map((a) => ({ unidades: a.unidades, llegada: llegadaDe.get(a.compraId) ?? null, sinEnvio: !ordenes.get(a.compraId)?.fechaEnvio }))),
    );
  }
  return resumen;
}
