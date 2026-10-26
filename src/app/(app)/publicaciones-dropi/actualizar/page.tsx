import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { puedeActualizarDropi } from "@/lib/dropi-actualizar/partes";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPanel } from "./datos";
import { PanelActualizarDropi } from "./panel-actualizar";

export const metadata = { title: "Actualizar Dropi" };

export const dynamic = "force-dynamic";
// Procesar los pedidos o las ventas de Dropi (acciones de esta página) puede tardar unos minutos.
export const maxDuration = 300;

/**
 * Gestión de IDs Dropi › «Actualizar Dropi» (pedido de Hernán, 26 oct 2026; migración 0154): con la extensión de Chrome
 * «Ecomfive · Dropi», trae de Dropi pedidos, cartera, retiros, stock y ventas. Por ahora solo para Hernán.
 */
export default async function ActualizarDropiPage() {
  const usuario = await requireModulo("publicaciones-dropi");
  if (!puedeActualizarDropi(usuario) || usuario.modulosSoloLectura.includes("publicaciones-dropi")) notFound();
  const panel = await cargarPanel(createServiceClient());
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Actualizar Dropi" oculto />
      <PanelActualizarDropi {...panel} />
    </Pagina>
  );
}
