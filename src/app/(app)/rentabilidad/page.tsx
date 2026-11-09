import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4, GraficaCascadaAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje } from "@/lib/af4/formato";
import { periodoAnterior, rangoPeriodo } from "@/lib/af4/periodo";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { TablaMetas } from "@/components/finanzas/metas-plan";
import { cargarMetasMes } from "@/lib/finanzas/cargar-planificacion";
import { valorEmpresa } from "@/lib/finanzas/eerr";
import { cascadas, economia, sobreVentas, sumarCascadas, type Cascada } from "@/lib/finanzas/rentabilidad";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { TablaTechoPauta } from "@/components/finanzas/techo-pauta";
import { hoyPanama } from "@/lib/af4/fecha";
import { cargarBasePauta } from "@/lib/finanzas/cargar-comite";
import { pautaPorTienda, sobreTecho } from "@/lib/finanzas/pauta";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina, hrefRentabilidad, TODAS } from "./datos";
import { ETIQUETA_FUENTE } from "./formato";
import { Selectores } from "./selectores";
import { TablaCascada, type FilaCascada } from "./tabla-cascada";
import { TablaEconomia, type FilaEconomia } from "./tabla-economia";

export const metadata = { title: "Rentabilidad por tienda" };

export const dynamic = "force-dynamic";

