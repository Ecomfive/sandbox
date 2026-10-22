import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { AplicarDropi } from "./aplicar-dropi";

export const metadata = { title: "Aplicar en Dropi" };

export const dynamic = "force-dynamic";

/**
 * La ventana que abre el favorito «Aplicar en Dropi» desde la pestaña de Dropi: le pasa los cambios pendientes, el favorito los aplica
 * con la sesión de esa pestaña (que no sale de ahí) y esta ventana guarda lo que pasó con cada uno.
 */
export default async function AplicarDropiPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Aplicar en Dropi" oculto />
      <AplicarDropi puedeEscribir={!usuario.modulosSoloLectura.includes("publicaciones-dropi")} />
    </Pagina>
  );
}
