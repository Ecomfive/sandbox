import { createServiceClient } from "@/lib/supabase/server";
import { upsertConciliacion } from "./actions";

export const dynamic = "force-dynamic";

interface Grupo {
  pais_id: string;
  pais_nombre: string;
  plataforma_id: string;
  plataforma_nombre: string;
  periodo: string; // yyyy-mm-01
  monto_bancario: number;
}

export default async function ConciliacionesPage() {
  const supabase = createServiceClient();

  const { data: movimientos } = await supabase
    .from("movimientos_bancarios")
    .select("monto, fecha, plataforma_id, plataformas(nombre), extractos_bancarios(pais_id, paises(nombre))")
    .eq("tipo", "deposito")
    .not("plataforma_id", "is", null);

  const grupos = new Map<string, Grupo>();
  for (const m of movimientos ?? []) {
    const extracto = m.extractos_bancarios as unknown as {
      pais_id: string;
      paises: { nombre: string } | null;
    } | null;
    const plataforma = m.plataformas as unknown as { nombre: string } | null;
    if (!extracto || !m.plataforma_id) continue;
    const periodo = `${String(m.fecha).slice(0, 7)}-01`;
    const key = `${extracto.pais_id}|${m.plataforma_id}|${periodo}`;
    const existente = grupos.get(key);
    if (existente) {
      existente.monto_bancario += Number(m.monto);
    } else {
      grupos.set(key, {
        pais_id: extracto.pais_id,
        pais_nombre: extracto.paises?.nombre ?? "?",
        plataforma_id: m.plataforma_id,
        plataforma_nombre: plataforma?.nombre ?? "?",
        periodo,
        monto_bancario: Number(m.monto),
      });
    }
  }

  const { data: conciliacionesExistentes } = await supabase
    .from("conciliaciones")
    .select("pais_id, plataforma_id, periodo, monto_reportado_plataforma, diferencia, estado, notas");

  const existentesPorClave = new Map(
    (conciliacionesExistentes ?? []).map((c) => [`${c.pais_id}|${c.plataforma_id}|${c.periodo}`, c])
  );

  const filas = Array.from(grupos.values()).sort((a, b) => b.periodo.localeCompare(a.periodo));

  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold mb-1">Conciliación banco vs. plataforma</h1>
      <p className="text-sm text-gray-600 mb-6">
        Monto bancario = depósitos del extracto ya asignados a cada plataforma. Monto reportado
        por la plataforma se ingresa manualmente hasta que la extracción automática esté lista.
      </p>

      {filas.length === 0 && (
        <p className="text-sm text-gray-500">
          Todavía no hay depósitos asignados a una plataforma. Ve a{" "}
          <a href="/extractos" className="underline">
            Extractos
          </a>{" "}
          y asigna plataforma a los movimientos.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {filas.map((f) => {
          const clave = `${f.pais_id}|${f.plataforma_id}|${f.periodo}`;
          const existente = existentesPorClave.get(clave);
          const diferencia = existente ? Number(existente.diferencia) : 0;
          return (
            <form
              key={clave}
              action={upsertConciliacion}
              className="border rounded p-4 flex flex-wrap items-end gap-4"
            >
              <input type="hidden" name="pais_id" value={f.pais_id} />
              <input type="hidden" name="plataforma_id" value={f.plataforma_id} />
              <input type="hidden" name="periodo" value={f.periodo} />
              <input type="hidden" name="monto_bancario" value={f.monto_bancario} />

              <div>
                <p className="text-xs text-gray-500">País / Plataforma</p>
                <p className="text-sm font-medium">
                  {f.pais_nombre} · {f.plataforma_nombre}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Período</p>
                <p className="text-sm font-medium">{f.periodo.slice(0, 7)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Monto bancario</p>
                <p className="text-sm font-medium">{f.monto_bancario.toFixed(2)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Monto reportado por plataforma</label>
                <input
                  type="number"
                  step="0.01"
                  name="monto_reportado_plataforma"
                  defaultValue={existente?.monto_reportado_plataforma ?? ""}
                  className="border rounded px-2 py-1 text-sm w-36"
                  required
                />
              </div>
              <div>
                <p className="text-xs text-gray-500">Diferencia</p>
                <p
                  className={`text-sm font-medium ${
                    existente && Math.abs(diferencia) > 0.01 ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {existente ? diferencia.toFixed(2) : "—"}
                </p>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
                <label className="text-xs text-gray-500">Notas</label>
                <input
                  type="text"
                  name="notas"
                  defaultValue={existente?.notas ?? ""}
                  className="border rounded px-2 py-1 text-sm w-full"
                />
              </div>
              <button
                type="submit"
                className="bg-black text-white rounded px-4 py-2 text-sm h-fit"
              >
                Guardar
              </button>
            </form>
          );
        })}
      </div>
    </main>
  );
}
