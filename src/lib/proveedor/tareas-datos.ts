// Compras › «Qué hacer con Chin»: junta lo que necesita `tareasChin` (espejo, pagos, novedades sin leer y desde cuándo espera cada
// pedido por cotizar) para Compras y el Tablero de Chin. Solo servidor; quien llama ya comprobó el acceso a Compras y dice qué
// países ve y si ve los montos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { cargarEspejo } from "./datos";
import { hoyPanama } from "./fechas";
import { conFotosDeCompras } from "./fotos-pedidos";
import { estadoPagos } from "./pagos-servidor";
import { tareasChin, type Tarea } from "./tareas";

export interface TareasChin {
  proveedor: string;
  tareas: Tarea[];
}

/** Las tareas con el proveedor activo; null si no hay proveedor o no se pudo leer (el panel no sale). */
export async function cargarTareasChin(supabase: SupabaseClient, opciones: { paisesPermitidos: string[] | null; veMontos: boolean }): Promise<TareasChin | null> {
  const { data: proveedor } = await supabase.from("proveedores").select("id").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  if (!proveedor) return null;
  const espejo = await cargarEspejo(supabase, proveedor.id as string);
  if ("error" in espejo) return null;
  const visibles = espejo.pedidos.filter((p) => puedeVerPais(opciones.paisesPermitidos, p.paisCodigo));
  const ids = new Set(visibles.map((p) => p.id));

  const [pagos, { data: novedades }, { data: porCotizar }, { pedidos: conFotos }] = await Promise.all([
    opciones.veMontos ? estadoPagos(supabase, { ...espejo, pedidos: visibles }) : Promise.resolve(null),
    supabase.from("proveedor_novedades").select("pedido_id").eq("proveedor_id", espejo.proveedor.id).eq("lado", "proveedor").is("leida_en", null).not("pedido_id", "is", null).limit(500),
    supabase.from("proveedor_pedidos").select("id, creado_en").eq("proveedor_id", espejo.proveedor.id).eq("etapa", "por_cotizar").eq("visible", true).limit(2000),
    conFotosDeCompras(supabase, visibles),
  ]);
  const estado = pagos && !("error" in pagos) ? pagos : null;
  const productoDe = new Map(visibles.map((p) => [p.id, p.producto]));

  const tareas = tareasChin({
    pedidos: visibles,
    plazos: espejo.plazos,
    porPagar: estado ? estado.porPagar.filter((c) => ids.has(c.pedidoId)) : [],
    avisosSinConfirmar: estado
      ? estado.avisos
          .filter((a) => a.estado === "avisado" && a.cuotas.some((c) => ids.has(c.pedidoId)))
          .map((a) => ({ id: a.id, fecha: a.fecha, monto: a.monto, productos: [...new Set(a.cuotas.map((c) => productoDe.get(c.pedidoId) ?? c.producto))] }))
      : [],
    nuevos: new Set((novedades ?? []).map((n) => n.pedido_id as string).filter((id) => ids.has(id))),
    creadoEn: Object.fromEntries((porCotizar ?? []).map((p) => [p.id as string, p.creado_en as string])),
    veMontos: opciones.veMontos,
    proveedor: espejo.proveedor.nombre,
    hoy: hoyPanama(),
  });
  // La foto de referencia es la comercial de Producto (la misma que ve el proveedor).
  const fotoDe = new Map(conFotos.map((p) => [p.id, p.fotoReferencia]));
  return { proveedor: espejo.proveedor.nombre, tareas: tareas.map((t) => (t.pedidoId && fotoDe.get(t.pedidoId) ? { ...t, foto: fotoDe.get(t.pedidoId)! } : t)) };
}
