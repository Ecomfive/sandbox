import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";

export const dynamic = "force-dynamic";

const toneEstado = (estado: string): "success" | "warning" | "destructive" | "neutral" => {
  const e = estado.toUpperCase();
  if (e.includes("ENTREGAD") || e.includes("PAGAD")) return "success";
  if (e.includes("CANCELAD") || e.includes("DEVOLU") || e.includes("RECHAZAD")) return "destructive";
  if (e.includes("PENDIENTE") || e.includes("TRANSPORT") || e.includes("PREPARAD")) return "warning";
  return "neutral";
};

/** "2026-09-17T12:25:05" -> "17/09 12:25", sin pasar por Date (evita corrimientos de zona horaria). */
function formatoHora(fechaHora: string | null): string {
  if (!fechaHora) return "—";
  const [fecha, hora] = fechaHora.split("T");
  if (!fecha || !hora) return fechaHora;
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes} ${hora.slice(0, 5)}`;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const haceNDias = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

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
  const desde = typeof sp.desde === "string" && sp.desde ? sp.desde : haceNDias(6);
  const hasta = typeof sp.hasta === "string" && sp.hasta ? sp.hasta : hoy();
  const ordenClave = typeof sp.orden === "string" && sp.orden in OPCIONES_ORDEN ? sp.orden : "fecha_desc";
  const orden = OPCIONES_ORDEN[ordenClave as keyof typeof OPCIONES_ORDEN];

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: plataformaDropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  const plataformaId = plataformaDropi?.id ?? "";

  const [{ data: resumenFilas }, { data: ordenes }] = await Promise.all([
    supabase
      .from("ordenes")
      .select("monto, estado")
      .eq("pais_id", pais.id)
      .eq("plataforma_id", plataformaId)
      .gte("fecha", desde)
      .lte("fecha", hasta),
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
  ]);

  const resumen = resumenFilas ?? [];
  const totalOrdenes = resumen.length;
  const totalMonto = resumen.reduce((acc, o) => acc + Number(o.monto), 0);
  const todas = ordenes ?? [];

  const porEstado = new Map<string, number>();
  for (const o of resumen) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const estadosOrdenados = Array.from(porEstado.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-8 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Pedidos Dropi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — órdenes reales extraídas del panel de proveedor de Dropi.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label className={labelClassSm}>Desde</label>
          <input type="date" name="desde" defaultValue={desde} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClassSm}>Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClassSm}>Ordenar por</label>
          <select name="orden" defaultValue={ordenClave} className={fieldClass}>
            <option value="fecha_desc">Fecha (recientes primero)</option>
            <option value="fecha_asc">Fecha (antiguos primero)</option>
            <option value="monto_asc">Monto (menor a mayor)</option>
            <option value="monto_desc">Monto (mayor a menor)</option>
          </select>
        </div>
        <Button type="submit">Filtrar</Button>
      </form>

      {totalOrdenes === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay órdenes de Dropi para {pais.nombre} entre {desde} y {hasta}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Órdenes en el rango</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totalOrdenes}</p>
            </div>
            <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Monto total</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totalMonto.toFixed(2)}</p>
            </div>
            {estadosOrdenados.map(([estado, cantidad]) => (
              <div key={estado} className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-medium">{estado}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{cantidad}</p>
              </div>
            ))}
          </div>

          {todas.length < totalOrdenes && (
            <p className="text-xs text-muted-foreground">
              Mostrando {todas.length} de {totalOrdenes} órdenes en la tabla (el resumen de arriba sí las
              cuenta a todas). Achica el rango de fechas para verlas todas en la tabla.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
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
                  return (
                    <tr key={o.referencia_externa} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 pl-4">{o.fecha}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{formatoHora(o.fecha_hora)}</td>
                      <td className="py-2 pr-3 font-medium">{o.referencia_externa}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{producto?.nombre ?? "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">{o.cantidad}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(o.monto).toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={toneEstado(o.estado)}>{o.estado}</Badge>
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
