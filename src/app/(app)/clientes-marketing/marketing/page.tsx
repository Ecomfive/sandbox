import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4, type PuntoAF4, type SerieAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, dinero2, dineroKpi, fraccion, veces } from "@/lib/af4/formato";
import type { IndiceColor } from "@/lib/af4/grafica";
import { requireModulo } from "@/lib/auth";
import { PLATAFORMAS, POAS_MINIMO, TODAS, div, gastoPorPlataforma, poasBajo, type Plataforma } from "@/lib/clientes/metricas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina, comparador, hrefClientes, indicadoresDe, type DatosPagina } from "../datos";
import { Selectores } from "../selectores";
import { TablaGasto, type FilaGasto } from "./tablas-marketing";

export const metadata = { title: "Marketing por tienda" };

export const dynamic = "force-dynamic";

/** El color de cada plataforma en la gráfica (paleta AF4; el morado queda para el ROAS). */
const COLOR_PLATAFORMA: Record<Plataforma, IndiceColor> = { meta: 1, tiktok: 4, google: 3, otros: 5, offline: 2 };

/** Gasto, ventas, margen y clientes nuevos de un ámbito en unos meses (solo los que el libro tiene). */
function filaGasto(datos: DatosPagina, ambito: string, meses: string[], id: string, etiqueta: string, orden: string): FilaGasto {
  const conLibro = meses.filter((m) => datos.mesesLibro.has(m));
  const gasto = gastoPorPlataforma(datos.marketing.filter((g) => conLibro.includes(g.periodo) && (ambito === TODAS || g.unidad_id === ambito)));
  const res = datos.resumen.filter((r) => r.ambito === ambito && conLibro.includes(r.periodo));
  return {
    id,
    etiqueta,
    orden,
    gasto,
    total: Object.values(gasto).reduce((a, b) => a + b, 0),
    ventas: res.reduce((a, r) => a + r.ventas, 0),
    margen: res.reduce((a, r) => a + r.margen, 0),
    nuevos: res.reduce((a, r) => a + r.nuevos, 0),
    sinLibro: !conLibro.length,
  };
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireModulo("clientes-marketing");
  const datos = await cargarDatosPagina(createServiceClient(), await searchParams);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Marketing" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan las tablas de clientes">Correr la migración 0920 (clientes y marketing) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const { periodo, tienda, ambito } = datos;
  const i = indicadoresDe(datos, ambito, periodo.meses);
  const { vs } = comparador(datos, ambito);
  const total = filaGasto(datos, ambito, periodo.meses, "total", "Total", "");
  const usadas: Plataforma[] = PLATAFORMAS.map((p) => p.clave).filter((p) =>
    datos.marketing.some((g) => g.plataforma === p && g.gasto !== 0 && (ambito === TODAS || g.unidad_id === ambito)),
  );
  const nombrePlataforma = (p: Plataforma) => PLATAFORMAS.find((x) => x.clave === p)!.etiqueta;

  // Filas: los meses de la tienda elegida, o cada unidad con órdenes o gasto en el período.
  let filas: FilaGasto[];
  if (tienda) {
    filas = periodo.meses.map((m) => filaGasto(datos, ambito, [m], m, mesCorto(m), m));
  } else {
    const ids = new Set([
      ...datos.tiendas.map((t) => t.id),
      ...datos.marketing.filter((g) => periodo.meses.includes(g.periodo) && g.gasto !== 0).map((g) => g.unidad_id),
    ]);
    filas = [...ids]
      .map((id) => filaGasto(datos, id, periodo.meses, id, datos.nombresUnidades[id] ?? "—", ""))
      .filter((f) => f.total !== 0 || f.ventas !== 0)
      .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta));
  }

  // Gráfica: los últimos 12 meses que el libro tiene; el gasto apilado por plataforma y los ROAS en el eje derecho.
  const mesesGrafica = [...datos.mesesLibro].sort().slice(-12);
  const enGrafica = PLATAFORMAS.map((p) => p.clave).filter((p) => usadas.includes(p));
  const puntos: PuntoAF4[] = mesesGrafica.map((m) => {
    const f = filaGasto(datos, ambito, [m], m, m, m);
    return { etiqueta: mesCorto(m), ...Object.fromEntries(enGrafica.map((p) => [p, f.gasto[p]])), roas: div(f.ventas, f.total), poas: div(f.margen, f.total) };
  });
  const series: SerieAF4[] = [
    ...enGrafica.map((p): SerieAF4 => ({ clave: p, nombre: nombrePlataforma(p), color: COLOR_PLATAFORMA[p], apilar: "gasto" })),
    { clave: "roas", nombre: "ROAS", color: 2, forma: "linea", derecha: true },
    { clave: "poas", nombre: "ROAS de margen", color: 2, forma: "linea", trazo: "rayas", derecha: true },
  ];
  const contexto = `${tienda?.nombre ?? "Todas las tiendas"} · USD`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Marketing"
        filtros={<Selectores datos={datos} ruta="/clientes-marketing/marketing" />}
        datosHasta={mesesGrafica.at(-1) ?? null}
        descarga={{ href: hrefClientes("/clientes-marketing/exportar", { periodo: periodo.clave, tienda: tienda?.id }) }}
      />

      {!datos.mesesLibro.size ? (
        <EstadoVacioAF4 titulo="El libro todavía no tiene meses con ingresos" accion={{ href: "/libro-movimientos", etiqueta: "Ir al libro de movimientos" }} />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Marketing"
              destacado
              valor={dineroKpi(i.gasto)}
              comparaciones={vs(i.gasto, (x) => x.gasto, "neutro")}
              subtexto={i.mesesSinLibro.length ? `Sin libro: ${i.mesesSinLibro.map(mesCorto).join(", ")}` : undefined}
            />
            <KpiAF4 titulo="CAC" valor={dinero2(i.cac)} comparaciones={vs(i.cac, (x) => x.cac, "menos-es-mejor")} />
            <KpiAF4 titulo="ROAS" valor={veces(i.roas)} comparaciones={vs(i.roas, (x) => x.roas)} />
            <KpiAF4
              titulo="ROAS de margen"
              tono={poasBajo(i.poas) ? "destructive" : "neutral"}
              valor={veces(i.poas)}
              comparaciones={vs(i.poas, (x) => x.poas)}
              subtexto={`Mínimo ${veces(POAS_MINIMO)}`}
            />
          </FilaKpiAF4>

          {usadas.length > 0 && (
            <KpiGroup titulo="Por plataforma">
              <KpiGrid compacta>
                {usadas.map((p) => (
                  <KpiCard key={p} compacta titulo={nombrePlataforma(p)} valor={dinero(total.gasto[p])} subtexto={`${fraccion(div(total.gasto[p], total.total))} del gasto`} />
                ))}
              </KpiGrid>
            </KpiGroup>
          )}

          <GraficaBarrasAF4
            id="grafica-marketing"
            titulo="Marketing por plataforma, ROAS y ROAS de margen"
            detalle={contexto}
            alto={280}
            datos={puntos}
            series={series}
            formatoDerecha="veces"
            referencias={[{ valor: 1, etiqueta: "ROAS", tipo: "limite", derecha: true }]}
          />

          <section aria-labelledby="titulo-gasto" className="flex flex-col gap-2">
            <h2 id="titulo-gasto" className="text-sm font-semibold">
              {tienda ? "Por mes" : "Por tienda"} <span className="font-normal text-muted-foreground">· {tienda?.nombre ?? periodo.etiqueta}</span>
            </h2>
            <TablaGasto filas={filas} porMes={!!tienda} plataformas={usadas} />
          </section>
        </>
      )}
    </Pagina>
  );
}
