import { cargarPaginaMeta, prepararAnalisisSiHaceFalta, type ParametrosMeta } from "../datos-pagina";
import { HallazgosVista } from "../hallazgos-vista";
import { MarcoMeta } from "../marco-meta";
import { leerAnalisisGuardado } from "@/lib/meta-ads/analisis-guardado";
import { cargarHistorico } from "@/lib/meta-ads/historico-datos";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Hallazgos · Anuncios Meta" };

export const dynamic = "force-dynamic";
/** Si el análisis todavía no está hecho (o es de hace más de un día) se prepara en segundo plano, y eso puede tardar unos minutos con la IA. */
export const maxDuration = 300;

/**
 * Anuncios Meta › Hallazgos (24 nov 2026, pedido de Alcides): el detalle de lo que dicen los datos de **todo el historial**, sin la calculadora de costos: qué nunca funcionó y qué funciona mejor (también por tipo de producto), qué empieza
 * a empeorar o a mejorar y por qué, la tasa de entrega de cada producto, qué genera más ventas y el mes a mes. El sistema lo analiza solo (el cron de Meta, cada día) y lo deja guardado; aquí se lee ya hecho. Arriba hay un chat para
 * preguntarle a la IA cualquier cosa que se pueda contestar con esas estadísticas. Los hallazgos que piden atención salen también como sugerencias en el Resumen.
 */
export default async function HallazgosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken, paisId } = await cargarPaginaMeta(searchParams);
  const supabase = createServiceClient();
  // Sin cuenta elegida se lee lo guardado (al instante); con una cuenta elegida, o si todavía no hay nada guardado, se calcula (y se guarda 10 minutos).
  const guardado = datos.cuentaId ? null : await leerAnalisisGuardado(supabase, paisId);
  const vivo = guardado ? null : await cargarHistorico({ paisId, cuentaId: datos.cuentaId, hoy: hoyEnPanama() }, supabase);
  prepararAnalisisSiHaceFalta(datos, paisId, pais);
  return (
    <MarcoMeta titulo="Hallazgos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais} sinPeriodo>
      <HallazgosVista
        analisis={(guardado?.analisis ?? vivo?.analisis)!}
        interpretacion={datos.interpretacion}
        iaConectada={datos.iaConectada}
        preparando={datos.analisisPendiente}
        vigilancias={datos.vigilancias}
        investigaciones={datos.investigaciones}
        escribe={escribe}
      />
    </MarcoMeta>
  );
}
