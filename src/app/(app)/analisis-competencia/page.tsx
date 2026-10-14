import { PaginaCompetencia } from "./pagina-competencia";
import { VistaCompetidores } from "./vista-competencia";

export const metadata = { title: "Análisis de competencia" };

export const dynamic = "force-dynamic";

/**
 * Investigación › Análisis de competencia: una sola pantalla. Las novedades (alertas) arriba y la lista de competidores de
 * Dropi del país; cada competidor se abre en su sitio con sus productos y cada producto con su historial.
 */
export default function Page() {
  return <PaginaCompetencia titulo="Análisis de competencia">{(datos, puedeEscribir) => <VistaCompetidores datos={datos} puedeEscribir={puedeEscribir} />}</PaginaCompetencia>;
}
