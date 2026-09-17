import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarSaldo, registrarRetiro } from "./actions";
import { EstadoRetiroSelect } from "@/components/estado-retiro-select";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function RetirosPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: saldos }, { data: retiros }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("saldos_wallet")
      .select("plataforma_id, monto, fecha, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fecha", { ascending: false }),
    supabase
      .from("retiros")
      .select("id, monto, fecha, estado, notas, plataforma_id, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fecha", { ascending: false })
      .limit(50),
  ]);

  const ultimoSaldoPorPlataforma = new Map<string, { monto: number; fecha: string; nombre: string }>();
  for (const s of saldos ?? []) {
    if (!ultimoSaldoPorPlataforma.has(s.plataforma_id)) {
      ultimoSaldoPorPlataforma.set(s.plataforma_id, {
        monto: Number(s.monto),
        fecha: s.fecha,
        nombre: (s.plataformas as unknown as { nombre: string } | null)?.nombre ?? "?",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Retiros y wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — saldo de wallet por plataforma y seguimiento de retiros. Se registra a
          mano hasta que haya extracción automática confiable.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Saldo de wallet</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {(plataformas ?? []).map((p) => {
            const ultimo = ultimoSaldoPorPlataforma.get(p.id);
            return (
              <div key={p.id} className="min-w-[10rem] rounded-lg border border-border bg-card p-4">
                <p className="text-sm font-medium">{p.nombre}</p>
                {ultimo ? (
                  <>
                    <p className="mt-1 text-lg font-semibold tabular-nums">
                      {ultimo.monto.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">al {ultimo.fecha}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Sin registrar</p>
                )}
              </div>
            );
          })}
        </div>

        <form
          action={registrarSaldo}
          className="mt-4 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Plataforma</label>
            <select name="plataforma_id" required className={fieldClass}>
              {(plataformas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Saldo actual</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              className={`${fieldClass} w-32 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Fecha</label>
            <input
              type="date"
              name="fecha"
              defaultValue={hoy()}
              required
              className={fieldClass}
            />
          </div>
          <Button type="submit" variant="secondary">
            Registrar saldo
          </Button>
        </form>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Registrar retiro</h2>
        <form
          action={registrarRetiro}
          className="mt-3 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Plataforma</label>
            <select name="plataforma_id" required className={fieldClass}>
              {(plataformas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Monto</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              className={`${fieldClass} w-32 tabular-nums`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Fecha</label>
            <input type="date" name="fecha" defaultValue={hoy()} required className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Estado</label>
            <select name="estado" defaultValue="solicitado" className={fieldClass}>
              <option value="solicitado">Solicitado</option>
              <option value="procesado">Procesado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
          <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
            <label className={labelClass}>Notas</label>
            <input type="text" name="notas" className={fieldClass} />
          </div>
          <Button type="submit">Registrar retiro</Button>
        </form>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Retiros recientes</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Plataforma</th>
                <th className="py-2 pr-3 font-medium">Monto</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {(retiros ?? []).map((r) => {
                const plataforma = r.plataformas as unknown as { nombre: string } | null;
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">{r.fecha}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{plataforma?.nombre}</td>
                    <td className="py-2 pr-3 tabular-nums">{Number(r.monto).toFixed(2)}</td>
                    <td className="py-2 pr-3">
                      <EstadoRetiroSelect id={r.id} estadoActual={r.estado} />
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.notas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(retiros ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Todavía no hay retiros registrados.</p>
          )}
        </div>
      </div>
    </main>
  );
}
