import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ImportarConciliacion } from "./importar-conciliacion";

export const metadata = { title: "Importar" };

export const dynamic = "force-dynamic";

export default async function ImportarConciliacionPage() {
  const usuario = await requireModulo("conciliacion-bancaria");
  // Importar escribe: con solo lectura no se ofrece (las acciones también lo comprueban).
  if (usuario.modulosSoloLectura.includes("conciliacion-bancaria")) redirect("/sin-acceso");
  const { data, error } = await createServiceClient().from("fin_cuentas").select("id, nombre, clase").eq("activo", true).order("nombre");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar" oculto />
      <div className="flex justify-end">
        <BotonPlantilla modulo="conciliacion-bancaria" />
      </div>
      {error ? (
        <EstadoVacioAF4 titulo="Falta el libro de movimientos">Correr la migración 0901 en Supabase.</EstadoVacioAF4>
      ) : (
        <ImportarConciliacion cuentas={(data ?? []).filter((c) => c.clase !== "tarjeta").map((c) => ({ id: c.id as string, nombre: c.nombre as string }))} />
      )}
    </Pagina>
  );
}
