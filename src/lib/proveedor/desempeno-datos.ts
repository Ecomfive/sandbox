// La lectura de «Tu desempeño con Ecomfive» (ver `desempeno.ts`). Solo servidor, con el cliente de servicio: quien llama ya comprobó el
// acceso (la cuenta del proveedor en el portal, el módulo en el Tablero de Shen Zhen). Al proveedor solo le llegan cifras: días, unidades y
// órdenes por país; nada de la Actividad interna.

import type { SupabaseClient } from "@supabase/supabase-js";
import { clavePlazo, type PedidoPortal } from "./datos";
import { enviosPorSemana, estanciasTerminadas, transitosConPlazo, VENTANA_DIAS, type DesempenoProveedor, type EventoEtapaCompra } from "./desempeno";
import type { Plazo } from "./transito";

const DIA = 86_400_000;
/** Los cambios de etapa se leen de un poco más atrás que la ventana, para saber cuándo empezó una estancia que terminó dentro de ella. */
const LECTURA_DIAS = 180;

export async function cargarDesempeno(
  supabase: SupabaseClient,
  pedidos: PedidoPortal[],
  plazos: Record<string, Plazo>,
  hoy: string,
): Promise<DesempenoProveedor> {
  const ahora = Date.parse(`${hoy}T23:59:59-05:00`);
  const desde = ahora - VENTANA_DIAS * DIA;
  const paisDe = new Map(pedidos.map((p) => [p.compraId, p.paisCodigo]));

  const ids = pedidos.filter((p) => p.etapa !== "descartado").map((p) => p.compraId);
  const tandas: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) tandas.push(ids.slice(i, i + 100));
  const leidoDesde = new Date(ahora - LECTURA_DIAS * DIA).toISOString();
  const respuestas = await Promise.all(
    tandas.map((t) =>
      supabase.from("wms_compra_eventos").select("compra_id, valor_despues, ocurrido_en").eq("campo", "etapa").in("compra_id", t).gte("ocurrido_en", leidoDesde).limit(5000),
    ),
  );
  const eventos: EventoEtapaCompra[] = respuestas.flatMap((r) =>
    r.error ? [] : (r.data ?? []).map((e) => ({ compraId: String(e.compra_id), valor: (e.valor_despues as string | null) ?? null, ocurridoEn: String(e.ocurrido_en) })),
  );

  const conPais = (xs: { compraId: string; dias: number }[]) => xs.map((x) => ({ pais: paisDe.get(x.compraId) ?? null, dias: x.dias }));
  const desdeFecha = new Date(desde).toISOString().slice(0, 10);
  return {
    envios: enviosPorSemana(pedidos),
    cotizaciones: conPais(estanciasTerminadas(eventos, "enviado_cotizacion", desde, "cotizado")),
    producciones: conPais(estanciasTerminadas(eventos, "produccion", desde)),
    transitos: transitosConPlazo(
      pedidos,
      (pais, via) => {
        const p = plazos[clavePlazo(pais, via === "aire" ? "aire" : "mar")];
        return p ? (p.max ?? p.min) : null;
      },
      desdeFecha,
    ),
  };
}
