import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { Pagina } from "@/components/ui/pagina";
import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";
import { cargarEntidades } from "@/lib/finanzas/cargar-entidades";
import { createServiceClient } from "@/lib/supabase/server";
import { ImportarExcel } from "./importar-excel";

export const metadata = { title: "Importar Excel" };

export const dynamic = "force-dynamic";

export default async function ImportarLibroPage() {
  const usuario = await requireModulo("libro-movimientos");
  // Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban).
  if (usuario.modulosSoloLectura.includes("libro-movimientos")) redirect("/sin-acceso");
  // Sin la migración 0923 no hay entidades: el libro es de Panamá, como siempre.
  const entidades = (await cargarEntidades(createServiceClient())).map((e) => ({ codigo: e.codigo, razon_social: e.razon_social, moneda: e.moneda }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Importar Excel" imprimir={false} acciones={<BotonPlantilla modulo="libro-movimientos" />} />
      <ImportarExcel entidades={entidades} />
    </Pagina>
  );
}
