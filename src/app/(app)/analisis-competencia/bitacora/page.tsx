import { PaginaCompetencia } from "../pagina-competencia";
import { VistaBitacora } from "../vista-competencia";

export const metadata = { title: "Bitácora de cambios · Análisis de competencia" };

export const dynamic = "force-dynamic";

export default function Page() {
  return <PaginaCompetencia titulo="Bitácora de cambios">{(datos, puedeEscribir) => <VistaBitacora datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
