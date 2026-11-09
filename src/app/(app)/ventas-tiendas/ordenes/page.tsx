import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { Pagina } from "@/components/ui/pagina";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { conTiendaExplicita, TODAS_TIENDAS } from "@/lib/finanzas/tienda-elegida";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarOrdenes, LIMITE_ORDENES } from "@/lib/ventas/cargar";
import { ESTADOS_ENTREGA, type EstadoEntrega } from "@/lib/ventas/matriz";
import { ETIQUETA_ESTADO } from "@/lib/ventas/resumen";
import { cargarDatosPagina } from "../datos";
import { FiltrosVentas, conFiltros } from "../selector";
import { TablaOrdenes } from "./tabla-ordenes";

export const metadata = { title: "Órdenes" };

export const dynamic = "force-dynamic";

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireModulo("ventas-tiendas");
  const supabase = createServiceClient();
  // Sin `?tienda=` arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, await searchParams, "tienda");
  const params = selTienda.params;
  const datos = await cargarDatosPagina(supabase, params);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Órdenes" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la tabla de ventas">Correr la migración 0909 (ventas por tienda) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { mes, meses, tienda, opcionesTienda, unidades } = datos;
  const estado = ESTADOS_ENTREGA.includes(params.estado as EstadoEntrega) ? (params.estado as EstadoEntrega) : null;
  const cargadas = await cargarOrdenes(supabase, mes, unidades, { unidadId: tienda?.id ?? null, estado });
  const elegida = tienda?.id ?? TODAS_TIENDAS;
  const href = (c: { mes?: string; tienda?: string; estado?: string }) =>
    conTiendaExplicita(conFiltros("/ventas-tiendas/ordenes", { mes: c.mes ?? mes, estado: c.estado ?? estado }), "tienda", c.tienda ?? elegida);
  const opcionesEstado = [{ valor: "todas", etiqueta: "Todos los estados" }, ...ESTADOS_ENTREGA.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO[e] }))];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda {...selTienda.recordar} />
      <EncabezadoAF4
        titulo="Órdenes"
        imprimir={false}
        filtros={
          <FiltrosVentas
            meses={meses}
            mes={mes}
            tiendas={opcionesTienda}
            tienda={elegida}
            hrefMes={(m) => href({ mes: m })}
            hrefTienda={(id) => href({ tienda: id })}
            estados={opcionesEstado}
            estado={estado ?? "todas"}
            hrefEstado={(e) => href({ estado: e })}
          />
        }
        datosHasta={meses.at(-1) ?? null}
      />
      {"error" in cargadas ? (
        <EstadoVacioAF4 titulo="No se pudieron leer las órdenes">{cargadas.error}</EstadoVacioAF4>
      ) : (
        <>
          {cargadas.total > cargadas.filas.length && (
            <p role="status" className="flex items-center gap-2 self-start rounded-md border border-border bg-card px-3 py-2 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
              Mostrando {entero(cargadas.filas.length)} de {entero(cargadas.total)}: elige una tienda o un estado para ver el resto (máximo {entero(LIMITE_ORDENES)}).
            </p>
          )}
          <TablaOrdenes filas={cargadas.filas} />
        </>
      )}
    </Pagina>
  );
}
