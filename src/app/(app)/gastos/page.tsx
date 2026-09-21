import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { registrarGasto } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { KpiGroup } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { formatearMoneda } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";
import { CATEGORIAS } from "./def-gastos";
import { TablaGastos } from "./tabla-gastos";
import { TarjetasGastosMes } from "./tarjetas-mes";
import { pideCrear } from "@/lib/crear-global";

export const metadata = { title: "Nómina y gastos" };

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("gastos");
  // El botón «Crear» de la barra llega con `?nuevo=1`: el cursor cae en el primer campo del formulario.
  const enfocarFormulario = pideCrear((await searchParams).nuevo);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: gastos } = await supabase
    .from("gastos")
    .select("id, categoria, descripcion, monto, fecha")
    .eq("pais_id", pais.id)
    .order("fecha", { ascending: false })
    .limit(100);

  const mesActual = hoy().slice(0, 7);
  const ultimoDiaDelMes = `${mesActual}-${String(new Date(Number(mesActual.slice(0, 4)), Number(mesActual.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
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
            <TarjetasGastosMes
              total={formatearMoneda(totalMes, pais.codigo)}
              categorias={CATEGORIAS.filter((c) => totalesPorCategoria.has(c.valor)).map((c) => ({
                valor: c.valor,
                etiqueta: c.etiqueta,
                monto: formatearMoneda(totalesPorCategoria.get(c.valor) ?? 0, pais.codigo),
              }))}
              mesDesde={`${mesActual}-01`}
              mesHasta={ultimoDiaDelMes}
            />
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
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Categoría</span>
            <select name="categoria" required autoFocus={enfocarFormulario} className={fieldClass}>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className={labelClass}>Descripción</span>
            <input type="text" name="descripcion" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Monto</span>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              className={`${fieldClass} w-32 tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Fecha</span>
            <input type="date" name="fecha" defaultValue={hoy()} required className={fieldClass} />
          </label>
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
