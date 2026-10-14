import { PaginaCompetencia } from "../pagina-competencia";
import { VistaCompetidores } from "../vista-competencia";

export const metadata = { title: "Competidores · Análisis de competencia" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaCompetencia titulo="Competidores">{(datos, puedeEscribir) => <VistaCompetidores datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
