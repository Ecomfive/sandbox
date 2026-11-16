import { FormularioSolicitud } from "@/components/despacho/formulario-solicitud";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModuloEscritura } from "@/lib/auth";
import { cargarPersonas, hoyPanama } from "@/lib/postventa/datos";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Nueva solicitud" };

export const dynamic = "force-dynamic";

/** Cambios y reembolsos › Nueva solicitud: el formulario que reemplaza el texto libre del primer comentario de Monday. */
export default async function NuevaSolicitudPage() {
  const usuario = await requireModuloEscritura("despacho-cambios");
  const personas = await cargarPersonas(createServiceClient());
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Nueva solicitud de cambio o reembolso">
        Elige la tienda y el pedido, marca qué hay que hacer y listo: queda en el tablero con el formato de siempre.
      </EncabezadoPagina>
      <FormularioSolicitud personas={personas} hoy={hoyPanama()} puedeCuentas={usuario.modulos.includes("despacho-cambios-cuentas")} usuarioId={usuario.id} />
    </Pagina>
  );
}
