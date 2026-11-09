import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarAgrupado, cargarPedidos } from "@/lib/finanzas/cargar-unidad-economica";
import { derivados, filaVista, sumarFilasUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarContextoUE } from "../unidad/datos-ue";
import { PaginaUE, PaginaUEError, puedeEditarUE } from "../unidad/marco-ue";
import { TablaGrupoUE, TablaPedidosUE } from "../unidad/tablas-ue";

export const metadata = { title: "Rentabilidad por pedido" };

export const dynamic = "force-dynamic";

const TITULO = "Rentabilidad por pedido";
const RUTA = "/rentabilidad/pedidos";
const LIMITE = 500;

export default async function PedidosUEPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  const ctx = await cargarContextoUE(supabase, await searchParams);
  if ("error" in ctx) return <PaginaUEError titulo={TITULO} error={ctx.error} />;
  const [estados, tamanos, pedidos] = await Promise.all([
    cargarAgrupado(supabase, ctx.rango, "estado"),
    cargarAgrupado(supabase, ctx.rango, "tamano"),
    cargarPedidos(supabase, ctx.rango, LIMITE),
  ]);
  for (const r of [estados, tamanos, pedidos]) if ("error" in r) return <PaginaUEError titulo={TITULO} error={r.error} />;
  if ("error" in estados || "error" in tamanos || "error" in pedidos) return null;

  const t = sumarFilasUE(estados);
  const dt = derivados(t);
  const devueltas = estados.find((e) => e.clave === "devuelta");
  const entregadas = estados.find((e) => e.clave === "entregada");
  const nombre = ctx.datos.nombre;
  const filasPedidos = pedidos.map((p) => ({ ...p, tienda: nombre(p.unidadId) }));
  const filasTamano = tamanos.map((f) => filaVista(f, ctx.supuestos, dt.tasaEntrega)).sort((a, b) => a.clave.localeCompare(b.clave));
  const detalle = `${ctx.contexto} · ${rangoPeriodo(ctx.datos.periodo)}`;

  return (
    <PaginaUE titulo={TITULO} ruta={RUTA} ctx={ctx} puedeEditar={puedeEditarUE(usuario)} envioSupuesto={t.envioSupuesto} ordenes={t.ordenes}>
      {!t.ordenes ? (
        <EstadoVacioAF4 titulo="Todavía no hay pedidos en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Margen por pedido" destacado tono={t.margen < 0 ? "destructive" : "neutral"} valor={dinero(dt.margenPorOrden, "USD", { decimales: 2 })} subtexto={`${entero(t.ordenes)} pedidos`} />
            <KpiAF4 titulo="Pedidos que pierden plata" tono={t.pierden ? "destructive" : "success"} valor={entero(t.pierden)} subtexto={`${fraccion(t.ordenes ? t.pierden / t.ordenes : null)} de los pedidos`} />
            <KpiAF4 titulo="Lo que pierden" tono={t.perdida < 0 ? "destructive" : "neutral"} valor={dineroKpi(t.perdida)} />
            <KpiAF4 titulo="Devueltos" valor={entero(devueltas?.ordenes ?? 0)} subtexto={devueltas ? `Pierden ${dinero(-(devueltas.perdida))}` : undefined} />
            <KpiAF4 titulo="Entregados que pierden" tono={entregadas?.pierden ? "warning" : "neutral"} valor={entero(entregadas?.pierden ?? 0)} subtexto={entregadas ? `De ${entero(entregadas.ordenes)} entregados` : undefined} />
          </FilaKpiAF4>

          <section aria-labelledby="titulo-pierden" className="flex flex-col gap-2">
            <h2 id="titulo-pierden" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              Pedidos que pierden plata
              <span className="text-xs font-normal text-muted-foreground">
                {pedidos.length >= LIMITE ? `Los ${entero(LIMITE)} que más pierden · ` : ""}
                {detalle}
              </span>
            </h2>
            <TablaPedidosUE filas={filasPedidos} />
          </section>

          <section aria-labelledby="titulo-tamano" className="flex flex-col gap-2">
            <h2 id="titulo-tamano" className="text-sm font-semibold">
              Un producto o varios
            </h2>
            <TablaGrupoUE filas={filasTamano} variante="tamano" />
          </section>
        </>
      )}
    </PaginaUE>
  );
}
