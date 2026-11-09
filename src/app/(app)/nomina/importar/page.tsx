import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ImportarNomina } from "./importar-nomina";

export const metadata = { title: "Importar nómina" };

export const dynamic = "force-dynamic";

export default async function ImportarNominaPage() {
  const usuario = await requireModulo("nomina");
  // Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban).
  if (usuario.modulosSoloLectura.includes("nomina")) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar nómina" oculto />
      <div className="flex justify-end">
        <BotonPlantilla modulo="nomina" />
      </div>
      <ImportarNomina />
    </Pagina>
  );
}
