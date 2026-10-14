import { PaginaCompetencia } from "../pagina-competencia";
import { VistaAlertas } from "../vista-competencia";

export const metadata = { title: "Alertas · Análisis de competencia" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaCompetencia titulo="Alertas">{(datos, puedeEscribir) => <VistaAlertas datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
