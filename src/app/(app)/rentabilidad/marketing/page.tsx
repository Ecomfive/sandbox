import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { dinero, dineroKpi, entero, veces } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { cargarAgrupado, cargarMarketingUE } from "@/lib/finanzas/cargar-unidad-economica";
import { cacPor, objetivoDe, roasMargenCampana, sumarFilasUE, type FilaUE } from "@/lib/finanzas/unidad-economica";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarContextoUE } from "../unidad/datos-ue";
import { PaginaUE, PaginaUEError, puedeEditarUE } from "../unidad/marco-ue";
import { ImportarMeta, ReglasMeta } from "../unidad/marketing-meta";
import { TablaCacUE, TablaCampanasUE, type FilaCacUE, type FilaCampanaUE } from "../unidad/tablas-ue";

export const metadata = { title: "Marketing por campaña" };

export const dynamic = "force-dynamic";

const TITULO = "Marketing por campaña";
const RUTA = "/rentabilidad/marketing";

const ratio = (a: number, b: number) => (a > 0 && b > 0 ? a / b : null);

export default async function MarketingUEPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("rentabilidad");
  const puedeEditar = puedeEditarUE(usuario);
  const supabase = createServiceClient();
  const ctx = await cargarContextoUE(supabase, await searchParams);
  if ("error" in ctx) return <PaginaUEError titulo={TITULO} error={ctx.error} />;
  const [tiendas, productos, mktTodo] = await Promise.all([
    cargarAgrupado(supabase, ctx.rango, "tienda"),
    cargarAgrupado(supabase, ctx.rango, "producto"),
    cargarMarketingUE(supabase, ctx.rango),
  ]);
  // Tiendas limitadas (mejora 99): solo las campañas y reglas de sus tiendas (las campañas sin tienda tampoco).
  const suyas = ctx.datos.limitado ? new Set(ctx.datos.unidades.map((u) => u.id)) : null;
  const mkt =
    suyas && !("error" in mktTodo)
      ? {
          ...mktTodo,
          campanas: mktTodo.campanas.filter((c) => c.unidadId !== null && suyas.has(c.unidadId)),
          porTienda: mktTodo.porTienda.filter((t) => suyas.has(t.unidadId)),
          reglas: mktTodo.reglas.filter((r) => suyas.has(r.unidadId)),
        }
      : mktTodo;
  if ("error" in tiendas) return <PaginaUEError titulo={TITULO} error={tiendas.error} />;
  if ("error" in productos) return <PaginaUEError titulo={TITULO} error={productos.error} />;
  if ("error" in mkt) return <PaginaUEError titulo={TITULO} error={mkt.error} />;

  const nombre = ctx.datos.nombre;
  const porTienda = new Map(tiendas.map((f) => [f.clave, f]));
  const porProducto = new Map(productos.map((f) => [f.clave, f]));
  const nombreProducto = (clave: string | null) => (clave ? (porProducto.get(clave)?.etiqueta ?? clave) : "—");

  // CAC y ROAS de margen por tienda: el gasto de Meta es el de las campañas importadas o, sin ellas, el del libro.
  const mktTienda = new Map(mkt.porTienda.map((m) => [m.unidadId, m]));
  const idsTienda = [...new Set([...porTienda.keys(), ...mktTienda.keys()])];
  const filasCac: FilaCacUE[] = idsTienda
    .map((id) => {
      const f = porTienda.get(id);
      const m = mktTienda.get(id);
      const gastoMeta = m ? (m.gastoCampanas > 0 ? m.gastoCampanas : m.metaLibro) : 0;
      const gastoMarketing = Math.max(m?.marketingLibro ?? 0, m?.gastoCampanas ?? 0, f?.marketing ?? 0);
      const ordenes = f?.ordenes ?? 0;
      const entregadas = f?.entregadas ?? 0;
      return {
        id,
        etiqueta: nombre(id),
        gastoMeta,
        gastoMarketing,
        ordenes,
        entregadas,
        comprasMeta: m?.comprasCampanas ?? 0,
        cacOrden: cacPor(gastoMeta, ordenes),
        cacEntregada: cacPor(gastoMeta, entregadas),
        costoCompra: ratio(m?.gastoCampanas ?? 0, m?.comprasCampanas ?? 0),
        roasMargen: f && gastoMarketing > 0 ? (f.margen + f.marketing) / gastoMarketing : null,
      };
    })
    .filter((f) => f.gastoMeta > 0 || f.gastoMarketing > 0)
    .sort((a, b) => b.gastoMeta - a.gastoMeta);

  // Por producto: solo las campañas asignadas a un producto.
  const campProducto = new Map<string, { gasto: number; compras: number }>();
  for (const c of mkt.campanas) {
    if (!c.productoClave) continue;
    const x = campProducto.get(c.productoClave) ?? { gasto: 0, compras: 0 };
    x.gasto += c.gasto;
    x.compras += c.compras;
    campProducto.set(c.productoClave, x);
  }
  const filasCacProducto: FilaCacUE[] = [...campProducto]
    .map(([clave, c]) => {
      const f: FilaUE | undefined = porProducto.get(clave);
      return {
        id: clave,
        etiqueta: nombreProducto(clave),
        gastoMeta: c.gasto,
        gastoMarketing: f?.marketing ?? c.gasto,
        ordenes: f?.ordenes ?? 0,
        entregadas: f?.entregadas ?? 0,
        comprasMeta: c.compras,
        cacOrden: cacPor(c.gasto, f?.ordenes ?? 0),
        cacEntregada: cacPor(c.gasto, f?.entregadas ?? 0),
        costoCompra: ratio(c.gasto, c.compras),
        roasMargen: f && f.marketing > 0 ? (f.margen + f.marketing) / f.marketing : null,
      };
    })
    .sort((a, b) => b.gastoMeta - a.gastoMeta);

  const filasCampanas: FilaCampanaUE[] = mkt.campanas.map((c, i) => {
    const objetivo = objetivoDe((c.productoClave && porProducto.get(c.productoClave)) || (c.unidadId ? porTienda.get(c.unidadId) : undefined));
    return {
      id: `${i}|${c.campana}|${c.conjunto}|${c.unidadId ?? ""}|${c.productoClave ?? ""}`,
      campana: c.campana,
      conjunto: c.conjunto,
      tienda: c.unidadId ? nombre(c.unidadId) : "Sin asignar",
      producto: c.productoClave ? nombreProducto(c.productoClave) : "Toda la tienda",
      asignacion: c.asignacion,
      gasto: c.gasto,
      compras: c.compras,
      costoCompra: ratio(c.gasto, c.compras),
      roasMargen: roasMargenCampana(c.gasto, c.compras, objetivo),
      desde: c.desde,
      hasta: c.hasta,
    };
  });

  const gastoCampanas = mkt.campanas.reduce((a, c) => a + c.gasto, 0);
  const compras = mkt.campanas.reduce((a, c) => a + c.compras, 0);
  const sinAsignar = mkt.campanas.filter((c) => !c.unidadId);
  const margenAtribuido = filasCampanas.reduce((a, c) => a + (c.roasMargen ?? 0) * c.gasto, 0);
  const t = sumarFilasUE(tiendas);
  const gastoMetaTotal = filasCac.reduce((a, f) => a + f.gastoMeta, 0);
  const tiendasOpc = ctx.datos.unidades.map((u) => ({ valor: u.id, etiqueta: u.nombre }));
  const productosOpc = [...productos]
    .filter((p) => p.clave !== "(sin producto)")
    .sort((a, b) => b.ventas - a.ventas)
    .slice(0, 400)
    .map((p) => ({ valor: p.clave, etiqueta: p.etiqueta }));
  const detalle = `${ctx.contexto} · ${rangoPeriodo(ctx.datos.periodo)}`;

  return (
    <PaginaUE titulo={TITULO} ruta={RUTA} ctx={ctx} puedeEditar={puedeEditar} envioSupuesto={t.envioSupuesto} ordenes={t.ordenes} actualizado={mkt.ultimaImportacion}>
      <FilaKpiAF4>
        <KpiAF4 titulo="Gasto en Meta" valor={dineroKpi(gastoMetaTotal)} subtexto={gastoCampanas > 0 ? `${dinero(gastoCampanas)} en campañas importadas` : "Del libro"} />
        <KpiAF4 titulo="CAC por entregado" valor={dinero(cacPor(gastoMetaTotal, t.entregadas), "USD", { decimales: 2 })} subtexto={`${entero(t.entregadas)} entregados`} />
        <KpiAF4 titulo="Costo por compra (Meta)" valor={dinero(ratio(gastoCampanas, compras), "USD", { decimales: 2 })} subtexto={`${entero(compras)} compras reportadas`} />
        <KpiAF4
          titulo="ROAS de margen de las campañas"
          destacado
          tono={gastoCampanas > 0 && margenAtribuido / gastoCampanas < 1 ? "destructive" : "neutral"}
          valor={veces(ratio(margenAtribuido, gastoCampanas))}
        />
        <KpiAF4 titulo="Campañas sin tienda" tono={sinAsignar.length ? "warning" : "neutral"} valor={entero(sinAsignar.length)} subtexto={sinAsignar.length ? `${dinero(sinAsignar.reduce((a, c) => a + c.gasto, 0))} sin asignar` : undefined} />
      </FilaKpiAF4>

      <section aria-labelledby="titulo-cac-tienda" className="flex flex-col gap-2">
        <h2 id="titulo-cac-tienda" className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
          Costo de adquisición por tienda
          <span className="text-xs font-normal text-muted-foreground">{detalle}</span>
        </h2>
        <TablaCacUE filas={filasCac} por="tienda" />
      </section>

      <section aria-labelledby="titulo-campanas" className="flex flex-col gap-2">
        <h2 id="titulo-campanas" className="text-sm font-semibold">
          ROAS de margen por campaña
        </h2>
        <TablaCampanasUE filas={filasCampanas} />
      </section>

      <section aria-labelledby="titulo-cac-producto" className="flex flex-col gap-2">
        <h2 id="titulo-cac-producto" className="text-sm font-semibold">
          Costo de adquisición por producto
        </h2>
        <TablaCacUE filas={filasCacProducto} por="producto" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {puedeEditar && <ImportarMeta />}
        <ReglasMeta
          reglas={mkt.reglas.map((r) => ({ id: r.id, patron: r.patron, tienda: nombre(r.unidadId), producto: r.productoClave ? nombreProducto(r.productoClave) : null, prioridad: r.prioridad }))}
          tiendas={tiendasOpc}
          productos={productosOpc}
          puedeEditar={puedeEditar}
        />
      </div>
    </PaginaUE>
  );
}
