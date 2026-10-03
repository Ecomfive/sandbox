import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { productoVacio } from "@/lib/wms/producto";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import { FichaProductoShopify } from "../ficha-producto-shopify";

export const metadata = { title: "Agregar producto" };

export const dynamic = "force-dynamic";

export default async function WmsProductoNuevoPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("wms-productos");
  // Crear exige poder modificar el módulo.
  if (usuario.modulosSoloLectura.includes("wms-productos")) notFound();
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const skusMaestros = await obtenerOpcionesSkuMaestro(supabase);

  // Desde la ficha de un SKU maestro: la ficha nueva arranca con su nombre y su código ya elegidos.
  const { sku_maestro } = await searchParams;
  const maestro = typeof sku_maestro === "string" ? skusMaestros.find((s) => s.id === sku_maestro) : undefined;
  const inicial = productoVacio();
  if (maestro) {
    inicial.titulo = maestro.nombre;
    inicial.variantes = inicial.variantes.map((v, i) => (i === 0 ? { ...v, sku_maestro_id: maestro.id, sku: maestro.codigo } : v));
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EtiquetaMiga texto="Agregar producto" />
      <FichaProductoShopify id={null} inicial={inicial} paisId={pais.id} codigoPais={pais.codigo} puedeEscribir skusMaestros={skusMaestros} />
    </Pagina>
  );
}
