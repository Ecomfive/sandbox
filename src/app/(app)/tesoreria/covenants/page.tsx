import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto } from "@/lib/af4/fecha";
import { dinero, veces } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarBaseCovenants, cargarBaseDeuda, cargarCovenants, cargarOfertas, SIN_MIGRACION_0946 } from "@/lib/finanzas/cargar-deuda-avanzada";
import { SIN_MIGRACION_DEUDA } from "@/lib/finanzas/cargar-tesoreria";
import { defIndicador, INDICADORES_COVENANT, valorIndicador, type ValoresCovenant } from "@/lib/finanzas/covenants";
import { contratosCovenant, evaluarCovenants, nombreContrato, serieEscenario } from "@/lib/finanzas/escenarios-deuda";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { TablaSimple } from "../piezas-deuda";
import { TablaCovenants, type FilaCovenant } from "./vista-covenants";

export const metadata = { title: "Covenants" };

export const dynamic = "force-dynamic";

const fmt = (v: number | null, f: "veces" | "dinero") => (v === null ? "—" : f === "veces" ? veces(v, 2) : dinero(v));

export default async function CovenantsPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [base, ofertasR, covenantsR, baseCov] = await Promise.all([cargarBaseDeuda(supabase, hoy), cargarOfertas(supabase), cargarCovenants(supabase), cargarBaseCovenants(supabase, hoy)]);
  if (!base) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Covenants" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_DEUDA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria") && !covenantsR.sinMigracion;
  const contratos = contratosCovenant(base.deuda, ofertasR.ofertas);
  const meses = "error" in baseCov ? [] : baseCov.meses;
  const evaluados = evaluarCovenants(covenantsR.covenants, meses, base.instrumentos, ofertasR.ofertas, hoy);
  const filas: FilaCovenant[] = evaluados.map((e) => {
    const d = defIndicador(e.covenant.indicador);
    return {
      id: e.covenant.id,
      indicador: d.corto,
      formato: d.formato,
      sentido: d.sentido,
      umbral: e.covenant.umbral,
      contrato: nombreContrato(e.covenant, contratos),
      valor: e.valor,
      estado: e.estado,
      peor: e.peor,
      serie: e.serie,
      primerIncumplimiento: e.primerIncumplimiento,
      nota: e.covenant.nota,
    };
  });
  const cuenta = (est: string) => evaluados.filter((e) => e.peor === est).length;
  const proyeccion = meses.length ? serieEscenario(meses, base.instrumentos, base.instrumentos, hoy) : [];
  const columnas: { etiqueta: string; valores: ValoresCovenant; proyectado: boolean }[] = [
    ...meses.map((m) => ({ etiqueta: mesCorto(m.corte), valores: m.valores, proyectado: false })),
    ...proyeccion.map((m) => ({ etiqueta: `${mesCorto(m.fecha)} (p)`, valores: m.valores, proyectado: true })),
  ];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Covenants" datosHasta={meses.at(-1)?.corte ?? null} />
      {covenantsR.sinMigracion && <AvisoTesoreria>{SIN_MIGRACION_0946}</AvisoTesoreria>}
      {"error" in baseCov && <AvisoTesoreria>Indicadores sin calcular: {baseCov.error}</AvisoTesoreria>}
      <FilaKpiAF4>
        <KpiAF4 titulo="Covenants" destacado valor={String(evaluados.length)} />
        <KpiAF4 titulo="Incumplen" tono={cuenta("incumple") ? "destructive" : "neutral"} valor={String(cuenta("incumple"))} subtexto="Hoy o en 6 meses" />
        <KpiAF4 titulo="En riesgo" tono={cuenta("riesgo") ? "warning" : "neutral"} valor={String(cuenta("riesgo"))} subtexto="A menos del 10 % del umbral" />
        <KpiAF4 titulo="Cumplen" tono={cuenta("cumple") ? "success" : "neutral"} valor={String(cuenta("cumple"))} />
      </FilaKpiAF4>
      <TablaCovenants filas={filas} contratos={contratos} puedeEscribir={puedeEscribir} />
      {columnas.length > 0 && (
        <TablaSimple
          id="tabla-indicadores-covenants"
          titulo="Indicadores por mes"
          detalle="Cierres y proyección (p) con la deuda programada"
          columnas={[{ etiqueta: "Indicador" }, ...columnas.map((c) => ({ etiqueta: c.etiqueta, numero: true }))]}
          filas={INDICADORES_COVENANT.map((i) => ({
            clave: i.clave,
            celdas: [
              i.corto,
              ...columnas.map((c, k) => (
                <span key={k} className={c.proyectado ? "text-muted-foreground" : ""}>
                  {i.clave === "deuda_ebitda_max" && c.valores.deudaEbitdaNoSignificativa ? "n. s." : fmt(valorIndicador(i.clave, c.valores), i.formato)}
                </span>
              )),
            ],
          }))}
        />
      )}
    </Pagina>
  );
}
