import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { conTiendaExplicita, TODAS_TIENDAS } from "@/lib/finanzas/tienda-elegida";
import { createServiceClient } from "@/lib/supabase/server";
import { agrupar, sumar, type Totales } from "@/lib/ventas/resumen";
import { cargarDatosPagina } from "./datos";
import { COBERTURA_MINIMA } from "./formato";
import { FiltrosVentas, conFiltros } from "./selector";
import { TablaTiendas, type FilaTienda } from "./tabla-tiendas";

export const metadata = { title: "Ventas por tienda" };

export const dynamic = "force-dynamic";

const TITULO = "Ventas por tienda";

export default async function VentasTiendasPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("ventas-tiendas");
  const supabase = createServiceClient();
  // Sin `?tienda=` arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, await searchParams, "tienda");
  const datos = await cargarDatosPagina(supabase, selTienda.params);

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la tabla de ventas">Correr la migración 0909 (ventas por tienda) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const { resumen, mes, tienda, meses, opcionesTienda } = datos;
  if (!resumen.length) {
    const puedeImportar = !usuario.modulosSoloLectura.includes("ventas-tiendas");
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4
          titulo="Todavía no hay órdenes"
          accion={puedeImportar ? { href: "/ventas-tiendas/importar", etiqueta: "Importar la Matriz" } : undefined}
        />
      </Pagina>
    );
  }

  const deTienda = tienda ? resumen.filter((r) => r.unidad_id === tienda.id) : resumen;
  const t = sumar(deTienda.filter((r) => r.periodo === mes));
  const porMes = agrupar(deTienda, (r) => r.periodo);
  const filasTienda: FilaTienda[] = [...agrupar(resumen.filter((r) => r.periodo === mes), (r) => r.unidad_id)].map(([id, x]) => ({
    id,
    tienda: datos.unidades.find((u) => u.id === id)?.nombre ?? "—",
    ...x,
  }));
  // La tienda va siempre explícita (también «todas»): sin ella la página arranca con la global.
  const elegida = tienda?.id ?? TODAS_TIENDAS;
  const href = (cambio: { mes?: string; tienda?: string }) =>
    conTiendaExplicita(conFiltros("/ventas-tiendas", { mes: cambio.mes ?? mes }), "tienda", cambio.tienda ?? elegida);
  const ordenes = (estado?: string) => conTiendaExplicita(conFiltros("/ventas-tiendas/ordenes", { mes, estado }), "tienda", elegida);

  // El mes anterior con órdenes (de la misma tienda), para las variaciones.
  const mesAnterior = [...porMes.keys()].filter((m) => m < mes).sort().at(-1);
  const previo: Totales | undefined = mesAnterior ? porMes.get(mesAnterior) : undefined;
  const contra = mesAnterior ? mesCorto(mesAnterior) : "";
  const vs = (actual: number, antes: number | undefined): ComparacionKpi[] =>
    previo && antes !== undefined ? [{ v: calcularVariacion(actual, antes), contra }] : [];
  const vsTasa = (actual: number | null, antes: number | null | undefined): ComparacionKpi[] =>
    previo && actual !== null && antes !== null && antes !== undefined ? [{ v: calcularVariacion(actual * 100, antes * 100), contra, modo: "puntos" }] : [];
  const serie = (f: (x: Totales) => number) => {
    const ordenados = [...porMes].sort(([a], [b]) => a.localeCompare(b)).filter(([m]) => m <= mes);
    return ordenados.length > 1 ? ordenados.map(([, x]) => f(x)) : undefined;
  };
  const costoIncompleto = t.cobertura_costo !== null && t.cobertura_costo < COBERTURA_MINIMA;
  const contexto = `${tienda?.nombre ?? "Todas las tiendas"} · USD`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda {...selTienda.recordar} />
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <FiltrosVentas
            meses={meses}
            mes={mes}
            tiendas={opcionesTienda}
            tienda={elegida}
            hrefMes={(m) => href({ mes: m })}
            hrefTienda={(id) => href({ tienda: id })}
          />
        }
        datosHasta={meses.at(-1) ?? null}
      />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Ventas entregadas"
          destacado
          valor={dineroKpi(t.ventas_entregadas)}
          comparaciones={vs(t.ventas_entregadas, previo?.ventas_entregadas)}
          serie={serie((x) => x.ventas_entregadas)}
          subtexto={`Ticket ${dinero(t.ticket_promedio, "USD", { decimales: 2 })}`}
        />
        <KpiAF4
          titulo="Margen bruto"
          tono={costoIncompleto ? "warning" : t.margen_bruto < 0 ? "destructive" : "neutral"}
          valor={dineroKpi(t.margen_bruto)}
          comparaciones={vs(t.margen_bruto, previo?.margen_bruto)}
          subtexto={`${fraccion(t.margen_pct)} de las ventas · costo en ${fraccion(t.cobertura_costo)} de las líneas`}
          href="/ventas-tiendas/cuadre"
        />
        <KpiAF4
          titulo="Tasa de entrega"
          valor={fraccion(t.tasa_entrega)}
          comparaciones={vsTasa(t.tasa_entrega, previo?.tasa_entrega)}
          subtexto={`${fraccion(t.tasa_sobre_ordenes)} sobre todas las órdenes`}
        />
        <KpiAF4
          titulo="Órdenes"
          valor={entero(t.ordenes)}
          comparaciones={vs(t.ordenes, previo?.ordenes)}
          subtexto={`${entero(t.canceladas + t.no_gestionadas)} canceladas o sin gestionar`}
          href={ordenes()}
        />
        <KpiAF4
          titulo="Entregadas"
          valor={entero(t.entregadas)}
          comparaciones={vs(t.entregadas, previo?.entregadas)}
          subtexto={`${entero(t.devueltas)} devueltas · ${entero(t.en_transito + t.pendientes)} sin cerrar`}
          href={ordenes("entregada")}
        />
      </FilaKpiAF4>

      <GraficaBarrasAF4
        id="grafica-ventas"
        titulo="Ventas entregadas y margen bruto por mes"
        detalle={contexto}
        datos={[...porMes]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([periodo, x]) => ({ etiqueta: mesCorto(periodo), ventas: x.ventas_entregadas, margen: x.margen_bruto }))}
        notas={Object.fromEntries([...porMes].map(([periodo, x]) => [mesCorto(periodo), `Tasa de entrega ${fraccion(x.tasa_entrega)}`]))}
        series={[
          { clave: "ventas", nombre: "Ventas entregadas", color: 1 },
          { clave: "margen", nombre: "Margen bruto", color: 2 },
        ]}
      />

      <section aria-labelledby="titulo-por-tienda" className="flex flex-col gap-2">
        <h2 id="titulo-por-tienda" className="text-sm font-semibold">
          Por tienda <span className="font-normal text-muted-foreground">· {mesCorto(mes)}</span>
        </h2>
        <TablaTiendas filas={filasTienda} mes={mes} />
      </section>
    </Pagina>
  );
}
