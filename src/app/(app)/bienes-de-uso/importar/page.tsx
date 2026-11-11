import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ImportarBienes } from "./importar-bienes";

export const metadata = { title: "Importar bienes de uso" };

export const dynamic = "force-dynamic";

export default async function ImportarBienesPage() {
  const usuario = await requireModulo("bienes-de-uso");
  // Importar escribe: con solo lectura no se ofrece (la acción también lo comprueba).
  if (usuario.modulosSoloLectura.includes("bienes-de-uso")) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Importar Excel" imprimir={false} acciones={<BotonPlantilla modulo="bienes-de-uso" />} />
      <ImportarBienes />
    </Pagina>
  );
}
