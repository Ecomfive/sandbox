import { DashboardCompetencia } from "./dashboard-competencia";
import { PaginaCompetencia } from "./pagina-competencia";

export const metadata = { title: "Análisis de competencia" };

export const dynamic = "force-dynamic";

/** Investigación › Análisis de competencia › Dashboard: el catálogo de Dropi del país frente a ECOMFIVE, con gráficas y filtros. */
export default function Page() {
  return <PaginaCompetencia titulo="Análisis de competencia">{(datos) => <DashboardCompetencia datos={datos} />}</PaginaCompetencia>;
}
