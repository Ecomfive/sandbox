import { CampanasLista } from "../campanas-lista";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { ResumenCampanas } from "../resumen-campanas";

export const metadata = { title: "Campañas · Anuncios Meta" };

export const dynamic = "force-dynamic";

/** Anuncios Meta › Campañas: todas las campañas de las cuentas, con su tipo (CBO o ABO, puja, etapa), quién las montó y cómo les va. Agrupa y filtra como Compras y Gestión de IDs. */
export default async function CampanasMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const sp = await searchParams;
  const abrir = Array.isArray(sp.abrir) ? sp.abrir[0] : sp.abrir;
  const faltan = Array.isArray(sp.faltan) ? sp.faltan[0] : sp.faltan;
  return (
    <MarcoMeta titulo="Campañas" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <ResumenCampanas campanas={datos.campanas} />
      <CampanasLista campanas={datos.campanas} // Solo los anuncios que gastaron en el periodo o siguen activos: mandar todos (miles, con su texto) pesaba ~17 MB y tardaba 6 s en cargar (medido el 23 nov 2026).
        anuncios={datos.anuncios.filter((a) => a.activo || a.r.gasto > 0)} cuentas={datos.cuentas} productos={datos.productos} escribe={escribe} abrirInicial={abrir ?? null} soloFaltanInicial={faltan === "1"} />
    </MarcoMeta>
  );
}
