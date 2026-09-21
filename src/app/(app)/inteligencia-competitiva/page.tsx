import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { TablaProveedores } from "./tabla-proveedores";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { InteligenciaChart } from "@/components/charts/inteligencia-chart";
import { agruparProductosTotalesPorMes, agruparProveedoresNuevosPorMes, soloAnio } from "@/lib/inteligencia/agregados";

export const metadata = { title: "Inteligencia competitiva" };

export const dynamic = "force-dynamic";

export default async function InteligenciaCompetitivaPage() {
  await requireModulo("inteligencia-competitiva");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: proveedores } = await supabase
    .from("proveedores_competencia")
    .select("id, nombre, tienda, ciudad, categorias, primera_vez_visto")
    .eq("pais_id", pais.id);

  const idsProveedores = (proveedores ?? []).map((p) => p.id);
  const { data: snapshots } = await supabase
    .from("snapshots_proveedor_competencia")
    .select("proveedor_id, fecha, productos_count")
    .in("proveedor_id", idsProveedores.length > 0 ? idsProveedores : ["00000000-0000-0000-0000-000000000000"])
    .order("fecha", { ascending: false });

  const snapshotsPorProveedor = new Map<string, { fecha: string; productos_count: number }[]>();
  for (const s of snapshots ?? []) {
    if (!snapshotsPorProveedor.has(s.proveedor_id)) snapshotsPorProveedor.set(s.proveedor_id, []);
    snapshotsPorProveedor.get(s.proveedor_id)!.push(s);
  }

  const filas = (proveedores ?? []).map((p) => {
    const historial = snapshotsPorProveedor.get(p.id) ?? [];
    const actual = historial[0]?.productos_count ?? null;
    const anterior = historial[1]?.productos_count ?? null;
    const cambio = actual !== null && anterior !== null ? actual - anterior : null;
    return { ...p, actual, cambio, ultimaFecha: historial[0]?.fecha ?? null };
  });

  filas.sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0));

  const totalProveedores = filas.length;
  const totalProductos = filas.reduce((acc, f) => acc + (f.actual ?? 0), 0);

  const anioActual = String(new Date().getFullYear());
  const proveedoresNuevosPorMes = agruparProveedoresNuevosPorMes(proveedores ?? []);
  const productosTotalesPorMes = agruparProductosTotalesPorMes(snapshots ?? []);
  const proveedoresNuevosAnio = soloAnio(proveedoresNuevosPorMes, anioActual);
  const productosTotalesAnio = soloAnio(productosTotalesPorMes, anioActual);
  const hayHistorialMensual = productosTotalesPorMes.length > 1;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Inteligencia competitiva" oculto>
        {pais.nombre} — proveedores competidores vistos desde la cuenta dropshipper de Dropi. El
        crecimiento se calcula comparando la última carga contra la anterior.
      </EncabezadoPagina>

      {totalProveedores === 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Todavía no hay proveedores rastreados para {pais.nombre}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este rastreo se hace con la cuenta <strong>dropshipper</strong> de Dropi de{" "}
            {pais.nombre}, no con un archivo. Corre estos tres comandos, en orden, desde tu máquina:
          </p>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <p className="text-xs text-muted-foreground">
                1. Inicia sesión (se abre una ventana para que la hagas tú mismo):
              </p>
              <code className="mt-0.5 block rounded bg-muted px-2 py-1 text-xs">
                npx tsx scripts/dropi-guardar-sesion.ts {pais.codigo.toLowerCase()} dropshipper
              </code>
            </li>
            <li>
              <p className="text-xs text-muted-foreground">2. Rastrea el directorio de proveedores:</p>
              <code className="mt-0.5 block rounded bg-muted px-2 py-1 text-xs">
                npx tsx scripts/dropi-extraer-proveedores.ts {pais.codigo.toLowerCase()}
              </code>
            </li>
            <li>
              <p className="text-xs text-muted-foreground">3. Guarda lo rastreado en esta página:</p>
              <code className="mt-0.5 block rounded bg-muted px-2 py-1 text-xs">
                npx tsx scripts/dropi-ingerir-proveedores.ts {pais.codigo.toLowerCase()}
              </code>
            </li>
          </ol>
        </div>
      ) : (
        <>
          <KpiGroup titulo="Resumen">
            <KpiGrid>
              <KpiCard titulo="Proveedores rastreados" valor={totalProveedores} />
              <KpiCard titulo="Total de productos en la plataforma" valor={totalProductos} />
            </KpiGrid>
          </KpiGroup>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">Total de productos — {anioActual}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Acumulado al cierre de cada mes, entre los proveedores rastreados.
              </p>
              {productosTotalesAnio.length > 0 ? (
                <div className="mt-2">
                  <InteligenciaChart datos={productosTotalesAnio} nombreSerie="Productos" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Sin historial para {anioActual} todavía.</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">Proveedores nuevos por mes — {anioActual}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Cuándo detectamos por primera vez a cada proveedor en nuestro rastreo.
              </p>
              {proveedoresNuevosAnio.length > 0 ? (
                <div className="mt-2">
                  <InteligenciaChart datos={proveedoresNuevosAnio} nombreSerie="Proveedores nuevos" />
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Sin historial para {anioActual} todavía.</p>
              )}
            </div>
          </div>

          {!hayHistorialMensual && (
            <p className="text-xs text-muted-foreground">
              El histórico mensual completo se irá llenando a medida que se repita el rastreo mes a
              mes (por ahora solo hay una carga registrada).
            </p>
          )}

          <TablaProveedores
            proveedores={filas.map((f) => ({
              id: f.id,
              titulo: f.tienda || f.nombre,
              subtitulo: f.tienda ? f.nombre : null,
              ciudad: f.ciudad,
              categorias: f.categorias,
              actual: f.actual,
              cambio: f.cambio,
            }))}
          />
        </>
      )}
    </Pagina>
  );
}
