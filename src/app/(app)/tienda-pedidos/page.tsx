import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas, rutaCon } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePanel } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { periodoElegido } from "@/lib/tienda/datos";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { after } from "next/server";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { entregasDeOrdenes, guiasDeOrdenes } from "@/lib/tienda/entregas-monday";
import { etiquetaPostventa, postventaDePedidos } from "@/lib/tienda/postventa-tienda";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { PedidosTienda } from "./pedidos-tienda";

export const metadata = { title: "Pedidos de tienda" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Pedidos (3 nov 2026): los pedidos de Shopify de las tiendas del país (todas o una), del periodo elegido, con el tablero de
 * estados arriba, como la pantalla de pedidos de Mi Reto Digital. Llegan de Shopify al conectar cada tienda (solo lectura); hasta entonces está vacía.
 * Desde el 20 nov 2026 (pedido de Hernán) no hay «Todas las tiendas»: ese tablero pasó a Desempeño › Tablero de tiendas (`/tienda-tablero`, Admin y CEO) y aquí
 * se abre la primera tienda. Al lado de las tiendas, «Asesores» (`/tienda-pedidos/asesores`) para quien tiene ese permiso (la encargada de atención).
 */
export default async function PedidosTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requirePanel("/tienda-pedidos", "tienda-pedidos");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  // Solo las tiendas de la persona (17 nov 2026: quien tiene tiendas limitadas, como la gente de Nuvo, ve solo las suyas y nunca «Todas»).
  const { tiendas, tienda: elegida, faltaMigracion } = await tiendasDeLaPersona(supabase, pais.id, sp.tienda);
  // Sin tienda elegida, la primera (20 nov 2026: el tablero de todas pasó a Desempeño).
  const tienda = elegida ?? tiendas[0] ?? null;
  const eleccion = periodoElegido(sp);
  const miradas = tienda ? [tienda] : tiendas;
  // La revisión de Shopify (por si se perdió algún aviso), después de mostrar la página y como mucho cada 10 minutos.
  // Solo la tienda que se mira (14 nov 2026: «si abro Kenku, que se actualice Kenku»); con «Todas», todas.
  after(() => revisarSiHaceFalta(createServiceClient(), miradas));
  const ids = miradas.map((t) => t.id);
  // Las tiendas sin conectar muestran las órdenes que cargó Finanzas (11 nov 2026; ver src/lib/tienda/ordenes-finanzas.ts).
  const [{ pedidos, fuente, periodo }, sinVincular] = await Promise.all([
    pedidosDeTiendas(supabase, miradas, pais.codigo, eleccion),
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
  // Lo que dice Monday (ciudad) o SISCORE (interior) de los que van en camino (13 nov 2026): el pedido sale «En camino · POSPUESTO», etc.
  const enCamino = pedidos.filter((p) => p.estado === "en_camino").map((p) => p.id);
  if (enCamino.length) {
    const [entregas, guias] = await Promise.all([entregasDeOrdenes(supabase, enCamino), guiasDeOrdenes(supabase, enCamino)]);
    for (const p of pedidos) if (p.estado === "en_camino") p.entrega = guias.get(p.id) ?? entregas.get(p.id) ?? null;
  }
  // Los cambios, reembolsos, retiros y complementos de Monday (14 nov 2026): la etiqueta del caso más reciente de cada pedido.
  const casos = await postventaDePedidos(supabase, pedidos.map((p) => p.id));
  for (const p of pedidos) p.postventa = etiquetaPostventa(casos.get(p.id));
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
          <BarraTienda
            ruta="/tienda-pedidos"
            tiendas={tiendas}
            tiendaId={tienda?.id ?? null}
            periodo={periodo}
            sinTodas
            enlaces={usuario.modulos.includes("tienda-asesores") ? [{ texto: "Asesores", href: rutaCon("/tienda-pedidos/asesores", { periodo: texto(sp.periodo), desde: texto(sp.desde), hasta: texto(sp.hasta) }), activo: false }] : []}
          />
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <PedidosTienda
            pedidos={pedidos}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            sinVincular={sinVincular}
            conectada={miradas.some((t) => t.estado === "conectada" || fuente.unidadDe.has(t.id))}
            abrirInicial={typeof sp.pedido === "string" && /^[0-9a-f-]{36}$/i.test(sp.pedido) ? sp.pedido : null}
          />
        </>
      )}
    </Pagina>
  );
}

/** Un parámetro de la dirección como texto (o null). */
const texto = (x: string | string[] | undefined) => (typeof x === "string" && x ? x : null);
