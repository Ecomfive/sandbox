import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas, rutaCon } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendas, periodoElegido, tiendaElegida } from "@/lib/tienda/datos";
import { after } from "next/server";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { entregasDeOrdenes, guiasDeOrdenes } from "@/lib/tienda/entregas-monday";
import { etiquetaPostventa, postventaDePedidos } from "@/lib/tienda/postventa-tienda";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { PedidosTienda } from "./pedidos-tienda";
import { parametrosPeriodo } from "@/lib/tienda/rango";
import { alertasTiendas, juntarTiendas, resumirTienda } from "@/lib/tienda/tablero-tiendas";
import { TableroTiendas } from "./tablero-tiendas";

export const metadata = { title: "Pedidos de tienda" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Pedidos (3 nov 2026): los pedidos de Shopify de las tiendas del país (todas o una), del periodo elegido, con el tablero de
 * estados arriba, como la pantalla de pedidos de Mi Reto Digital. Llegan de Shopify al conectar cada tienda (solo lectura); hasta entonces está vacía.
 * Con «Todas las tiendas» (13 nov 2026, pedido de Hernán; prototipo aprobado) no sale la lista: sale el tablero que compara las tiendas (`TableroTiendas`).
 */
export default async function PedidosTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-pedidos");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const eleccion = periodoElegido(sp);
  const miradas = tienda ? [tienda] : tiendas;
  // La revisión de Shopify (por si se perdió algún aviso), después de mostrar la página y como mucho cada 10 minutos.
  // Solo la tienda que se mira (14 nov 2026: «si abro Kenku, que se actualice Kenku»); con «Todas», todas.
  after(() => revisarSiHaceFalta(createServiceClient(), miradas));
  const ids = miradas.map((t) => t.id);
  if (!tienda && tiendas.length && !faltaMigracion) return <TodasLasTiendas tiendas={tiendas} pais={pais} eleccion={eleccion} />;
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
          <BarraTienda ruta="/tienda-pedidos" tiendas={tiendas} tiendaId={tienda?.id ?? null} periodo={periodo} />
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

/**
 * «Todas las tiendas»: el tablero que compara las tiendas del país (13 nov 2026). Cada tienda se lee por su lado (su periodo y el anterior, de Shopify o de
 * Finanzas) y se resume con `resumirTienda`; una tienda nueva aparece sola, con su tarjeta y en las gráficas.
 */
async function TodasLasTiendas({
  tiendas,
  pais,
  eleccion,
}: {
  tiendas: Awaited<ReturnType<typeof cargarTiendas>>["tiendas"];
  pais: Awaited<ReturnType<typeof getPaisActual>>;
  eleccion: ReturnType<typeof periodoElegido>;
}) {
  const supabase = createServiceClient();
  const leidas = await Promise.all(
    tiendas.map(async (t) => {
      const [r, sinVincular] = await Promise.all([
        pedidosDeTiendas(supabase, [t], pais.codigo, eleccion, { comparar: true }),
        supabase
          .from("tienda_variantes")
          .select("id", { count: "exact", head: true })
          .eq("tienda_id", t.id)
          .is("sku_maestro_id", null)
          .eq("no_fisico", false)
          .eq("en_shopify", true)
          .then((x) => x.count ?? 0),
      ]);
      return { t, r, sinVincular };
    }),
  );
  const resumenes = leidas.map(({ t, r, sinVincular }, i) =>
    resumirTienda(
      { id: t.id, nombre: t.nombre, fuente: t.estado === "conectada" ? "En vivo · Shopify" : r.fuente.unidadDe.has(t.id) ? "Finanzas (Excel)" : "Sin conectar", sinVincular },
      i,
      r.pedidos,
      r.periodo.desde,
      r.periodo.hasta,
    ),
  );
  // El periodo de la barra: el de la primera tienda en vivo (o el de la primera).
  const principal = leidas.find((x) => x.t.estado === "conectada") ?? leidas[0];
  const periodo = principal.r.periodo;
  const deFechas = parametrosPeriodo(periodo.id === "rango" ? { tipo: "rango", desde: periodo.desde, hasta: periodo.hasta } : { tipo: "atajo", id: periodo.id });
  const hrefs = Object.fromEntries(tiendas.map((t) => [t.id, rutaCon("/tienda-pedidos", { ...deFechas, tienda: t.id })]));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Pedidos de tienda" oculto>
        Cómo van las tiendas de {pais.nombre}: elige una tienda para ver sus pedidos.
      </EncabezadoPagina>
      <BarraTienda ruta="/tienda-pedidos" tiendas={tiendas} tiendaId={null} periodo={periodo} />
      <TableroTiendas tiendas={resumenes} todas={juntarTiendas(resumenes)} alertas={alertasTiendas(resumenes)} hrefs={hrefs} moneda={pais.codigo} dias={periodo.dias} />
    </Pagina>
  );
}
