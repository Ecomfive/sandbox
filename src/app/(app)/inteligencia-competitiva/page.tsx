import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

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

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Inteligencia competitiva</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — proveedores competidores vistos desde la cuenta dropshipper de Dropi. El
          crecimiento se calcula comparando la última carga contra la anterior.
        </p>
      </div>

      {totalProveedores === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay proveedores cargados para {pais.nombre}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Proveedores rastreados</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totalProveedores}</p>
            </div>
            <div className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-medium">Productos combinados</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{totalProductos}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Proveedor</th>
                  <th className="py-2 pr-3 font-medium">Ciudad</th>
                  <th className="py-2 pr-3 font-medium">Categorías</th>
                  <th className="py-2 pr-3 font-medium">Productos</th>
                  <th className="py-2 pr-3 font-medium">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">
                      <p className="font-medium">{f.tienda || f.nombre}</p>
                      {f.tienda && <p className="text-xs text-muted-foreground">{f.nombre}</p>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{f.ciudad ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{f.categorias.join(", ") || "—"}</td>
                    <td className="py-2 pr-3 tabular-nums">{f.actual ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {f.cambio === null ? (
                        <span className="text-xs text-muted-foreground">Sin historial</span>
                      ) : f.cambio === 0 ? (
                        <Badge tone="neutral">Sin cambio</Badge>
                      ) : f.cambio > 0 ? (
                        <Badge tone="success">+{f.cambio}</Badge>
                      ) : (
                        <Badge tone="destructive">{f.cambio}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
