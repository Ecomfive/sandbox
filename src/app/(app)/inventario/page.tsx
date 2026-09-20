import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { InventarioUploader } from "./uploader";
import { requireModulo } from "@/lib/auth";
import { InventarioIcon } from "@/lib/nav-icons";
import { TablaMovimientos } from "./tabla-movimientos";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  await requireModulo("inventario");
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
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <InventarioIcon className="h-5 w-5 text-muted-foreground" />
          Cargar movimientos de inventario (pistoleo)
        </h1>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Los SKU que no existan todavía se crean automáticamente.
        </p>
        <InventarioUploader pais={pais} />
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Movimientos recientes</h2>
        <div className="mt-3">
          <TablaMovimientos
            movimientos={(movimientos ?? []).map((m) => {
              const producto = m.productos as unknown as { sku: string; nombre: string } | null;
              return {
                id: m.id,
                fecha: m.fecha,
                sku: producto?.sku ?? "",
                producto: producto?.nombre ?? "",
                tipo: m.tipo,
                cantidad: Number(m.cantidad),
                fuente: m.fuente,
              };
            })}
          />
        </div>
      </div>
    </main>
  );
}
