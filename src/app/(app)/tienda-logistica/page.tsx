import { after } from "next/server";
import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { cargarTiendas, tiendaElegida } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { etapaLogistica } from "@/lib/tienda/logistica";
import { diaPanama } from "@/lib/tienda/resumen";
import { LogisticaTienda } from "./logistica-tienda";

export const metadata = { title: "Logística de tienda" };

export const dynamic = "force-dynamic";

/** Hasta dónde se buscan pedidos por preparar y en ruta (todos los pendientes, como Mi Reto Digital). */
const DIAS_LOGISTICA = 60;

const ahoraMismo = () => Date.now();

/**
 * Gestión de tienda › Logística (12 nov 2026, como la pantalla de Mi Reto Digital, con lo que hay): los pedidos confirmados por preparar (listos hoy
 * o programados para después, por la fecha de la nota), los que van en ruta por zona y los demorados. Solo lectura. Shopify no trae la guía ni la
 * entrega de Kenku: lo despachado queda en ruta, con los días contados desde el pedido.
 */
export default async function LogisticaTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-logistica");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const miradas = tienda ? [tienda] : tiendas;
  after(() => revisarSiHaceFalta(createServiceClient(), tiendas));
  const { pedidos, fuente } = await pedidosDeTiendas(supabase, miradas, pais.codigo, DIAS_LOGISTICA);
  // Lo que se gestiona: los que llegaron de Shopify (los del Excel de Finanzas son una foto vieja), por preparar o en ruta, lo más viejo arriba.
  const activos = pedidos
    .filter((p) => !p.sinHora && (etapaLogistica(p.estado) === "por_preparar" || etapaLogistica(p.estado) === "en_ruta"))
    .sort((a, b) => a.creado.localeCompare(b.creado));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Logística" oculto>
        Los pedidos de las tiendas de {pais.nombre} por preparar y en ruta.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <BarraTienda ruta="/tienda-logistica" tiendas={tiendas} tiendaId={tienda?.id ?? null} />
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <LogisticaTienda
            pedidos={activos}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            hoy={diaPanama(new Date(ahoraMismo()).toISOString())}
          />
        </>
      )}
    </Pagina>
  );
}
