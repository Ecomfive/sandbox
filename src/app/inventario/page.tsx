import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { InventarioUploader } from "./uploader";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: movimientos } = await supabase
    .from("movimientos_inventario")
    .select("id, tipo, cantidad, fecha, fuente, referencia, productos(sku, nombre)")
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Cargar movimientos de inventario (pistoleo)
        </h1>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Los SKU que no existan todavía se crean automáticamente.
        </p>
        <InventarioUploader pais={pais} />
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Movimientos recientes</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Cantidad</th>
                <th className="py-2 pr-3 font-medium">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {(movimientos ?? []).map((m) => {
                const producto = m.productos as unknown as { sku: string; nombre: string } | null;
                return (
                  <tr key={m.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">{m.fecha}</td>
                    <td className="py-2 pr-3 font-medium">{producto?.sku}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{producto?.nombre}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={m.tipo === "entrada" ? "success" : "neutral"}>{m.tipo}</Badge>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{m.cantidad}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{m.fuente}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(movimientos ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Todavía no hay movimientos de inventario.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
