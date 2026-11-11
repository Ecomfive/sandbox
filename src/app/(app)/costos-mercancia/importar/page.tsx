import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ImportarCostos } from "./importar-costos";

export const metadata = { title: "Importar Excel" };

export const dynamic = "force-dynamic";

export default async function ImportarCostosPage() {
  const usuario = await requireModulo("costos-mercancia");
  if (usuario.modulosSoloLectura.includes("costos-mercancia")) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Importar Excel" imprimir={false} acciones={<BotonPlantilla modulo="costos-mercancia" />} />
      <ImportarCostos />
    </Pagina>
  );
}
