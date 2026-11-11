import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { dinero, entero, fraccion } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarAgrupado } from "@/lib/finanzas/cargar-unidad-economica";
import { derivados, filaVista, sumarFilasUE, type FilaVistaUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarContextoUE } from "../unidad/datos-ue";
import { PaginaUE, PaginaUEError, puedeEditarUE } from "../unidad/marco-ue";
import { TablaGrupoUE } from "../unidad/tablas-ue";

export const metadata = { title: "Zonas y repartidores" };

export const dynamic = "force-dynamic";

const TITULO = "Zonas y repartidores";
const RUTA = "/rentabilidad/zonas";
/** Para el peor y el mejor: una zona con pocos pedidos no dice nada. */
const MINIMO_PEDIDOS = 20;

const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export default async function ZonasUEPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  const ctx = await cargarContextoUE(supabase, await searchParams);
  if ("error" in ctx) return <PaginaUEError titulo={TITULO} error={ctx.error} />;
  const [zonas, repartidores] = await Promise.all([cargarAgrupado(supabase, ctx.rango, "zona"), cargarAgrupado(supabase, ctx.rango, "repartidor")]);
  if ("error" in zonas) return <PaginaUEError titulo={TITULO} error={zonas.error} />;
  if ("error" in repartidores) return <PaginaUEError titulo={TITULO} error={repartidores.error} />;

  const t = sumarFilasUE(zonas);
  const dt = derivados(t);
  const vista = (fs: typeof zonas, nombrar: boolean): FilaVistaUE[] =>
    fs.map((f) => filaVista(f, ctx.supuestos, dt.tasaEntrega, nombrar ? titulo(f.etiqueta) : undefined)).sort((a, b) => b.ordenes - a.ordenes);
  const filasZona = vista(zonas, true);
  const filasRep = vista(repartidores, false);
  const relevantes = filasZona.filter((f) => f.ordenes >= MINIMO_PEDIDOS && f.clave !== "SIN ZONA");
  const peor = [...relevantes].sort((a, b) => (a.margenPorOrden ?? 0) - (b.margenPorOrden ?? 0))[0];
  const potencial = filasZona.reduce((a, f) => a + Math.max(0, f.efectoTasa ?? 0), 0);
  const repPierden = filasRep.filter((f) => f.margen < 0).length;
  const top = filasZona.slice(0, 12);
  const detalle = `${ctx.contexto} · ${rangoPeriodo(ctx.datos.periodo)}`;

  return (
    <PaginaUE titulo={TITULO} ruta={RUTA} ctx={ctx} puedeEditar={puedeEditarUE(usuario)} envioSupuesto={t.envioSupuesto} ordenes={t.ordenes}>
      {!t.ordenes ? (
        <EstadoVacioAF4 titulo="Todavía no hay pedidos en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Tasa de entrega" valor={fraccion(dt.tasaEntrega)} subtexto={`${entero(t.entregadas)} de ${entero(t.enviadas)} enviados`} />
            <KpiAF4 titulo="Margen por pedido" valor={dinero(dt.margenPorOrden, "USD", { decimales: 2 })} subtexto={`${entero(filasZona.length)} zonas`} />
            <KpiAF4
              titulo="Zona con peor margen"
              tono={peor && (peor.margenPorOrden ?? 0) < 0 ? "destructive" : "neutral"}
              valor={peor ? peor.etiqueta : "—"}
              subtexto={peor ? `${dinero(peor.margenPorOrden, "USD", { decimales: 2 })} por pedido · ${fraccion(peor.tasaEntrega)} entregado` : undefined}
            />
            <KpiAF4 titulo="Si cada zona llegara a la tasa promedio" tono={potencial > 0 ? "success" : "neutral"} valor={dinero(potencial, "USD", { conSigno: true })} />
            <KpiAF4 titulo="Repartidores que pierden plata" tono={repPierden ? "destructive" : "success"} valor={entero(repPierden)} subtexto={`De ${entero(filasRep.length)}`} />
          </FilaKpiAF4>

          <GraficaBarrasAF4
            id="grafica-zonas"
            titulo="Margen por pedido y tasa de entrega"
            detalle={`Las ${entero(top.length)} zonas con más pedidos · ${detalle}`}
            etiquetaEje="Zona"
            formatoDerecha="porcentaje"
            datos={top.map((f) => ({ etiqueta: f.etiqueta, margen: f.margenPorOrden, tasa: f.tasaEntrega === null ? null : f.tasaEntrega * 100 }))}
            series={[
              { clave: "margen", nombre: "Margen por pedido", color: 1 },
              { clave: "tasa", nombre: "Tasa de entrega", color: 2, forma: "linea", derecha: true },
            ]}
          />

          <section aria-labelledby="titulo-zonas" className="flex flex-col gap-2">
            <h2 id="titulo-zonas" className="text-sm font-semibold">
              Margen por zona de entrega
            </h2>
            <TablaGrupoUE filas={filasZona} variante="zona" />
          </section>

          <section aria-labelledby="titulo-repartidores" className="flex flex-col gap-2">
            <h2 id="titulo-repartidores" className="text-sm font-semibold">
              Margen por repartidor o transportista
            </h2>
            <TablaGrupoUE filas={filasRep} variante="repartidor" />
          </section>
        </>
      )}
    </PaginaUE>
  );
}
