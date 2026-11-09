import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ImportarVentas } from "./importar-ventas";

export const metadata = { title: "Importar Excel" };

export const dynamic = "force-dynamic";

export default async function ImportarVentasPage() {
  const usuario = await requireModulo("ventas-tiendas");
  // Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban).
  if (usuario.modulosSoloLectura.includes("ventas-tiendas")) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar Excel" oculto />
      <div className="flex justify-end">
        <BotonPlantilla modulo="ventas-tiendas" />
      </div>
      <ImportarVentas />
    </Pagina>
  );
}
