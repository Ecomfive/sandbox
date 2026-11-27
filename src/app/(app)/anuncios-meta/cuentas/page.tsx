import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { PanelCuentas } from "../panel-cuentas";

export const metadata = { title: "Cuentas · Anuncios Meta" };

export const dynamic = "force-dynamic";
// «Traer historial» lee un mes por llamada desde esta página.
export const maxDuration = 300;

/** Anuncios Meta › Cuentas: la conexión con Meta, las cuentas publicitarias del país (una tienda puede tener varias), el CPA tope de cada producto y cómo se leen los nombres de las campañas. */
export default async function CuentasMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  return (
    <MarcoMeta titulo="Cuentas" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais} soloContenidoSiHayCuentas={false}>
      <PanelCuentas calculados={datos.topesProductos} cuentas={datos.cuentas} topes={datos.topes} productos={datos.productos} enMarcha={datos.enMarcha.productos} escribe={escribe} hayToken={hayToken} pais={pais} hoy={datos.hasta} />
    </MarcoMeta>
  );
}
