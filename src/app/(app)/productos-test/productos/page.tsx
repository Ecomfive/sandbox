import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { obtenerOpcionesProducto, obtenerProductosTest } from "../datos-test";
import { ProveedorSkusMaestros } from "@/components/ui/selector-sku-maestro";
import { ListaProductosTest } from "../lista-productos-test";

export const metadata = { title: "Productos" };

export const dynamic = "force-dynamic";

/** Los productos en test, uno por uno: filtrar, ordenar, ver su ficha y editarlo. */
export default async function ProductosEnTestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("productos-test");
  const { buscar } = await searchParams;
  const buscarInicial = typeof buscar === "string" ? buscar : "";
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [productos, opcionesProducto] = await Promise.all([obtenerProductosTest(supabase, pais.id), obtenerOpcionesProducto(supabase)]);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Productos" oculto />
      {/* Los productos de Producto, para elegir el de cada producto en prueba (el buscador de la orden de compra). */}
      <ProveedorSkusMaestros opciones={opcionesProducto}>
        <ListaProductosTest key={buscarInicial} buscarInicial={buscarInicial} productos={productos} paisId={pais.id} puedeEscribir={!usuario.modulosSoloLectura.includes("productos-test")} />
      </ProveedorSkusMaestros>
    </Pagina>
  );
}
