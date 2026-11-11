import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades } from "@/lib/finanzas/tiendas-permitidas";
import { leerTiendasShopify } from "@/lib/finanzas/shopify";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPipeline } from "@/lib/ventas/cargar-pipeline";
import { cargarOperacion } from "@/lib/ventas/cargar-operacion";
import { hoyPanama } from "@/lib/af4/fecha";
import { PanelPipeline } from "./panel-pipeline";

export const metadata = { title: "Pipeline de órdenes" };
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const usuario = await requireModulo("ventas-tiendas");
  const supabase = createServiceClient();
  const [permitidas, uni] = await Promise.all([
    cargarTiendasPermitidas(),
    supabase.from("fin_unidades").select("id, nombre, pais").eq("clase", "tienda").eq("activo", true),
  ]);
  const unidades = filtrarUnidades(permitidas, (uni.data ?? []) as { id: string; nombre: string; pais: string }[]);
  const datos = await cargarPipeline(supabase, unidades, {
    puedeConectar: permitidas === null && !usuario.modulosSoloLectura.includes("ventas-tiendas"),
    puedeLibro: usuario.modulos.includes("libro-movimientos") && !usuario.modulosSoloLectura.includes("libro-movimientos") && !usuario.modulosSoloLectura.includes("ventas-tiendas"),
    envTiendas: leerTiendasShopify(process.env.SHOPIFY_TIENDAS).map((t) => t.tienda),
  });
  const op = "error" in datos ? null : await cargarOperacion(supabase, datos.ordenes, datos.saldos, datos.mensajeros, unidades, hoyPanama());
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Pipeline de órdenes" imprimir={false} />
      {"error" in datos ? (
        <EstadoVacioAF4 titulo="No se pudo leer el pipeline">{datos.error}</EstadoVacioAF4>
      ) : op && "error" in op ? (
        <EstadoVacioAF4 titulo="No se pudo leer la operación">{op.error}</EstadoVacioAF4>
      ) : (
        <PanelPipeline datos={datos} op={op!} puedeEscribir={!usuario.modulosSoloLectura.includes("ventas-tiendas")} />
      )}
    </Pagina>
  );
}
