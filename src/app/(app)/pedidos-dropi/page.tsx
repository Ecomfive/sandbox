import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const toneEstado = (estado: string): "success" | "warning" | "destructive" | "neutral" => {
  const e = estado.toUpperCase();
  if (e.includes("ENTREGAD") || e.includes("PAGAD")) return "success";
  if (e.includes("CANCELAD") || e.includes("DEVOLU") || e.includes("RECHAZAD")) return "destructive";
  if (e.includes("PENDIENTE") || e.includes("TRANSPORT") || e.includes("PREPARAD")) return "warning";
  return "neutral";
};

export default async function PedidosDropiPage() {
  await requireModulo("pedidos-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: plataformaDropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();

  const { data: ordenes } = await supabase
    .from("ordenes")
    .select("referencia_externa, cantidad, monto, estado, fecha, productos(sku, nombre)")
    .eq("pais_id", pais.id)
    .eq("plataforma_id", plataformaDropi?.id ?? "")
    .order("fecha", { ascending: false })
    .order("referencia_externa", { ascending: false })
    .limit(200);

  const todas = ordenes ?? [];
  const totalOrdenes = todas.length;
  const totalMonto = todas.reduce((acc, o) => acc + Number(o.monto), 0);

  const porEstado = new Map<string, number>();
  for (const o of todas) porEstado.set(o.estado, (porEstado.get(o.estado) ?? 0) + 1);
  const estadosOrdenados = Array.from(porEstado.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Pedidos Dropi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — órdenes reales extraídas del panel de proveedor de Dropi (últimas {totalOrdenes}{" "}
          cargadas).
        </p>
      </div>

      {totalOrdenes === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay órdenes de Dropi cargadas para {pais.nombre}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Órdenes cargadas</p>
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

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
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
