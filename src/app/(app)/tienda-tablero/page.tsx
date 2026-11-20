import { BarraTienda, FaltaMigracionTienda, SinTiendas, rutaCon } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { periodoElegido } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { parametrosPeriodo } from "@/lib/tienda/rango";
import { juntarTiendas, resumirTienda } from "@/lib/tienda/tablero-tiendas";
import { TableroTiendas } from "../tienda-pedidos/tablero-tiendas";

export const metadata = { title: "Tablero de tiendas" };

export const dynamic = "force-dynamic";

/**
 * Desempeño › Tablero de tiendas (20 nov 2026, pedido de Hernán): el tablero que compara las tiendas del país, que antes era «Todas las tiendas» en Pedidos de
 * tienda (13 nov 2026; prototipo aprobado). Pasó a Desempeño para Admin y CEO (módulo «tienda-tablero»): la gente de atención entra a Pedidos de tienda y ve
 * sus tiendas, no este tablero. Cada tienda se lee por su lado (su periodo y el anterior, de Shopify o de Finanzas) y se resume con `resumirTienda`; una tienda
 * nueva aparece sola, con su tarjeta y en las gráficas. Cada tarjeta lleva a los pedidos de esa tienda.
 */
export default async function TableroTiendasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-tablero");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await tiendasDeLaPersona(supabase, pais.id, undefined);
  const eleccion = periodoElegido(sp);
  if (faltaMigracion || !tiendas.length)
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Tablero de tiendas" oculto>
          Cómo van las tiendas de {pais.nombre}.
        </EncabezadoPagina>
        {faltaMigracion ? <FaltaMigracionTienda /> : <SinTiendas pais={pais.nombre} />}
      </Pagina>
    );
  const leidas = await Promise.all(
    tiendas.map(async (t) => {
      const [r, sinVincular] = await Promise.all([
        // Liviano (18 nov 2026): el tablero no muestra la foto ni el historial de cada cliente.
        pedidosDeTiendas(supabase, [t], pais.codigo, eleccion, { comparar: true, liviano: true }),
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
  // Cada tarjeta lleva a los pedidos de esa tienda, con el mismo periodo.
  const hrefs = Object.fromEntries(tiendas.map((t) => [t.id, rutaCon("/tienda-pedidos", { ...deFechas, tienda: t.id })]));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Tablero de tiendas" oculto>
        Cómo van las tiendas de {pais.nombre}: pulsa una tienda para ver su detalle.
      </EncabezadoPagina>
      <BarraTienda ruta="/tienda-tablero" tiendas={[]} tiendaId={null} periodo={periodo} sinTodas />
      <TableroTiendas tiendas={resumenes} todas={juntarTiendas(resumenes)} hrefs={hrefs} moneda={pais.codigo} dias={periodo.dias} />
    </Pagina>
  );
}