const tono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function RentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  // Sin `?tienda=` arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, await searchParams, "tienda");
  const [datos, valoracion, actualizado] = await Promise.all([
    cargarDatosPagina(supabase, selTienda.params),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
  ]);
  const multiplo = valoracion.supuestos.multiplo;

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Rentabilidad por tienda" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan el libro y la rentabilidad">Correr las migraciones 0901 (libro de movimientos) y 0915 (rentabilidad) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const { periodo, tienda, porTienda, porMes, nombre } = datos;
  const porMesDeTienda = !!tienda;
  const filas: FilaCascada[] = porMesDeTienda
    ? periodo.meses.filter((m) => porMes.has(m)).map((m) => ({ id: m, etiqueta: mesCorto(m), c: porMes.get(m)! }))
    : [...porTienda]
        .map(([id, c]) => ({ id, etiqueta: nombre(id), c }))
        .sort((a, b) => b.c.ventas.valor - a.c.ventas.valor || a.etiqueta.localeCompare(b.etiqueta));
  const t = sumarCascadas(filas.map((f) => f.c));
  if (porMesDeTienda) t.meses = filas.length;
  const e = economia(t);
  const ebitdaAnual = t.meses ? (t.ebitda / t.meses) * 12 : 0;
  const economiaFilas: FilaEconomia[] = filas.filter((f) => f.c.entregadas > 0).map((f) => ({ ...f, e: economia(f.c) }));
  const terceros = datos.deTerceros.map(nombre);
  const descarga = {
    href: hrefRentabilidad("/rentabilidad/exportar", { periodo: periodo.clave, tienda: tienda?.id, vista: datos.vistaQuery }),
    etiqueta: "Cascada en Excel",
    detalle: "Por tienda y por mes",
  };

  // El período anterior del mismo largo (si la ventana lo tiene), con las mismas tiendas, para las variaciones.
  const previos = periodoAnterior(periodo, datos.conDatos);
  const unidades = tienda ? [tienda.id] : [...porTienda.keys()];
  const previa: Cascada | null =
    previos.length === periodo.meses.length && previos.length > 0
      ? sumarCascadas([...cascadas(datos.ventas, datos.libro, previos, unidades).porTienda.values()])
      : null;
  const contra = previos.length === 1 ? mesCorto(previos[0]) : "período anterior";
  const vs = (actual: number, antes: number | undefined): ComparacionKpi[] =>
    previa && antes !== undefined ? [{ v: calcularVariacion(actual, antes), contra }] : [];
  const vsMargen = (actual: number | null, antes: number | null): ComparacionKpi[] =>
    previa && actual !== null && antes !== null ? [{ v: calcularVariacion(actual, antes), contra, modo: "puntos" }] : [];
  const serieMes = (f: (c: Cascada) => number) => {
    const meses = periodo.meses.filter((m) => porMes.has(m));
    return meses.length > 1 ? meses.map((m) => f(porMes.get(m)!)) : undefined;
  };
  // Techo de pauta (mejora 6): las tiendas propias que se ven en la página, en el período (el mes en curso, proyectado).
  const hoy = hoyPanama();
  const basePauta = periodo.meses.length ? await cargarBasePauta(supabase, periodo.meses[0], periodo.meses[periodo.meses.length - 1], hoy) : null;
  const visibles = new Set(unidades);
  const techo =
    basePauta && !("error" in basePauta)
      ? {
          filas: pautaPorTienda(basePauta.filas, periodo.meses, basePauta.propias.filter((id) => visibles.has(id)), basePauta.techo, hoy),
          nombres: Object.fromEntries(basePauta.unidades.map((u) => [u.id, u.nombre])),
        }
      : null;
  // Metas del plan anual aprobado (Planificación, mejora 16): el último mes cerrado del período, solo de las tiendas que se ven.
  const ultimoMes = periodo.meses[periodo.meses.length - 1];
  const mesMetas = ultimoMes && ultimoMes < `${hoy.slice(0, 7)}-01` ? ultimoMes : sumarMeses(`${hoy.slice(0, 7)}-01`, -1);
  const metas = unidades.length ? await cargarMetasMes(supabase, unidades.map((u) => u.toLowerCase()), mesMetas) : null;
  const contexto = [datos.vista.entidad?.razon_social, tienda?.nombre ?? "Todas las tiendas", "USD"].filter(Boolean).join(" · ");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda {...selTienda.recordar} />
      <EncabezadoAF4
        titulo="Rentabilidad por tienda"
        filtros={<Selectores datos={datos} ruta="/rentabilidad" />}
        datosHasta={datos.conDatos.filter((m) => m <= datos.mesEnCurso).at(-1) ?? null}
        actualizado={actualizado}
        descarga={filas.length ? { href: descarga.href } : null}
      />

      {!filas.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay movimientos ni órdenes en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Ventas"
              valor={dineroKpi(t.ventas.valor)}
              comparaciones={vs(t.ventas.valor, previa?.ventas.valor)}
              serie={serieMes((c) => c.ventas.valor)}
              subtexto={`De ${ETIQUETA_FUENTE[t.ventas.fuente]}`}
            />
            <KpiAF4
              titulo="Margen bruto"
              tono={tono(t.margenBruto)}
              valor={dineroKpi(t.margenBruto)}
              comparaciones={vsMargen(sobreVentas(t.margenBruto, t), previa ? sobreVentas(previa.margenBruto, previa) : null)}
              subtexto={`${porcentaje(sobreVentas(t.margenBruto, t))} de las ventas`}
            />
            <KpiAF4
              titulo="Margen de contribución"
              destacado
              tono={tono(t.contribucion)}
              valor={dineroKpi(t.contribucion)}
              comparaciones={vs(t.contribucion, previa?.contribucion)}
              serie={serieMes((c) => c.contribucion)}
              subtexto={`${porcentaje(sobreVentas(t.contribucion, t))} de las ventas`}
            />
            <KpiAF4
              titulo="EBITDA"
              tono={tono(t.ebitda)}
              valor={dineroKpi(t.ebitda)}
              comparaciones={vs(t.ebitda, previa?.ebitda)}
              subtexto={`Margen ${porcentaje(sobreVentas(t.ebitda, t))}`}
            />
            <KpiAF4
              titulo="Valor de empresa"
              valor={dineroKpi(valorEmpresa(ebitdaAnual, multiplo))}
              subtexto={`EBITDA anualizado × ${multiplo}`}
              href={hrefRentabilidad("/rentabilidad/palancas", { periodo: periodo.clave, tienda: tienda?.id ?? TODAS, vista: datos.vistaQuery })}
            />
            <KpiAF4
              titulo="Contribución por entregada"
              tono={e.contribucionPorEntregada !== null && e.contribucionPorEntregada < 0 ? "destructive" : "neutral"}
              valor={dinero(e.contribucionPorEntregada, "USD", { decimales: 2 })}
              subtexto={e.marketingPorEntregada === null ? undefined : `Marketing ${dinero(e.marketingPorEntregada, "USD", { decimales: 2 })} por entregada`}
            />
          </FilaKpiAF4>

          {((terceros.length > 0 && !tienda) || datos.sinVentas) && (
            <KpiGroup titulo="Pendientes de datos">
              <KpiGrid compacta>
                {terceros.length > 0 && !tienda && (
                  <KpiCard compacta tono="warning" titulo="Fuera de la cascada" valor={terceros.length} subtexto={`${terceros.join(", ")}: sin ingresos en el libro`} />
                )}
                {datos.sinVentas && <KpiCard compacta tono="warning" titulo="Sin Ventas por tienda" valor="Solo libro" subtexto="Falta la migración 0909" />}
              </KpiGrid>
            </KpiGroup>
          )}

          <div className="grid gap-6 2xl:grid-cols-2">
            <GraficaCascadaAF4
              id="grafica-cascada"
              titulo="De las ventas al EBITDA"
              detalle={`${contexto} · ${rangoPeriodo(periodo)}`}
              pasos={[
                { etiqueta: "Ventas", valor: t.ventas.valor, tipo: "inicio" },
                { etiqueta: "Mercancía", valor: -t.mercancia.valor, tipo: "delta" },
                { etiqueta: "Otros costos", valor: -t.otrosVariables, tipo: "delta" },
                { etiqueta: "Margen bruto", valor: t.margenBruto, tipo: "total" },
                { etiqueta: "Envío", valor: -t.envio.valor, tipo: "delta" },
                { etiqueta: "Marketing", valor: -t.marketing, tipo: "delta" },
                { etiqueta: "Contribución", valor: t.contribucion, tipo: "total" },
                { etiqueta: "Administración", valor: -t.administracion, tipo: "delta" },
                { etiqueta: "EBITDA", valor: t.ebitda, tipo: "total" },
              ]}
            />
            <GraficaBarrasAF4
              id="grafica-contribucion"
              titulo={porMesDeTienda ? "Contribución y EBITDA por mes" : "Contribución y EBITDA por tienda"}
              detalle={contexto}
              etiquetaEje={porMesDeTienda ? "Mes" : "Tienda"}
              alto={280}
              datos={filas.map((f) => ({ etiqueta: f.etiqueta, contribucion: f.c.contribucion, ebitda: f.c.ebitda }))}
              notas={Object.fromEntries(filas.map((f) => [f.etiqueta, `Contribución ${porcentaje(sobreVentas(f.c.contribucion, f.c))} de las ventas`]))}
              series={[
                { clave: "contribucion", nombre: "Margen de contribución", color: 1 },
                { clave: "ebitda", nombre: "EBITDA", color: 2 },
              ]}
            />
          </div>

          <section aria-labelledby="titulo-cascada" className="flex flex-col gap-2">
            <h2 id="titulo-cascada" className="text-sm font-semibold">
              Cascada de margen
            </h2>
            <TablaCascada filas={filas} porMes={porMesDeTienda} descarga={descarga} />
          </section>

          <section aria-labelledby="titulo-economia" className="flex flex-col gap-2">
            <h2 id="titulo-economia" className="text-sm font-semibold">
              Economía unitaria
            </h2>
            <TablaEconomia filas={economiaFilas} porMes={porMesDeTienda} />
          </section>

          {techo && techo.filas.length > 0 && (
            <TablaTechoPauta
              id="titulo-techo-pauta"
              titulo="Techo de pauta por tienda"
              detalle={`${rangoPeriodo(periodo)} · ${techo.filas.filter(sobreTecho).length} sobre el techo · USD`}
              filas={techo.filas}
              nombres={techo.nombres}
            />
          )}

          {metas && !("error" in metas) && !("sinPlan" in metas) && metas.delMes.length > 0 && (
            <TablaMetas
              id="titulo-metas-rentabilidad"
              titulo={`Metas del plan · ${mesCorto(mesMetas)}`}
              detalle="Real · meta"
              filas={metas.delMes}
              total={metas.totalMes}
              nombres={metas.nombres}
              accion={{ href: `/planificacion/metas?mes=${mesMetas.slice(0, 7)}`, etiqueta: "Ver metas" }}
            />
          )}
        </>
      )}
    </Pagina>
  );
}
