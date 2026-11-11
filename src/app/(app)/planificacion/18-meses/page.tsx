import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesCorto } from "@/lib/af4/fecha";
import { dinero, porcentaje } from "@/lib/af4/formato";
import type { ColumnaAF4, FilaAF4 } from "@/lib/af4/tabla-financiera";
import { cargarFotos, cargarPlanesAprobados, entradaDesdeBase } from "@/lib/finanzas/cargar-planificacion";
import { MESES_CONTINUO, armarContinuo, proyectarPlan, totalesComparables, type FilaContinuo } from "@/lib/finanzas/planificacion";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisosPlan, SinDatosPlan, contextoPlan } from "../comun";
import { BotonFoto } from "../formularios";

export const metadata = { title: "18 meses · Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Pronóstico de 18 meses";

function Contra({ etiqueta, t }: { etiqueta: string; t: { actual: number; contra: number } | null }) {
  if (!t) return <>{`Sin ${etiqueta}`}</>;
  const d = t.actual - t.contra;
  const pct = t.contra ? (d / Math.abs(t.contra)) * 100 : null;
  return <>{`${dinero(d, "USD", { conSigno: true })}${pct !== null ? ` (${porcentaje(pct, { conSigno: true })})` : ""} contra ${etiqueta}`}</>;
}

export default async function DieciochoPage() {
  const { base, puedeEscribir } = await contextoPlan();
  if ("error" in base) return <SinDatosPlan pagina={TITULO} titulo="No se pudo leer la planificación">{base.error}</SinDatosPlan>;
  if (!base.veTodo) return <SinDatosPlan pagina={TITULO} titulo="El pronóstico consolidado es de toda la empresa" />;
  if (base.sinHistoria) return <SinDatosPlan pagina={TITULO} titulo="Falta la historia de ventas por tienda">{base.sinHistoria}</SinDatosPlan>;
  const entrada = entradaDesdeBase(base, MESES_CONTINUO);
  if (!entrada) return <SinDatosPlan pagina={TITULO} titulo="Sin balance de apertura">{base.avisos.join(" ")}</SinDatosPlan>;
  const supabase = createServiceClient();
  const r = proyectarPlan(entrada);
  const anios = [...new Set([...base.reales, ...r.consolidado].map((m) => Number(m.periodo.slice(0, 4))))];
  const [plan, fotos] = await Promise.all([cargarPlanesAprobados(supabase, anios), cargarFotos(supabase)]);
  // La foto anterior: la del cierre previo al actual (la del mismo corte es la de hoy).
  const anterior = (fotos ?? []).find((f) => f.periodo < base.corte) ?? null;
  const deHoy = (fotos ?? []).find((f) => f.periodo === base.corte) ?? null;
  const filas = armarContinuo(base.reales, r.consolidado, plan, anterior?.foto ?? null);

  const otrosPorMes = new Map(r.consolidado.map((m) => [m.periodo, m.otrosLibro]));
  // Conciliación: el primer mes proyectado contra el EBITDA real (EERR) promedio de los últimos 3 meses.
  const ult3 = base.reales.slice(-3);
  const realPromedio = ult3.length ? ult3.reduce((a, m) => a + m.ebitda, 0) / ult3.length : null;
  const primerProyectado = r.consolidado[0]?.ebitda ?? null;
  const salto = realPromedio !== null && primerProyectado !== null ? primerProyectado - realPromedio : null;
  const columnas: ColumnaAF4[] = filas.map((f) => ({ clave: f.periodo, etiqueta: mesCorto(f.periodo), detalle: f.real ? "Real" : "Pronóstico" }));
  const col = (fn: (f: FilaContinuo) => number | null) => filas.map(fn);
  const tabla: FilaAF4[] = [
    { clave: "ventas", etiqueta: "Ventas", tipo: "detalle", valores: col((f) => f.ventas) },
    { clave: "ingresos", etiqueta: "Ingresos netos", tipo: "seccion", valores: col((f) => f.ingresos) },
    { clave: "otros-libro", etiqueta: "Otros del libro (no explicados por las órdenes)", tipo: "detalle", valores: col((f) => (f.real ? null : (otrosPorMes.get(f.periodo) ?? null))) },
    { clave: "ebitda", etiqueta: "EBITDA", tipo: "subtotal", valores: col((f) => f.ebitda) },
    { clave: "caja", etiqueta: "Caja final", tipo: "saldo", valores: col((f) => f.caja) },
    { clave: "plan-ingresos", etiqueta: "Plan aprobado · ingresos", tipo: "detalle", valores: col((f) => f.plan?.ingresos ?? null) },
    { clave: "plan-ebitda", etiqueta: "Plan aprobado · EBITDA", tipo: "detalle", valores: col((f) => f.plan?.ebitda ?? null) },
    { clave: "vs-plan", etiqueta: "EBITDA contra el plan", tipo: "subtotal", valores: col((f) => (f.plan ? f.ebitda - f.plan.ebitda : null)) },
    { clave: "ant-ebitda", etiqueta: `Pronóstico anterior · EBITDA`, tipo: "detalle", valores: col((f) => f.anterior?.ebitda ?? null) },
    { clave: "vs-ant", etiqueta: "EBITDA contra el pronóstico anterior", tipo: "subtotal", valores: col((f) => (f.anterior ? f.ebitda - f.anterior.ebitda : null)) },
  ];
  const futuras = filas.filter((f) => !f.real);
  const suma = (lista: FilaContinuo[], k: "ingresos" | "ebitda") => lista.reduce((a, f) => a + f[k], 0);
  const datosGrafica = filas.map((f) => ({ etiqueta: mesCorto(f.periodo), real: f.real ? f.ebitda : null, pronostico: f.real ? null : f.ebitda, plan: f.plan?.ebitda ?? null, anterior: f.anterior?.ebitda ?? null }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        datosHasta={base.corte}
        actualizado={deHoy?.creadoEn ?? null}
        acciones={puedeEscribir && !base.sinTablas ? <BotonFoto /> : undefined}
      />
      <AvisosPlan avisos={[...base.avisos, ...(fotos === null ? ["Falta correr la migración 0944 (planificación): sin fotos para comparar."] : [])]} />

      <KpiGroup titulo={`Próximos ${MESES_CONTINUO} meses · real hasta ${mesCorto(base.corte)}`}>
        <FilaKpiAF4>
          <KpiAF4 titulo="Ingresos netos" valor={dinero(suma(futuras, "ingresos"))} subtexto={<Contra etiqueta="el plan" t={totalesComparables(futuras, "plan", "ingresos")} />} />
          <KpiAF4 titulo="EBITDA" valor={dinero(suma(futuras, "ebitda"))} subtexto={<Contra etiqueta="el plan" t={totalesComparables(futuras, "plan", "ebitda")} />} />
          <KpiAF4 titulo="EBITDA contra el pronóstico anterior" valor={anterior ? dinero(suma(futuras.filter((f) => f.anterior), "ebitda") - futuras.reduce((a, f) => a + (f.anterior?.ebitda ?? 0), 0), "USD", { conSigno: true }) : "—"} subtexto={anterior ? `Foto de ${mesCorto(anterior.periodo)} · ${fechaHora(anterior.creadoEn)}` : "Sin foto anterior"} />
          <KpiAF4
            titulo="Salto al pronóstico"
            valor={salto === null ? "—" : dinero(salto, "USD", { conSigno: true })}
            tono={salto !== null && realPromedio !== null && Math.abs(salto) > Math.abs(realPromedio) * 0.25 ? "warning" : "neutral"}
            subtexto={realPromedio === null ? "Sin meses reales" : `${mesCorto(r.consolidado[0].periodo)} ${dinero(primerProyectado)} · real 3 meses ${dinero(realPromedio)} · otros del libro ${dinero(r.consolidado[0].otrosLibro, "USD", { conSigno: true })}`}
          />
          <KpiAF4 titulo="Caja al mes 18" valor={dinero(futuras[futuras.length - 1]?.caja ?? null)} />
          <KpiAF4 titulo="Caja mínima" valor={dinero(Math.min(...futuras.map((f) => f.caja ?? Infinity)))} subtexto={`Mínimo ${dinero(base.supuestos.cajaMinima)}`} />
        </FilaKpiAF4>
      </KpiGroup>

      <GraficaBarrasAF4
        id="titulo-grafica-18"
        titulo="EBITDA real, pronóstico y plan"
        detalle="USD"
        datos={datosGrafica}
        series={[
          { clave: "real", nombre: "Real", color: 1, apilar: "e" },
          { clave: "pronostico", nombre: "Pronóstico", color: 2, apilar: "e" },
          { clave: "plan", nombre: "Plan aprobado", color: 5, forma: "linea", trazo: "rayas" },
          { clave: "anterior", nombre: "Pronóstico anterior", color: 3, forma: "linea", trazo: "puntos" },
        ]}
      />

      <TablaFinanciera id="titulo-tabla-18" titulo="Mes a mes" detalle="USD" columnas={columnas} filas={tabla} ariaLabel="Pronóstico continuo de 18 meses" conTotal={false} />
    </Pagina>
  );
}
