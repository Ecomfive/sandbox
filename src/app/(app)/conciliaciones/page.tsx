import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { upsertConciliacion } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { requireModulo } from "@/lib/auth";
import { linkClass } from "@/components/ui/link";
import { formatearMes, formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const dynamic = "force-dynamic";

interface Grupo {
  plataforma_id: string;
  plataforma_nombre: string;
  periodo: string; // yyyy-mm-01
  monto_bancario: number;
}

export default async function ConciliacionesPage() {
  await requireModulo("conciliaciones");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: movimientos } = await supabase
    .from("movimientos_bancarios")
    .select("monto, fecha, plataforma_id, plataformas(nombre), extractos_bancarios!inner(pais_id)")
    .eq("tipo", "deposito")
    .not("plataforma_id", "is", null)
    .eq("extractos_bancarios.pais_id", pais.id);

  const grupos = new Map<string, Grupo>();
  for (const m of movimientos ?? []) {
    const plataforma = m.plataformas as unknown as { nombre: string } | null;
    if (!m.plataforma_id) continue;
    const periodo = `${String(m.fecha).slice(0, 7)}-01`;
    const key = `${m.plataforma_id}|${periodo}`;
    const existente = grupos.get(key);
    if (existente) {
      existente.monto_bancario += Number(m.monto);
    } else {
      grupos.set(key, {
        plataforma_id: m.plataforma_id,
        plataforma_nombre: plataforma?.nombre ?? "?",
        periodo,
        monto_bancario: Number(m.monto),
      });
    }
  }

  const { data: conciliacionesExistentes } = await supabase
    .from("conciliaciones")
    .select("plataforma_id, periodo, monto_reportado_plataforma, diferencia, estado, notas")
    .eq("pais_id", pais.id);

  const existentesPorClave = new Map(
    (conciliacionesExistentes ?? []).map((c) => [`${c.plataforma_id}|${c.periodo}`, c])
  );

  const filas = Array.from(grupos.values()).sort((a, b) => b.periodo.localeCompare(a.periodo));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Conciliación banco vs. plataforma</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Monto bancario = depósitos del extracto ya asignados a cada plataforma. Monto reportado
        por la plataforma se ingresa manualmente hasta que la extracción automática esté lista.
      </p>

      {filas.length === 0 && (
        <EstadoVacio
          mensaje={
            <>
              Todavía no hay depósitos asignados a una plataforma para {pais.nombre}. Ve a{" "}
              <Link href="/extractos" className={linkClass}>
                Extractos
              </Link>{" "}
              y asigna plataforma a los movimientos.
            </>
          }
        />
      )}

      <div className="flex flex-col gap-4">
        {filas.map((f) => {
          const clave = `${f.plataforma_id}|${f.periodo}`;
          const existente = existentesPorClave.get(clave);
          const diferencia = existente ? Number(existente.diferencia) : 0;
          return (
            <form
              key={clave}
              action={upsertConciliacion}
              className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
            >
              <input type="hidden" name="pais_id" value={pais.id} />
              <input type="hidden" name="plataforma_id" value={f.plataforma_id} />
              <input type="hidden" name="periodo" value={f.periodo} />
              <input type="hidden" name="monto_bancario" value={f.monto_bancario} />

              <div>
                <p className={labelClassSm}>Plataforma</p>
                <p className="text-sm font-medium">{f.plataforma_nombre}</p>
              </div>
              <div>
                <p className={labelClassSm}>Período</p>
                <p className="text-sm font-medium">{formatearMes(f.periodo)}</p>
              </div>
              <div>
                <p className={labelClassSm}>Monto bancario</p>
                <p className="text-sm font-medium tabular-nums">{formatearMoneda(f.monto_bancario, pais.codigo)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClassSm}>Monto reportado por plataforma</label>
                <input
                  type="number"
                  step="0.01"
                  name="monto_reportado_plataforma"
                  defaultValue={existente?.monto_reportado_plataforma ?? ""}
                  className={`${fieldClass} w-36 tabular-nums`}
                  required
                />
              </div>
              <div>
                <p className={labelClassSm}>Diferencia</p>
                <p
                  className={`text-sm font-medium tabular-nums ${
                    existente && Math.abs(diferencia) > 0.01 ? "text-destructive" : "text-success"
                  }`}
                >
                  {existente ? formatearMoneda(diferencia, pais.codigo) : "—"}
                </p>
              </div>
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <label className={labelClassSm}>Notas</label>
                <input
                  type="text"
                  name="notas"
                  defaultValue={existente?.notas ?? ""}
                  className={`${fieldClass} w-full`}
                />
              </div>
              <Button type="submit">Guardar</Button>
            </form>
          );
        })}
      </div>
    </main>
  );
}
