import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarGasto } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";
import { CATEGORIAS } from "./def-gastos";
import { TablaGastos } from "./tabla-gastos";

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

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
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Nómina y gastos" oculto>
        {pais.nombre} — registro de gastos operativos, incluida la nómina.
      </EncabezadoPagina>

      <div>
        {gastosMes.length === 0 ? (
          <>
            <h2 className="text-sm font-semibold tracking-tight">Este mes</h2>
            <EstadoVacio mensaje={`Todavía no hay gastos registrados para ${mesActual}.`} />
          </>
        ) : (
          <KpiGroup titulo="Este mes">
            <KpiGrid>
              <KpiCard titulo="Total del mes" valor={formatearMoneda(totalMes, pais.codigo)} />
              {CATEGORIAS.filter((c) => totalesPorCategoria.has(c.valor)).map((c) => (
                <KpiCard
                  key={c.valor}
                  titulo={c.etiqueta}
                  valor={formatearMoneda(totalesPorCategoria.get(c.valor) ?? 0, pais.codigo)}
                />
              ))}
            </KpiGrid>
          </KpiGroup>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Registrar gasto</h2>
        <FormularioConToast
          action={registrarGasto}
          mensajeExito="Gasto registrado"
          className="mt-3 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
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
        </FormularioConToast>
      </div>

      <div>
        <h2 className="text-sm font-semibold tracking-tight">Gastos recientes</h2>
        <div className="mt-3">
          <TablaGastos
            gastos={(gastos ?? []).map((g) => ({
              id: g.id,
              categoria: g.categoria,
              descripcion: g.descripcion,
              monto: Number(g.monto),
              fecha: g.fecha,
            }))}
            codigoPais={pais.codigo}
          />
        </div>
      </div>
    </Pagina>
  );
}
