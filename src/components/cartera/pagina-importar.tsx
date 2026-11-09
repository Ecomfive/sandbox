import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { MODULO_DE_CLASE, type Clase } from "@/lib/finanzas/cxc-cxp";
import { ImportarCartera } from "./importar-cartera";

/** «Importar Excel» de una cartera. Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban). */
export async function PaginaImportarCartera({ clase }: { clase: Clase }) {
  const modulo = MODULO_DE_CLASE[clase];
  const usuario = await requireModulo(modulo);
  if (usuario.modulosSoloLectura.includes(modulo)) redirect("/sin-acceso");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar Excel" oculto />
      <div className="flex justify-end">
        <BotonPlantilla modulo={clase === "cobrar" ? "cuentas-por-cobrar" : "cuentas-por-pagar"} />
      </div>
      <ImportarCartera clase={clase} />
    </Pagina>
  );
}
