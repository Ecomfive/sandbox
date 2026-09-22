import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { KpiGroup } from "@/components/ui/kpi-card";
import { requireModulo } from "@/lib/auth";
import { formatearMoneda } from "@/lib/formato";
import { CATEGORIAS } from "./def-gastos";
import { TablaGastos } from "./tabla-gastos";
import { TarjetasGastosMes } from "./tarjetas-mes";

export const metadata = { title: "Nómina y gastos" };

export const dynamic = "force-dynamic";

const hoy = () => new Date().toISOString().slice(0, 10);

export default async function GastosPage() {
  const usuario = await requireModulo("gastos");
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
      <EncabezadoPagina titulo="Nómina y gastos" oculto />

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

      <TablaGastos
        gastos={(gastos ?? []).map((g) => ({
          id: g.id,
          categoria: g.categoria,
          descripcion: g.descripcion,
          monto: Number(g.monto),
          fecha: g.fecha,
        }))}
        codigoPais={pais.codigo}
        paisId={pais.id}
        puedeEscribir={!usuario.modulosSoloLectura.includes("gastos")}
      />
    </Pagina>
  );
}
