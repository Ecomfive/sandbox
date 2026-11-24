import { getPaisActual } from "@/lib/pais";
import { cargarHistorico } from "@/lib/meta-ads/historico-datos";
import { leerInterpretacionGuardada } from "@/lib/meta-ads/interpretacion-guardada";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { HallazgosVista } from "../hallazgos-vista";
import { MarcoMeta } from "../marco-meta";

export const metadata = { title: "Hallazgos · Anuncios Meta" };

export const dynamic = "force-dynamic";
/** Lee todo el historial de las cuentas y los pedidos de las tiendas: tarda unos segundos la primera vez (después se guarda 10 minutos). */
export const maxDuration = 120;

/**
 * Anuncios Meta › Hallazgos (24 nov 2026, pedido de Alcides): lo que dicen los datos de **todo el historial**, sin la calculadora de costos. Qué nunca funcionó y qué funciona mejor (también por tipo de producto), qué empieza a
 * empeorar o a mejorar y por qué motivo, la tasa de entrega de cada producto (vender bien en Meta y entregar mal cuesta más por venta real) y qué genera más ventas. La IA puede interpretar esas estadísticas.
 */
export default async function HallazgosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const supabase = createServiceClient();
  const paisActual = await getPaisActual(supabase);
  const [historico, guardada] = await Promise.all([cargarHistorico({ paisId: paisActual.id, cuentaId: datos.cuentaId, hoy: hoyEnPanama() }, supabase), leerInterpretacionGuardada(supabase, paisActual.id)]);
  return (
    <MarcoMeta titulo="Hallazgos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais} sinPeriodo>
      <HallazgosVista analisis={historico.analisis} interpretacion={guardada} escribe={escribe} iaConectada={datos.iaConectada} tiendas={historico.tiendas} pedidos={historico.pedidos} />
    </MarcoMeta>
  );
}
