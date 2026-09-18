import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { toneEstadoPedido } from "@/lib/estados-pedido";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { formatearFecha, formatearFechaHora, formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FiltroFechas } from "@/components/filtro-fechas";
import { OrdenSelect } from "./orden-select";
import { resolverPeriodo } from "@/lib/dashboard/periodo";
import { linkClass } from "@/components/ui/link";
import { AyudaContextual } from "@/components/ui/ayuda-contextual";
import { PedidoIcon } from "@/lib/nav-icons";

export const dynamic = "force-dynamic";

const OPCIONES_ORDEN = {
  fecha_desc: { columna: "fecha", ascending: false },
  fecha_asc: { columna: "fecha", ascending: true },
  monto_desc: { columna: "monto", ascending: false },
  monto_asc: { columna: "monto", ascending: true },
} as const;

export default async function PedidosDropiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("pedidos-dropi");
  const sp = await searchParams;
  const { desde, hasta } = resolverPeriodo({
    preset: typeof sp.preset === "string" ? sp.preset : undefined,
    desde: typeof sp.desde === "string" ? sp.desde : undefined,
    hasta: typeof sp.hasta === "string" ? sp.hasta : undefined,
  });
  const ordenClave = typeof sp.orden === "string" && sp.orden in OPCIONES_ORDEN ? sp.orden : "fecha_desc";
  const orden = OPCIONES_ORDEN[ordenClave as keyof typeof OPCIONES_ORDEN];

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: plataformaDropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  const plataformaId = plataformaDropi?.id ?? "";

  const [resumen, { data: ordenes }, carteraGanancia] = await Promise.all([
    traerTodasLasFilas<{ monto: number; estado: string; referencia_externa: string }>((rDesde, rHasta) =>
      supabase
        .from("ordenes")
        .select("monto, estado, referencia_externa")
        .eq("pais_id", pais.id)
        .eq("plataforma_id", plataformaId)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .range(rDesde, rHasta)
    ),
    supabase
      .from("ordenes")
      .select("referencia_externa, cantidad, monto, estado, fecha, fecha_hora, productos(sku, nombre)")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataformaId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order(orden.columna, { ascending: orden.ascending })
      .order("referencia_externa", { ascending: orden.ascending })
      .limit(500),
    traerTodasLasFilas<{ orden_referencia_externa: string | null }>((rDesde, rHasta) =>
      supabase
        .from("historial_cartera")
        .select("orden_referencia_externa")
        .eq("pais_id", pais.id)
        .eq("plataforma_id", plataformaId)
        .ilike("descripcion", "%GANANCIA%")
        .range(rDesde, rHasta)
    ),
  ]);

  const totalOrdenes = resumen.length;
  const totalMonto = resumen.reduce((acc, o) => acc + Number(o.monto), 0);
  const todas = ordenes ?? [];

  const referenciasLiquidadas = new Set(
    (carteraGanancia ?? []).map((c) => c.orden_referencia_externa).filter((r): r is string => r !== null)
  );
  const esAlerta = (referencia: string, estado: string) =>
    referenciasLiquidadas.has(referencia) && !estado.toUpperCase().includes("ENTREGAD");
  const totalAlertas = resumen.filter((o) => esAlerta(o.referencia_externa, o.estado)).length;

  const porEstado = new Map<string, number>();
  for (const o of resumen) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const estadosOrdenados = Array.from(porEstado.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-8 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <PedidoIcon className="h-5 w-5 text-muted-foreground" />
          Pedidos Dropi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — órdenes reales extraídas del panel de proveedor de Dropi.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FiltroFechas />
          <OrdenSelect actual={ordenClave} />
        </div>
        <a
          href={`/api/exportar-pedidos-dropi?desde=${desde}&hasta=${hasta}`}
          className={`${linkClass} ml-auto`}
        >
          Descargar CSV ({totalOrdenes.toLocaleString("es")} órdenes)
        </a>
      </div>

      {totalOrdenes === 0 ? (
        <EstadoVacio mensaje={`No hay órdenes de Dropi para ${pais.nombre} entre ${desde} y ${hasta}.`} />
      ) : (
        <>
          <KpiGrid>
            <KpiCard titulo="Órdenes en el rango" valor={totalOrdenes} />
            <KpiCard titulo="Monto total" valor={formatearMoneda(totalMonto, pais.codigo)} />
            <KpiCard
              titulo={
                <>
                  Alertas: liquidado sin marcar entregado
                  <AyudaContextual texto="Dropi ya registró la ganancia de este pedido en la cartera, pero el pedido todavía no aparece como ENTREGADO — normalmente significa que hay que actualizar su estado a mano en Dropi." />
                </>
              }
              valor={totalAlertas}
              tono={totalAlertas > 0 ? "destructive" : "neutral"}
            />
            {estadosOrdenados.map(([estado, cantidad]) => (
              <KpiCard key={estado} titulo={estado} valor={cantidad} />
            ))}
          </KpiGrid>

          {todas.length < totalOrdenes && (
            <div className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning">
              <strong className="font-semibold">
                Mostrando {todas.length} de {totalOrdenes.toLocaleString("es")} órdenes
              </strong>{" "}
              en la tabla (el resumen de arriba sí las cuenta a todas). Achica el rango de fechas para
              verlas todas, o descarga el CSV completo arriba.
            </div>
          )}

          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Fecha y hora del pedido</th>
                  <th className="py-2 pr-3 font-medium">Orden</th>
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 font-medium">Cantidad</th>
                  <th className="py-2 pr-3 font-medium">Monto</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {todas.map((o) => {
                  const producto = o.productos as unknown as { sku: string; nombre: string } | null;
                  const alerta = esAlerta(o.referencia_externa, o.estado);
                  return (
                    <tr
                      key={o.referencia_externa}
                      className={`border-b last:border-0 ${
                        alerta ? "border-red-200 bg-red-50 text-red-900" : "border-border/60"
                      }`}
                    >
                      <td className="py-2 pr-3 pl-4">{formatearFecha(o.fecha)}</td>
                      <td className={`py-2 pr-3 ${alerta ? "text-red-700" : "text-muted-foreground"}`}>
                        {formatearFechaHora(o.fecha_hora)}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        {alerta && (
                          <span title="Liquidado en cartera pero aún no marcado ENTREGADO en Dropi">⚠️ </span>
                        )}
                        {o.referencia_externa}
                      </td>
                      <td className={`py-2 pr-3 ${alerta ? "" : "text-muted-foreground"}`}>
                        {producto?.nombre ?? "—"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{o.cantidad}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatearMoneda(Number(o.monto), pais.codigo)}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={toneEstadoPedido(o.estado)}>{o.estado}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
