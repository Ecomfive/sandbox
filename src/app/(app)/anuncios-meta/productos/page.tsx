import { leerCostos } from "@/lib/meta-ads/costos-operacion";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { VistaProductos } from "../vista-productos";

export const metadata = { title: "Productos · Anuncios Meta" };

export const dynamic = "force-dynamic";

/**
 * Anuncios Meta › Productos (23 nov 2026, pedido de Alcides): todo lo que se gastó y vendió de cada producto, sumando sus campañas del periodo elegido arriba. Cada persona elige qué columnas ver (todas las métricas
 * del documento «Métrica»); arranca en los productos con campañas activas (25 nov 2026). Tocar un producto abre su ficha con sus cifras, los ángulos que usa, sus campañas y sus videos (`?abrir=<producto>` lo abre directo).
 */
export default async function ProductosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, paisId, hayToken } = await cargarPaginaMeta(searchParams);
  const calculadora = await leerCostos(createServiceClient(), paisId);
  const sp = await searchParams;
  const abrir = Array.isArray(sp.abrir) ? sp.abrir[0] : sp.abrir;
  return (
    <MarcoMeta titulo="Productos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <VistaProductos productos={datos.productosVista} campanas={datos.campanas} videos={datos.videos} historial={datos.historial} enMarcha={datos.enMarcha} abrirInicial={abrir ?? null} calculadora={calculadora} escribe={escribe} />
    </MarcoMeta>
  );
}
