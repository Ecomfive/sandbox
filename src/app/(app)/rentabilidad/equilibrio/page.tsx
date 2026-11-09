import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarAgrupado } from "@/lib/finanzas/cargar-unidad-economica";
import { equilibrioTienda, sumarFilasUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarContextoUE } from "../unidad/datos-ue";
import { PaginaUE, PaginaUEError, puedeEditarUE } from "../unidad/marco-ue";
import { TablaEquilibrioUE, type FilaEquilibrioUE } from "../unidad/tablas-ue";

export const metadata = { title: "Punto de equilibrio" };

export const dynamic = "force-dynamic";

const TITULO = "Punto de equilibrio";
const RUTA = "/rentabilidad/equilibrio";

export default async function EquilibrioUEPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  const ctx = await cargarContextoUE(supabase, await searchParams);
  if ("error" in ctx) return <PaginaUEError titulo={TITULO} error={ctx.error} />;
  const tiendas = await cargarAgrupado(supabase, ctx.rango, "tienda");
  if ("error" in tiendas) return <PaginaUEError titulo={TITULO} error={tiendas.error} />;

  const { porTienda, nombre } = ctx.datos;
  const filas: FilaEquilibrioUE[] = tiendas
    .map((f) => {
      const c = porTienda.get(f.clave);
      const administracionMes = c && c.meses ? c.administracion / c.meses : 0;
      return {
        ...equilibrioTienda(f, administracionMes, ctx.supuestos),
        id: f.clave,
        tienda: nombre(f.clave),
        margenPct: f.ventas ? (100 * f.margen) / f.ventas : null,
      };
    })
    .sort((a, b) => b.contribucionMes - a.contribucionMes);
  const t = sumarFilasUE(tiendas);
  const despues = filas.reduce((a, f) => a + f.despuesDeFijos, 0);
  const cuenta = (acc: FilaEquilibrioUE["accion"]) => filas.filter((f) => f.accion === acc).length;

  return (
    <PaginaUE titulo={TITULO} ruta={RUTA} ctx={ctx} puedeEditar={puedeEditarUE(usuario)} envioSupuesto={t.envioSupuesto} ordenes={t.ordenes}>
      {!filas.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay pedidos en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Contribución por mes" valor={dineroKpi(filas.reduce((a, f) => a + f.contribucionMes, 0))} subtexto="Margen real, antes de fijos" />
            <KpiAF4 titulo="Fijos por mes" valor={dineroKpi(filas.reduce((a, f) => a + f.fijosMes, 0))} />
            <KpiAF4 titulo="Después de fijos" destacado tono={despues < 0 ? "destructive" : "success"} valor={dineroKpi(despues)} subtexto="Por mes" />
            <KpiAF4 titulo="Para escalar" tono={cuenta("escalar") ? "success" : "neutral"} valor={entero(cuenta("escalar"))} subtexto={`${entero(cuenta("mantener"))} mantener`} />
            <KpiAF4 titulo="Para cerrar" tono={cuenta("cerrar") ? "destructive" : "neutral"} valor={entero(cuenta("cerrar"))} />
          </FilaKpiAF4>

          <GraficaBarrasAF4
            id="grafica-equilibrio"
            titulo="Pedidos por mes y pedidos para el equilibrio"
            detalle={`${ctx.contexto} · ${rangoPeriodo(ctx.datos.periodo)}`}
            etiquetaEje="Tienda"
            formato="entero"
            datos={filas.map((f) => ({ etiqueta: f.tienda, actual: Math.round(f.ordenesMes), equilibrio: f.ordenesEquilibrio === null ? null : Math.ceil(f.ordenesEquilibrio) }))}
            series={[
              { clave: "actual", nombre: "Pedidos por mes", color: 1 },
              { clave: "equilibrio", nombre: "Para el equilibrio", color: 2 },
            ]}
          />

          <section aria-labelledby="titulo-equilibrio" className="flex flex-col gap-2">
            <h2 id="titulo-equilibrio" className="text-sm font-semibold">
              Contribución después de fijos
            </h2>
            <TablaEquilibrioUE filas={filas} />
          </section>
        </>
      )}
    </PaginaUE>
  );
}
