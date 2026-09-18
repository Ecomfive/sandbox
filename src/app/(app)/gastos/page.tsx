import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarGasto, eliminarGasto } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

const CATEGORIAS = [
  { valor: "nomina", etiqueta: "Nómina" },
  { valor: "alquiler", etiqueta: "Alquiler" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "marketing", etiqueta: "Marketing" },
  { valor: "logistica", etiqueta: "Logística" },
  { valor: "otros", etiqueta: "Otros" },
] as const;

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;

export default async function GastosPage() {
  await requireModulo("gastos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: gastos } = await supabase
    .from("gastos")
    .select("id, categoria, descripcion, monto, fecha")
    .eq("pais_id", pais.id)
    .order("fecha", { ascending: false })
    .limit(100);

  const mesActual = hoy().slice(0, 7);
  const gastosMes = (gastos ?? []).filter((g) => g.fecha.slice(0, 7) === mesActual);
  const totalMes = gastosMes.reduce((acc, g) => acc + Number(g.monto), 0);

  const totalesPorCategoria = new Map<string, number>();
  for (const g of gastosMes) {
    totalesPorCategoria.set(g.categoria, (totalesPorCategoria.get(g.categoria) ?? 0) + Number(g.monto));
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Nómina y gastos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — registro de gastos operativos, incluida la nómina.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Este mes</h2>
        {gastosMes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Todavía no hay gastos registrados para {mesActual}.
          </p>
        ) : (
          <div className="mt-3">
            <KpiGrid>
              <KpiCard titulo="Total del mes" valor={totalMes.toFixed(2)} />
              {CATEGORIAS.filter((c) => totalesPorCategoria.has(c.valor)).map((c) => (
                <KpiCard key={c.valor} titulo={c.etiqueta} valor={(totalesPorCategoria.get(c.valor) ?? 0).toFixed(2)} />
              ))}
            </KpiGrid>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Registrar gasto</h2>
        <form
          action={registrarGasto}
          className="mt-3 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
        >
          <input type="hidden" name="pais_id" value={pais.id} />
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Categoría</label>
            <select name="categoria" required className={fieldClass}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <label className={labelClass}>Descripción</label>
            <input type="text" name="descripcion" required className={fieldClass} />
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
          <Button type="submit">Registrar gasto</Button>
        </form>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Gastos recientes</h2>
        <div className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Categoría</th>
                <th className="py-2 pr-3 font-medium">Descripción</th>
                <th className="py-2 pr-3 font-medium">Monto</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(gastos ?? []).map((g) => (
                <tr key={g.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 pl-4">{g.fecha}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{etiquetaCategoria(g.categoria)}</td>
                  <td className="py-2 pr-3">{g.descripcion}</td>
                  <td className="py-2 pr-3 tabular-nums">{Number(g.monto).toFixed(2)}</td>
                  <td className="py-2 pr-3">
                    <form action={eliminarGasto}>
                      <input type="hidden" name="id" value={g.id} />
                      <Button type="submit" variant="ghost" className="text-xs">
                        Eliminar
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(gastos ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Todavía no hay gastos registrados.</p>
          )}
        </div>
      </div>
    </main>
  );
}
