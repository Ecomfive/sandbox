import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ImportarDeliverys } from "./importar-deliverys";

export const metadata = { title: "Importar deliverys" };

export const dynamic = "force-dynamic";

export default async function ImportarDeliverysPage() {
  const usuario = await requireModulo("deliverys");
  // Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban).
  if (usuario.modulosSoloLectura.includes("deliverys")) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar deliverys" oculto />
      <div className="flex justify-end">
        <BotonPlantilla modulo="deliverys" />
      </div>
      <ImportarDeliverys />
    </Pagina>
  );
}
