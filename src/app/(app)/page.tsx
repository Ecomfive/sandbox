import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { getSerieInventarioComparada, getSerieVentasComparada, getSerieFinanzas } from "@/lib/dashboard/queries";
import { resolverPeriodo, calcularDelta } from "@/lib/dashboard/periodo";
import { InventarioChart } from "@/components/charts/inventario-chart";
import { FinanzasChart } from "@/components/charts/finanzas-chart";
import { VentasChart } from "@/components/charts/ventas-chart";
import { PeriodPicker } from "@/components/period-picker";
import { DashboardSecciones, type SeccionDashboard } from "@/components/dashboard-secciones";
import { Badge } from "@/components/ui/badge";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

function BadgeDelta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <p className="mt-1 text-xs text-muted-foreground">Sin histórico para comparar</p>;
  }
  return (
    <Badge tone={delta >= 0 ? "success" : "destructive"}>
      {delta >= 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </Badge>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("dashboard");
  const sp = await searchParams;
  const periodo = resolverPeriodo({
    preset: typeof sp.preset === "string" ? sp.preset : undefined,
    desde: typeof sp.desde === "string" ? sp.desde : undefined,
    hasta: typeof sp.hasta === "string" ? sp.hasta : undefined,
    comparar: typeof sp.comparar === "string" ? sp.comparar : undefined,
  });

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [inventario, ventas, serieFinanzas, { data: dropshippers }, { data: proveedoresComp }] = await Promise.all([
    getSerieInventarioComparada(supabase, pais.id, periodo),
    getSerieVentasComparada(supabase, pais.id, periodo),
    getSerieFinanzas(supabase, pais.id),
    supabase.from("dropshippers").select("estado").eq("pais_id", pais.id),
    supabase.from("proveedores_competencia").select("id").eq("pais_id", pais.id),
  ]);

  const hayInventario = inventario.serie.some((p) => p.entradas > 0 || p.salidas > 0);
  const hayVentas = ventas.serie.some((p) => p.actual > 0);

  const deltaVentas = calcularDelta(ventas.totalActual, ventas.totalComparacion);
  const deltaSalidas = calcularDelta(inventario.totalSalidas, inventario.totalSalidasComparacion);

  const finanzasActual = serieFinanzas[serieFinanzas.length - 1];
  const finanzasOk = finanzasActual ? Math.abs(finanzasActual.diferencia) <= 0.01 : null;

  const totalDropshippers = dropshippers?.length ?? 0;
  const activosDropshippers = (dropshippers ?? []).filter((d) => d.estado === "activo").length;
  const totalProveedoresComp = proveedoresComp?.length ?? 0;

  const secciones: SeccionDashboard[] = [
    {
      clave: "ventas",
      titulo: "Ventas Dropi",
      valor: ventas.totalActual.toFixed(2),
      badge: <BadgeDelta delta={deltaVentas} />,
      enlaces: [{ href: "/pedidos-dropi", label: "Ver pedidos" }],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Monto vendido por día — {periodo.etiqueta.toLowerCase()}
          </p>
          {hayVentas ? (
            <VentasChart datos={ventas.serie} etiquetaComparacion={periodo.etiquetaComparacion} />
          ) : (
            <p className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Aún no hay pedidos de Dropi cargados en este período.
            </p>
          )}
        </>
      ),
    },
    {
      clave: "operaciones",
      titulo: "Operaciones",
      valor: String(inventario.totalSalidas),
      badge: <BadgeDelta delta={deltaSalidas} />,
      enlaces: [
        { href: "/inventario", label: "Inventario" },
        { href: "/alertas", label: "Alertas" },
      ],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Entradas vs. salidas de inventario — {periodo.etiqueta.toLowerCase()}
          </p>
          {hayInventario ? (
            <InventarioChart datos={inventario.serie} />
          ) : (
            <p className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Aún no hay movimientos de inventario en este período.
            </p>
          )}
        </>
      ),
    },
    {
      clave: "finanzas",
      titulo: "Conciliación del mes",
      valor: finanzasActual ? finanzasActual.diferencia.toFixed(2) : "—",
      badge: finanzasActual ? (
        <Badge tone={finanzasOk ? "success" : "destructive"}>{finanzasOk ? "Cuadrado" : "Diferencia"}</Badge>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">Sin conciliaciones registradas</p>
      ),
      enlaces: [
        { href: "/extractos", label: "Extractos" },
        { href: "/conciliaciones", label: "Conciliación" },
      ],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Diferencia banco vs. plataforma reportada, por mes
          </p>
          {serieFinanzas.length > 0 ? (
            <FinanzasChart datos={serieFinanzas} />
          ) : (
            <p className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Todavía no hay conciliaciones registradas.
            </p>
          )}
        </>
      ),
    },
    {
      clave: "dropshippers",
      titulo: "Dropshippers activos",
      valor: `${activosDropshippers} / ${totalDropshippers}`,
      enlaces: [{ href: "/crm-dropshippers", label: "Ver panel" }],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">Directorio de dropshippers</p>
          {totalDropshippers > 0 ? (
            <div className="flex h-[340px] flex-col items-center justify-center gap-1">
              <p className="text-4xl font-semibold tabular-nums">{totalDropshippers}</p>
              <p className="text-sm text-muted-foreground">
                {activosDropshippers} activo{activosDropshippers === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <p className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Todavía no hay dropshippers registrados.
            </p>
          )}
        </>
      ),
    },
    {
      clave: "inteligencia",
      titulo: "Proveedores rastreados",
      valor: String(totalProveedoresComp),
      enlaces: [{ href: "/inteligencia-competitiva", label: "Ver panel" }],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">Proveedores competidores rastreados</p>
          {totalProveedoresComp > 0 ? (
            <div className="flex h-[340px] flex-col items-center justify-center gap-1">
              <p className="text-4xl font-semibold tabular-nums">{totalProveedoresComp}</p>
              <p className="text-sm text-muted-foreground">proveedores en el marketplace de Dropi</p>
            </div>
          ) : (
            <p className="flex h-[340px] items-center justify-center text-sm text-muted-foreground">
              Todavía no hay proveedores competidores cargados.
            </p>
          )}
        </>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard operativo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pais.nombre} — {periodo.etiqueta}
          </p>
        </div>
        <PeriodPicker />
      </div>

      <DashboardSecciones secciones={secciones} />
    </main>
  );
}
