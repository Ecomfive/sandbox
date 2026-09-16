import { createServiceClient } from "@/lib/supabase/server";
import { ExtractoUploader } from "./uploader";
import { AsignarPlataformaSelect } from "./asignar-plataforma";

export const dynamic = "force-dynamic";

export default async function ExtractosPage() {
  const supabase = createServiceClient();

  const [{ data: paises }, { data: plataformas }, { data: extractos }] = await Promise.all([
    supabase.from("paises").select("id, nombre").order("nombre"),
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("extractos_bancarios")
      .select(
        "id, archivo_path, fecha_carga, pais_id, paises(nombre), movimientos_bancarios(id, fecha, monto, tipo, descripcion, plataforma_id)"
      )
      .order("fecha_carga", { ascending: false })
      .limit(10),
  ]);

  return (
    <main className="p-8 flex flex-col gap-10">
      <div>
        <h1 className="text-xl font-semibold mb-4">Cargar extracto bancario</h1>
        <ExtractoUploader paises={paises ?? []} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Extractos cargados</h2>
        <div className="flex flex-col gap-6">
          {(extractos ?? []).map((extracto) => (
            <div key={extracto.id} className="border rounded p-3">
              <p className="text-sm font-medium mb-2">
                {(extracto.paises as unknown as { nombre: string } | null)?.nombre} —{" "}
                {new Date(extracto.fecha_carga).toLocaleString()}
              </p>
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pr-3 py-1">Fecha</th>
                    <th className="pr-3 py-1">Monto</th>
                    <th className="pr-3 py-1">Tipo</th>
                    <th className="pr-3 py-1">Descripción</th>
                    <th className="pr-3 py-1">Plataforma</th>
                  </tr>
                </thead>
                <tbody>
                  {(extracto.movimientos_bancarios ?? []).map(
                    (m: {
                      id: string;
                      fecha: string;
                      monto: number;
                      tipo: string;
                      descripcion: string | null;
                      plataforma_id: string | null;
                    }) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="pr-3 py-1">{m.fecha}</td>
                        <td className="pr-3 py-1">{Number(m.monto).toFixed(2)}</td>
                        <td className="pr-3 py-1">{m.tipo}</td>
                        <td className="pr-3 py-1">{m.descripcion}</td>
                        <td className="pr-3 py-1">
                          <AsignarPlataformaSelect
                            movimientoId={m.id}
                            plataformaIdActual={m.plataforma_id}
                            plataformas={plataformas ?? []}
                          />
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          ))}
          {(extractos ?? []).length === 0 && (
            <p className="text-sm text-gray-500">Todavía no hay extractos cargados.</p>
          )}
        </div>
      </div>
    </main>
  );
}
