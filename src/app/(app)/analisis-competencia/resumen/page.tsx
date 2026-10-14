import { DashboardCompetencia } from "../dashboard-competencia";
import { PaginaCompetencia } from "../pagina-competencia";

export const metadata = { title: "Resumen · Análisis de competencia" };

export const dynamic = "force-dynamic";

/** Análisis de competencia › Resumen: las gráficas (stock vendido por día, competidores y categorías, precios y más vendidos). */
export default function Page() {
  return <PaginaCompetencia titulo="Resumen">{(datos) => <DashboardCompetencia datos={datos} />}</PaginaCompetencia>;
}
