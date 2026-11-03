import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPedidos, cargarTiendas, inicioPeriodo, periodoElegido, tiendaElegida } from "@/lib/tienda/datos";
import { PedidosTienda } from "./pedidos-tienda";

export const metadata = { title: "Pedidos de tienda" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Pedidos (3 nov 2026): los pedidos de Shopify de las tiendas del país (todas o una), del periodo elegido, con el tablero de
 * estados arriba, como la pantalla de pedidos de Mi Reto Digital. Llegan de Shopify al conectar cada tienda (solo lectura); hasta entonces está vacía.
 */
export default async function PedidosTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-pedidos");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const periodo = periodoElegido(sp.periodo);
  const miradas = tienda ? [tienda] : tiendas;
  const ids = miradas.map((t) => t.id);
  const [pedidos, sinVincular] = await Promise.all([
    cargarPedidos(supabase, ids, inicioPeriodo(periodo.dias)),
    ids.length
      ? supabase
          .from("tienda_variantes")
          .select("id", { count: "exact", head: true })
          .in("tienda_id", ids)
          .is("sku_maestro_id", null)
          .eq("no_fisico", false)
          .eq("en_shopify", true)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Pedidos de tienda" oculto>
        Los pedidos de Shopify de las tiendas de {pais.nombre}. Llegan al instante al conectar cada tienda.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <BarraTienda ruta="/tienda-pedidos" tiendas={tiendas} tiendaId={tienda?.id ?? null} periodo={periodo.id} />
          <AvisoConexion tiendas={miradas} />
          <PedidosTienda
            pedidos={pedidos}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            sinVincular={sinVincular}
            conectada={miradas.some((t) => t.estado === "conectada")}
          />
        </>
      )}
    </Pagina>
  );
}
