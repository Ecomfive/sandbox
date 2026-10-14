import { PaginaCompetencia } from "../pagina-competencia";
import { VistaNuevos } from "../vista-competencia";

export const metadata = { title: "Nuevos que no tenemos · Análisis de competencia" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaCompetencia titulo="Nuevos que no tenemos">{(datos, puedeEscribir) => <VistaNuevos datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
