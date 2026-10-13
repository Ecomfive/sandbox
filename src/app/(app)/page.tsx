import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
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
import { formatearMoneda } from "@/lib/formato";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { armarCola, obtenerResumenTest } from "@/lib/hoy";
import { ColaAtencion } from "@/components/hoy/cola-atencion";
import { TarjetaProductoTest } from "@/components/hoy/tarjeta-producto-test";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const metadata = { title: "Hoy" };

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
  const usuario = await requireModulo("dashboard");
  const sp = await searchParams;
  const periodo = resolverPeriodo({
    preset: typeof sp.preset === "string" ? sp.preset : undefined,
    desde: typeof sp.desde === "string" ? sp.desde : undefined,
    hasta: typeof sp.hasta === "string" ? sp.hasta : undefined,
    comparar: typeof sp.comparar === "string" ? sp.comparar : undefined,
  });

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const verTest = usuario.modulos.includes("productos-test");
  // Cada tarjeta solo se arma (y se consulta) si la persona puede abrir su módulo: «Hoy» no muestra lo que su rol no ve.
  const puede = (m: string) => usuario.modulos.includes(m);
  const ver = {
    ventas: puede("pedidos-dropi"),
    operaciones: puede("inventario"),
    finanzas: puede("conciliaciones"),
    dropshippers: puede("crm-dropshippers"),
    inteligencia: puede("inteligencia-competitiva"),
  };
  const sinDatos = { data: [] as { estado?: string; id?: string }[] };
  const [inventario, ventas, serieFinanzas, { data: dropshippers }, { data: proveedoresComp }, pendientesHoy, resumenTest] =
    await Promise.all([
      ver.operaciones ? getSerieInventarioComparada(supabase, pais.id, periodo) : null,
      ver.ventas ? getSerieVentasComparada(supabase, pais.id, periodo) : null,
      ver.finanzas ? getSerieFinanzas(supabase, pais.id) : [],
      ver.dropshippers ? supabase.from("dropshippers").select("estado").eq("pais_id", pais.id) : sinDatos,
      ver.inteligencia ? supabase.from("proveedores_competencia").select("id").eq("pais_id", pais.id) : sinDatos,
      obtenerPendientesHoy(supabase, pais.id),
      verTest ? obtenerResumenTest(supabase, pais.id, periodo.desde, periodo.hasta) : Promise.resolve(null),
    ]);

  const cola = armarCola(pendientesHoy, usuario.modulos);

  const finanzasActual = serieFinanzas[serieFinanzas.length - 1];
  const finanzasOk = finanzasActual ? Math.abs(finanzasActual.diferencia) <= 0.01 : null;

  const totalDropshippers = dropshippers?.length ?? 0;
  const activosDropshippers = (dropshippers ?? []).filter((d) => d.estado === "activo").length;
  const totalProveedoresComp = proveedoresComp?.length ?? 0;

  const secciones: SeccionDashboard[] = [];
  if (ventas) {
    const hayVentas = ventas.serie.some((p) => p.actual > 0);
    const deltaVentas = calcularDelta(ventas.totalActual, ventas.totalComparacion);
    secciones.push({
      clave: "ventas",
      titulo: "Ventas Dropi",
      valor: formatearMoneda(ventas.totalActual, pais.codigo),
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
            <div className="flex h-[340px] items-center justify-center">
              <EstadoVacio mensaje="Aún no hay pedidos de Dropi cargados en este período." />
            </div>
          )}
        </>
      ),
    });
  }
  if (inventario) {
    const hayInventario = inventario.serie.some((p) => p.entradas > 0 || p.salidas > 0);
    const deltaSalidas = calcularDelta(inventario.totalSalidas, inventario.totalSalidasComparacion);
    secciones.push({
      clave: "operaciones",
      titulo: "Operaciones",
      valor: String(inventario.totalSalidas),
      badge: <BadgeDelta delta={deltaSalidas} />,
      enlaces: [
        { href: "/inventario", label: "Inventario" },
        { href: "/alertas", label: "Alertas de inventario" },
      ],
      contenido: (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Entradas vs. salidas de inventario — {periodo.etiqueta.toLowerCase()}
          </p>
          {hayInventario ? (
            <InventarioChart datos={inventario.serie} />
          ) : (
            <div className="flex h-[340px] items-center justify-center">
              <EstadoVacio mensaje="Aún no hay movimientos de inventario en este período." />
            </div>
          )}
        </>
      ),
    });
  }
  if (ver.finanzas) {
    secciones.push({
      clave: "finanzas",
      titulo: "Conciliación del mes",
      valor: finanzasActual ? formatearMoneda(finanzasActual.diferencia, pais.codigo) : "—",
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
            <div className="flex h-[340px] items-center justify-center">
              <EstadoVacio mensaje="Todavía no hay conciliaciones registradas." />
            </div>
          )}
        </>
      ),
    });
  }
  if (ver.dropshippers) {
    secciones.push({
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
            <div className="flex h-[340px] items-center justify-center">
              <EstadoVacio mensaje="Todavía no hay dropshippers registrados." />
            </div>
          )}
        </>
      ),
    });
  }
  if (ver.inteligencia) {
    secciones.push({
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
            <div className="flex h-[340px] items-center justify-center">
              <EstadoVacio mensaje="Todavía no hay proveedores competidores cargados." />
            </div>
          )}
        </>
      ),
    });
  }

  return (
    <Pagina ancho="ancha">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <EncabezadoPagina titulo="Hoy" oculto>
          {pais.nombre} — {periodo.etiqueta}
        </EncabezadoPagina>
        <PeriodPicker />
      </div>

      {(cola.length > 0 || resumenTest) && (
        <div className={`mt-6 grid grid-cols-1 items-start gap-5 ${cola.length > 0 && resumenTest ? "min-[1000px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}>
          <ColaAtencion filas={cola} />
          {resumenTest && <TarjetaProductoTest resumen={resumenTest} periodo={periodo.etiqueta} />}
        </div>
      )}

      {secciones.length > 0 && (
        <div className="mt-6">
          <DashboardSecciones secciones={secciones} seccionInicial={secciones[0].clave} />
        </div>
      )}
    </Pagina>
  );
}
