import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { calcularPendientes } from "@/lib/alertas/pendientes";
import { generarAlerta } from "./actions";
import { TablaAlertas, type AlertaFila } from "./tabla-alertas";
import { Button } from "@/components/ui/button";
import { requireModulo } from "@/lib/auth";
import { linkClass } from "@/components/ui/link";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  await requireModulo("alertas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const pendientes = (await calcularPendientes(supabase, pais.id)).sort(
    (a, b) => b.pendiente - a.pendiente
  );

  const { data } = await supabase
    .from("alertas_inventario_no_retornado")
    .select("id, cantidad, fecha_deteccion, fecha_reclamo, estado, productos(sku, nombre)")
    .eq("pais_id", pais.id)
    .order("fecha_deteccion", { ascending: false });

  const alertas: AlertaFila[] = (data ?? []).map((a) => {
    const producto = a.productos as unknown as { sku: string; nombre: string } | null;
    return {
      id: a.id,
      sku: producto?.sku ?? "",
      nombre: producto?.nombre ?? "",
      cantidad: a.cantidad,
      fecha_deteccion: a.fecha_deteccion,
      fecha_reclamo: a.fecha_reclamo,
      estado: a.estado as AlertaFila["estado"],
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Inventario pendiente de retorno</h1>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Salidas menos entradas por producto, según lo cargado en{" "}
          <Link href="/inventario" className={linkClass}>
            Inventario
          </Link>
          . Generar una alerta la deja lista para el reclamo quincenal a la plataforma.
        </p>
        <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Pendiente</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => (
                <tr key={p.producto_id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4 font-medium">{p.sku}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.nombre}</td>
                  <td className="py-2 pr-3 tabular-nums">{p.pendiente}</td>
                  <td className="py-2 pr-4 text-right">
                    <form action={generarAlerta}>
                      <input type="hidden" name="pais_id" value={p.pais_id} />
                      <input type="hidden" name="producto_id" value={p.producto_id} />
                      <input type="hidden" name="cantidad" value={p.pendiente} />
                      <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                        Generar alerta
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pendientes.length === 0 && <EstadoVacio mensaje="No hay inventario pendiente por ahora." />}
        </div>
      </div>

      <TablaAlertas alertas={alertas} />
    </main>
  );
}
