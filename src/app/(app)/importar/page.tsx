import Link from "next/link";
import { redirect } from "next/navigation";
import { BotonPlantilla } from "@/components/importar/boton-plantilla";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { getUsuarioActual } from "@/lib/auth";
import { mesesCerrados } from "@/lib/finanzas/guardar-libro";
import { modulosImportables } from "@/lib/importar/reconocer";
import { createServiceClient } from "@/lib/supabase/server";
import { ImportarUniversal } from "./importar-universal";

export const metadata = { title: "Importar" };

export const dynamic = "force-dynamic";

/**
 * «Importar» universal: no es un módulo; la abre quien puede modificar al menos un módulo con importador y solo ofrece
 * esos (cada acción del servidor vuelve a comprobar su módulo).
 */
export default async function ImportarPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  const modulos = modulosImportables(usuario.modulos, usuario.modulosSoloLectura);
  if (!modulos.length) redirect("/sin-acceso");
  const supabase = createServiceClient();
  const [cuentas, cerrados] = await Promise.all([
    modulos.includes("conciliacion-bancaria")
      ? supabase.from("fin_cuentas").select("id, nombre, clase").eq("activo", true).order("nombre")
      : Promise.resolve({ data: [] as { id: string; nombre: string; clase: string }[] }),
    mesesCerrados(supabase),
  ]);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar" oculto />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <BotonPlantilla />
        <Link href="/importar/historial" className={`inline-flex min-h-8 items-center rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
          Historial de importaciones
        </Link>
      </div>
      <ImportarUniversal
        modulos={usuario.modulos}
        soloLectura={usuario.modulosSoloLectura}
        cuentas={(cuentas.data ?? []).filter((c) => c.clase !== "tarjeta").map((c) => ({ id: String(c.id), nombre: String(c.nombre) }))}
        mesesCerrados={[...cerrados]}
      />
    </Pagina>
  );
}
