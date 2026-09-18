import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarSaldo, registrarRetiro } from "./actions";
import { EstadoRetiroSelect } from "@/components/estado-retiro-select";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function RetirosPage() {
  await requireModulo("retiros");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformasPais }, { data: saldos }, { data: retiros }] = await Promise.all([
    supabase
      .from("pais_plataformas")
      .select("plataforma_id, plataformas(id, nombre)")
      .eq("pais_id", pais.id),
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

  const plataformas = (plataformasPais ?? [])
    .map((pp) => pp.plataformas as unknown as { id: string; nombre: string } | null)
    .filter((p): p is { id: string; nombre: string } => p !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

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
        <div className="mt-3">
          <KpiGrid>
            {(plataformas ?? []).map((p) => {
              const ultimo = ultimoSaldoPorPlataforma.get(p.id);
              return (
                <KpiCard
                  key={p.id}
                  titulo={p.nombre}
                  valor={ultimo ? formatearMoneda(ultimo.monto, pais.codigo) : "Sin registrar"}
                  subtexto={ultimo ? `al ${formatearFecha(ultimo.fecha)}` : undefined}
                />
              );
            })}
          </KpiGrid>
        </div>

        <FormularioConToast
          action={registrarSaldo}
          mensajeExito="Saldo registrado"
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
        </FormularioConToast>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Registrar retiro</h2>
        <FormularioConToast
          action={registrarRetiro}
          mensajeExito="Retiro registrado"
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
        </FormularioConToast>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Retiros recientes</h2>
        <div className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
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
                    <td className="py-2 pr-3 pl-4">{formatearFecha(r.fecha)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{plataforma?.nombre}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatearMoneda(Number(r.monto), pais.codigo)}</td>
                    <td className="py-2 pr-3">
                      <EstadoRetiroSelect id={r.id} estadoActual={r.estado} />
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.notas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(retiros ?? []).length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
        </div>
      </div>
    </main>
  );
}
