import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { productoVacio } from "@/lib/wms/producto";
import { FichaProductoShopify } from "../ficha-producto-shopify";

export const metadata = { title: "Agregar producto" };

export const dynamic = "force-dynamic";

export default async function WmsProductoNuevoPage() {
  const usuario = await requireModulo("wms-productos");
  // Crear exige poder modificar el módulo.
  if (usuario.modulosSoloLectura.includes("wms-productos")) notFound();
  const pais = await getPaisActual(createServiceClient());

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EtiquetaMiga texto="Agregar producto" />
      <FichaProductoShopify id={null} inicial={productoVacio()} paisId={pais.id} codigoPais={pais.codigo} puedeEscribir />
    </Pagina>
  );
}
