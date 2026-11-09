import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama } from "@/lib/af4/fecha";
import { dineroKpi, entero, numero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarConfigCapital, cargarProyectos, costoFinancieroActual } from "@/lib/finanzas/cargar-capital";
import { evaluar, seguimiento, tasaDescuento } from "@/lib/finanzas/evaluacion-proyectos";
import { createServiceClient } from "@/lib/supabase/server";
import { AjusteWacc, ListaProyectos, type FilaProyecto } from "./proyectos-cliente";

export const metadata = { title: "Proyectos" };

export const dynamic = "force-dynamic";

const FUENTE: Record<string, string> = {
  wacc: "WACC guardado",
  costo_financiero: "Costo financiero mezclado del comité",
  predeterminada: "Sin WACC ni costo financiero: 15 %",
  proyecto: "Tasa del proyecto",
};

export default async function ProyectosPage() {
  const usuario = await requireModulo("capital-riesgo");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Capital y riesgo" />;
  const escribe = !usuario.modulosSoloLectura.includes("capital-riesgo");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const [proyectos, config, costo] = await Promise.all([cargarProyectos(supabase), cargarConfigCapital(supabase), costoFinancieroActual(supabase, hoy)]);
  if ("error" in proyectos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Evaluación de proyectos" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{proyectos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const portal = tasaDescuento(null, config.wacc, costo);
  const filas: FilaProyecto[] = proyectos.map((p) => {
    const tasa = p.tasa ?? portal.tasa;
    const e = evaluar(p.flujos, tasa / 100, p.periodicidad);
    return { ...p, tasaUsada: tasa, van: e.van, tirAnual: e.tirAnual, multiplesTir: e.tir.motivo === "multiples", payback: e.payback, indice: e.indice, inversion: e.inversionTotal };
  });
  const aprobados = filas.filter((p) => p.estado === "aprobado");
  const borradores = filas.filter((p) => p.estado === "borrador");
  const conSeguimiento = aprobados
    .map((p) => seguimiento(p.flujos, p.reales, p.tasaUsada / 100, p.periodicidad))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const diferencia = conSeguimiento.reduce((a, s) => a + s.diferencia, 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Evaluación de proyectos" datosHasta={hoy} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Tasa de descuento" destacado valor={`${numero(portal.tasa, 1)} %`} subtexto={FUENTE[portal.fuente]} />
        <KpiAF4 titulo="Por decidir" tono={borradores.length ? "warning" : "neutral"} valor={entero(borradores.length)} subtexto={`VAN ${dineroKpi(borradores.reduce((a, p) => a + p.van, 0))}`} />
        <KpiAF4 titulo="Aprobados" valor={entero(aprobados.length)} subtexto={`Inversión ${dineroKpi(aprobados.reduce((a, p) => a + p.inversion, 0))} · VAN ${dineroKpi(aprobados.reduce((a, p) => a + p.van, 0))}`} />
        <KpiAF4
          titulo="Real contra prometido"
          tono={conSeguimiento.length ? (diferencia >= 0 ? "success" : "destructive") : "neutral"}
          valor={conSeguimiento.length ? dineroKpi(diferencia) : "Sin datos reales"}
          subtexto={`${entero(conSeguimiento.length)} proyectos con seguimiento`}
        />
      </FilaKpiAF4>
      <ListaProyectos filas={filas} tasaPortal={portal.tasa} escribe={escribe} />
      {escribe && (
        <MarcoAF4 id="ajuste-wacc" titulo="Tasa de descuento del portal" detalle={costo === null ? "Costo financiero sin datos" : `Costo financiero mezclado ${numero(costo, 1)} %`}>
          <AjusteWacc wacc={config.wacc} sugerido={costo ?? portal.tasa} />
        </MarcoAF4>
      )}
    </Pagina>
  );
}
