import { AplicarPrecios } from "@/components/publicaciones/aplicar-precios";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Aplicar precios en Dunamixfy" };

export const dynamic = "force-dynamic";

/**
 * La ventana que abre el favorito «Aplicar precios» desde la pestaña de Dunamixfy: le pasa los cambios de precio pendientes, el favorito los aplica con la sesión
 * de esa pestaña (que no sale de ahí) y esta ventana guarda lo que pasó con cada uno.
 */
export default async function AplicarPreciosDunamixfyPage() {
  const usuario = await requireModulo("publicaciones-dunamixfy");
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Aplicar precios en Dunamixfy" oculto />
      <AplicarPrecios plataforma="dunamixfy" puedeEscribir={!usuario.modulosSoloLectura.includes("publicaciones-dunamixfy")} />
    </Pagina>
  );
}
