import { createServiceClient } from "@/lib/supabase/server";
import { InventarioUploader } from "./uploader";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const supabase = createServiceClient();

  const [{ data: paises }, { data: movimientos }] = await Promise.all([
    supabase.from("paises").select("id, nombre").order("nombre"),
    supabase
      .from("movimientos_inventario")
      .select("id, tipo, cantidad, fecha, fuente, referencia, productos(sku, nombre), paises(nombre)")
      .order("creado_en", { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="p-8 flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold mb-4">Cargar movimientos de inventario (pistoleo)</h1>
        <InventarioUploader paises={paises ?? []} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Movimientos recientes</h2>
        <table className="text-xs border-collapse w-full max-w-3xl">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-3 py-1">Fecha</th>
              <th className="pr-3 py-1">País</th>
              <th className="pr-3 py-1">SKU</th>
              <th className="pr-3 py-1">Producto</th>
              <th className="pr-3 py-1">Tipo</th>
              <th className="pr-3 py-1">Cantidad</th>
              <th className="pr-3 py-1">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {(movimientos ?? []).map((m) => {
              const producto = m.productos as unknown as { sku: string; nombre: string } | null;
              const pais = m.paises as unknown as { nombre: string } | null;
              return (
                <tr key={m.id} className="border-b border-gray-100">
                  <td className="pr-3 py-1">{m.fecha}</td>
                  <td className="pr-3 py-1">{pais?.nombre}</td>
                  <td className="pr-3 py-1">{producto?.sku}</td>
                  <td className="pr-3 py-1">{producto?.nombre}</td>
                  <td className="pr-3 py-1">{m.tipo}</td>
                  <td className="pr-3 py-1">{m.cantidad}</td>
                  <td className="pr-3 py-1">{m.fuente}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(movimientos ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Todavía no hay movimientos de inventario.</p>
        )}
      </div>
    </main>
  );
}
