import { createServiceClient } from "@/lib/supabase/server";
import { calcularPendientes } from "@/lib/alertas/pendientes";
import { generarAlerta, actualizarEstadoAlerta } from "./actions";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const supabase = createServiceClient();

  const pendientes = (await calcularPendientes(supabase)).sort(
    (a, b) => b.pendiente - a.pendiente
  );

  const { data: alertas } = await supabase
    .from("alertas_inventario_no_retornado")
    .select("id, cantidad, fecha_deteccion, fecha_reclamo, estado, productos(sku, nombre), paises(nombre)")
    .order("fecha_deteccion", { ascending: false });

  return (
    <main className="p-8 flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold mb-1">Inventario pendiente de retorno</h1>
        <p className="text-sm text-gray-600 mb-4">
          Salidas menos entradas por producto, según lo cargado en{" "}
          <a href="/inventario" className="underline">
            Inventario
          </a>
          . Generar una alerta la deja lista para el reclamo quincenal a la plataforma.
        </p>
        <table className="text-xs border-collapse w-full max-w-2xl">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-3 py-1">País</th>
              <th className="pr-3 py-1">SKU</th>
              <th className="pr-3 py-1">Producto</th>
              <th className="pr-3 py-1">Pendiente</th>
              <th className="pr-3 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => (
              <tr key={p.producto_id} className="border-b border-gray-100">
                <td className="pr-3 py-1">{p.pais_nombre}</td>
                <td className="pr-3 py-1">{p.sku}</td>
                <td className="pr-3 py-1">{p.nombre}</td>
                <td className="pr-3 py-1">{p.pendiente}</td>
                <td className="pr-3 py-1">
                  <form action={generarAlerta}>
                    <input type="hidden" name="pais_id" value={p.pais_id} />
                    <input type="hidden" name="producto_id" value={p.producto_id} />
                    <input type="hidden" name="cantidad" value={p.pendiente} />
                    <button type="submit" className="underline text-xs">
                      Generar alerta
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pendientes.length === 0 && (
          <p className="text-sm text-gray-500">No hay inventario pendiente por ahora.</p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Alertas</h2>
        <table className="text-xs border-collapse w-full max-w-3xl">
          <thead>
            <tr className="text-left border-b">
              <th className="pr-3 py-1">País</th>
              <th className="pr-3 py-1">SKU</th>
              <th className="pr-3 py-1">Producto</th>
              <th className="pr-3 py-1">Cantidad</th>
              <th className="pr-3 py-1">Detectada</th>
              <th className="pr-3 py-1">Reclamada</th>
              <th className="pr-3 py-1">Estado</th>
              <th className="pr-3 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {(alertas ?? []).map((a) => {
              const producto = a.productos as unknown as { sku: string; nombre: string } | null;
              const pais = a.paises as unknown as { nombre: string } | null;
              return (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="pr-3 py-1">{pais?.nombre}</td>
                  <td className="pr-3 py-1">{producto?.sku}</td>
                  <td className="pr-3 py-1">{producto?.nombre}</td>
                  <td className="pr-3 py-1">{a.cantidad}</td>
                  <td className="pr-3 py-1">{a.fecha_deteccion}</td>
                  <td className="pr-3 py-1">{a.fecha_reclamo ?? "—"}</td>
                  <td className="pr-3 py-1">{a.estado}</td>
                  <td className="pr-3 py-1 flex gap-2">
                    {a.estado === "abierta" && (
                      <form action={actualizarEstadoAlerta}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="estado" value="reclamada" />
                        <button type="submit" className="underline">
                          Marcar reclamada
                        </button>
                      </form>
                    )}
                    {a.estado !== "resuelta" && (
                      <form action={actualizarEstadoAlerta}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="estado" value="resuelta" />
                        <button type="submit" className="underline">
                          Marcar resuelta
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(alertas ?? []).length === 0 && (
          <p className="text-sm text-gray-500">Todavía no hay alertas generadas.</p>
        )}
      </div>
    </main>
  );
}
