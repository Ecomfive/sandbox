import { PaginaCompetencia } from "../pagina-competencia";
import { VistaNuestros } from "../vista-competencia";

export const metadata = { title: "Productos · Análisis de competencia" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaCompetencia titulo="Productos">{(datos, puedeEscribir) => <VistaNuestros datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
