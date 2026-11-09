import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { dinero, dineroKpi, entero, fraccion, porcentaje } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarAgrupado } from "@/lib/finanzas/cargar-unidad-economica";
import { baseSimulador, derivados, filaVista, separarDestruyen, sumarFilasUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarContextoUE } from "../unidad/datos-ue";
import { PaginaUE, PaginaUEError, puedeEditarUE } from "../unidad/marco-ue";
import { SimuladorPrecio, type OpcionSimulador } from "../unidad/simulador-precio";
import { TablaDevolucionesUE, TablaProductosUE } from "../unidad/tablas-ue";

export const metadata = { title: "Rentabilidad por producto" };

export const dynamic = "force-dynamic";

const TITULO = "Rentabilidad por producto";
const RUTA = "/rentabilidad/productos";

export default async function ProductosUEPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  const ctx = await cargarContextoUE(supabase, await searchParams);
  if ("error" in ctx) return <PaginaUEError titulo={TITULO} error={ctx.error} />;
  const [productos, tiendas] = await Promise.all([cargarAgrupado(supabase, ctx.rango, "producto"), cargarAgrupado(supabase, ctx.rango, "tienda")]);
  if ("error" in productos) return <PaginaUEError titulo={TITULO} error={productos.error} />;
  if ("error" in tiendas) return <PaginaUEError titulo={TITULO} error={tiendas.error} />;

  // El total sale de las órdenes (por tienda), no de las líneas: una orden con dos productos cuenta una vez.
  const t = sumarFilasUE(tiendas);
  const dt = derivados(t);
  const s = ctx.supuestos;
  const filas = productos.map((p) => filaVista(p, s, dt.tasaEntrega)).sort((a, b) => b.ventas - a.ventas || a.etiqueta.localeCompare(b.etiqueta));
  const grupos = separarDestruyen(productos, s.margenObjetivoPct);
  const sinEntregas = grupos.sinEntregas.map((p) => filaVista(p, s, dt.tasaEntrega));
  const conEntregas = grupos.conEntregas.map((p) => filaVista(p, s, dt.tasaEntrega));
  const destruyen = [...conEntregas, ...sinEntregas];
  const conDevoluciones = filas.filter((f) => f.devueltas > 0).sort((a, b) => b.costoDevoluciones - a.costoDevoluciones);
  const perdida = destruyen.filter((f) => f.margen < 0).reduce((a, f) => a + f.margen, 0);
  const simulables: OpcionSimulador[] = filas
    .map((f) => ({ clave: f.clave, etiqueta: f.etiqueta, base: baseSimulador(f) }))
    .filter((o): o is OpcionSimulador => o.base !== null)
    .slice(0, 300);
  const detalle = `${ctx.contexto} · ${rangoPeriodo(ctx.datos.periodo)}`;

  return (
    <PaginaUE titulo={TITULO} ruta={RUTA} ctx={ctx} puedeEditar={puedeEditarUE(usuario)} envioSupuesto={t.envioSupuesto} ordenes={t.ordenes}>
      {!t.ordenes ? (
        <EstadoVacioAF4 titulo="Todavía no hay pedidos en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Margen real" destacado tono={t.margen < 0 ? "destructive" : "neutral"} valor={dineroKpi(t.margen)} subtexto={`${porcentaje(dt.margenPct)} de las ventas`} />
            <KpiAF4 titulo="Ventas entregadas" valor={dineroKpi(t.ventas)} subtexto={`${entero(t.entregadas)} pedidos entregados`} />
            <KpiAF4 titulo="Tasa de entrega" valor={fraccion(dt.tasaEntrega)} subtexto={`${entero(t.enviadas)} enviados`} />
            <KpiAF4 titulo="Costo de devoluciones" tono={dt.costoDevoluciones > 0 ? "warning" : "neutral"} valor={dineroKpi(dt.costoDevoluciones)} subtexto={`${dinero(dt.costoPorDevolucion, "USD", { decimales: 2 })} por devolución`} />
            <KpiAF4
              titulo="Productos que destruyen margen"
              tono={destruyen.length ? "destructive" : "success"}
              valor={entero(destruyen.length)}
              subtexto={perdida < 0 ? `Pierden ${dinero(-perdida)}` : `Bajo el ${porcentaje(s.margenObjetivoPct)} objetivo`}
            />
          </FilaKpiAF4>

          <section aria-labelledby="titulo-destruyen" className="flex flex-col gap-2">
            <h2 id="titulo-destruyen" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              Pierden con entregas
              <span className="text-xs font-normal text-muted-foreground">Se venden con margen negativo o bajo el {porcentaje(s.margenObjetivoPct)} objetivo</span>
            </h2>
            <TablaProductosUE filas={conEntregas} clave="rentabilidad-ue-destruyen" vacio={`Todos los productos entregados llegan al ${porcentaje(s.margenObjetivoPct)} de margen.`} />
          </section>

          {sinEntregas.length > 0 && (
            <section aria-labelledby="titulo-sin-entregas" className="flex flex-col gap-2">
              <h2 id="titulo-sin-entregas" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                Enviados sin entregas
                <span className="text-xs font-normal text-muted-foreground">Solo costo de envío y devolución, sin ventas</span>
              </h2>
              <TablaProductosUE filas={sinEntregas} clave="rentabilidad-ue-sin-entregas" />
            </section>
          )}

          <section aria-labelledby="titulo-productos" className="flex flex-col gap-2">
            <h2 id="titulo-productos" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              Margen real por producto
              <span className="text-xs font-normal text-muted-foreground">{detalle}</span>
            </h2>
            <TablaProductosUE filas={filas} />
          </section>

          {simulables.length > 0 && <SimuladorPrecio opciones={simulables} />}

          <section aria-labelledby="titulo-devoluciones" className="flex flex-col gap-2">
            <h2 id="titulo-devoluciones" className="text-sm font-semibold">
              Costo de las devoluciones
            </h2>
            <TablaDevolucionesUE filas={conDevoluciones} />
          </section>
        </>
      )}
    </PaginaUE>
  );
}
