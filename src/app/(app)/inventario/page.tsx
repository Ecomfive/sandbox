import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { InventarioUploader } from "./uploader";
import { requireModulo } from "@/lib/auth";
import { InventarioIcon } from "@/lib/nav-icons";
import { TablaMovimientos } from "./tabla-movimientos";

export const metadata = { title: "Inventario" };

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
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <EncabezadoPagina titulo="Cargar movimientos de inventario (pistoleo)" icono={InventarioIcon} className="mb-4">
          Los SKU que no existan todavía se crean automáticamente.
        </EncabezadoPagina>
        <div className="max-w-5xl">
          <InventarioUploader pais={pais} />
        </div>
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
    </Pagina>
  );
}
