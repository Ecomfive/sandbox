import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarReglas } from "@/lib/publicaciones/reglas-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { FormularioReglas } from "./formulario-reglas";

export const metadata = { title: "Reglas · Gestión de IDs Dropi" };

export const dynamic = "force-dynamic";

/** Gestión de IDs Dropi › Reglas: los umbrales con que el sistema calcula las acciones y las recomendaciones. */
export default async function ReglasPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  const guardadas = await cargarReglas(createServiceClient());
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Reglas" oculto />
      <FormularioReglas reglas={guardadas.reglas} cambios={guardadas.cambios} disponible={guardadas.disponible} puedeEscribir={!usuario.modulosSoloLectura.includes("publicaciones-dropi")} />
    </Pagina>
  );
}
