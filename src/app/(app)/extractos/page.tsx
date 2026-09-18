import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { ExtractoUploader } from "./uploader";
import { AsignarPlataformaSelect } from "./asignar-plataforma";
import { Badge } from "@/components/ui/badge";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ExtractosPage() {
  await requireModulo("extractos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: extractos }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("extractos_bancarios")
      .select(
        "id, archivo_path, fecha_carga, pais_id, movimientos_bancarios(id, fecha, monto, tipo, descripcion, plataforma_id)"
      )
      .eq("pais_id", pais.id)
      .order("fecha_carga", { ascending: false })
      .limit(10),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Cargar extracto bancario</h1>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Sube el archivo del banco, mapea las columnas y confirma para guardarlo.
        </p>
        <ExtractoUploader pais={pais} />
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Extractos cargados</h2>
        <div className="mt-3 flex flex-col gap-4">
          {(extractos ?? []).map((extracto) => (
            <div key={extracto.id} className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 text-sm font-medium">
                {new Date(extracto.fecha_carga).toLocaleString()}
              </p>
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Fecha</th>
                      <th className="py-1.5 pr-3 font-medium">Monto</th>
                      <th className="py-1.5 pr-3 font-medium">Tipo</th>
                      <th className="py-1.5 pr-3 font-medium">Descripción</th>
                      <th className="py-1.5 pr-3 font-medium">Plataforma</th>
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
                        <tr key={m.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-3">{m.fecha}</td>
                          <td className="py-1.5 pr-3 tabular-nums">
                            {Number(m.monto).toFixed(2)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <Badge tone={m.tipo === "deposito" ? "success" : "neutral"}>
                              {m.tipo}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{m.descripcion}</td>
                          <td className="py-1.5 pr-3">
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
            </div>
          ))}
          {(extractos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay extractos cargados.</p>
          )}
        </div>
      </div>
    </main>
  );
}
