import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama } from "@/lib/af4/fecha";
import { dineroKpi } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarConfigTesoreria, cargarSemanasRepartidores, DIAS_DEPOSITOS, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { antiguedadEfectivo, depositosRepartidores } from "@/lib/finanzas/tesoreria";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { TablaAntiguedad, TablaDepositos } from "./tablas-repartidores";

export const metadata = { title: "Repartidores" };

export const dynamic = "force-dynamic";

export default async function RepartidoresTesoreriaPage() {
  await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [config, semanas] = await Promise.all([cargarConfigTesoreria(supabase), cargarSemanasRepartidores(supabase, hoy)]);
  if (!semanas) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Repartidores" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const depositos = depositosRepartidores(semanas, hoy, config.toleranciaDeposito);
  const antiguedad = antiguedadEfectivo(depositos, config.efectivoDias);
  const sinRendir = antiguedad.reduce((a, x) => a + x.total, 0);
  const viejo = antiguedad.filter((x) => x.alerta).reduce((a, x) => a + x.total, 0);
  const faltan = depositos.filter((d) => d.estado === "faltante");
  const incompletos = depositos.filter((d) => d.estado === "incompleto");
  const suma = (xs: typeof depositos) => xs.reduce((a, d) => a + d.faltante, 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Repartidores" />
      <FilaKpiAF4>
        <KpiAF4 titulo="Efectivo sin rendir" destacado valor={dineroKpi(sinRendir)} subtexto={`Últimos ${DIAS_DEPOSITOS} días`} />
        <KpiAF4 titulo={`Con más de ${config.efectivoDias} días`} tono={viejo > 0 ? "destructive" : "success"} valor={dineroKpi(viejo)} />
        <KpiAF4 titulo="Semanas sin depósito" tono={faltan.length ? "destructive" : "success"} valor={String(faltan.length)} subtexto={faltan.length ? dineroKpi(suma(faltan)) : undefined} />
        <KpiAF4 titulo="Depósitos incompletos" tono={incompletos.length ? "warning" : "success"} valor={String(incompletos.length)} subtexto={incompletos.length ? dineroKpi(suma(incompletos)) : undefined} />
      </FilaKpiAF4>
      <section aria-labelledby="titulo-antiguedad" className="flex flex-col gap-2">
        <h2 id="titulo-antiguedad" className="text-sm font-semibold">
          Antigüedad del efectivo
        </h2>
        <TablaAntiguedad filas={antiguedad} />
      </section>
      <section aria-labelledby="titulo-depositos" className="flex flex-col gap-2">
        <h2 id="titulo-depositos" className="text-sm font-semibold">
          Depósitos frente a lo cobrado
        </h2>
        <TablaDepositos filas={depositos} />
      </section>
    </Pagina>
  );
}
