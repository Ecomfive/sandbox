import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto, rangoMeses, ultimosMeses } from "@/lib/af4/fecha";
import { dineroKpi, porcentaje } from "@/lib/af4/formato";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { requireModulo } from "@/lib/auth";
import { SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { comisionesPorMes, costoCobroPorMedio, etiquetaComision, FUENTES_COMISION, type FilaComision, type FilaCostoCobro } from "@/lib/finanzas/tesoreria";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";

export const metadata = { title: "Costos de cobro" };

export const dynamic = "force-dynamic";

const PERIODOS = [
  { valor: "u3", etiqueta: "3 meses", meses: 3 },
  { valor: "u6", etiqueta: "6 meses", meses: 6 },
  { valor: "u12", etiqueta: "12 meses", meses: 12 },
];

export default async function CostosCobroPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const sp = await searchParams;
  const periodo = PERIODOS.find((p) => p.valor === sp.periodo) ?? PERIODOS[1];
  const hoy = hoyPanama();
  const meses = ultimosMeses(hoy, periodo.meses);
  const supabase = createServiceClient();
  const [com, cob] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((a, b) => supabase.rpc("fin_tesoreria_comisiones", { p_desde: meses[0] }).range(a, b)),
    traerTodasConError<Record<string, unknown>>((a, b) => supabase.rpc("fin_tesoreria_costo_cobro", { p_desde: meses[0] }).range(a, b)),
  ]);
  const filtros = (
    <ControlSegmentado etiqueta="Elegir período" opciones={PERIODOS.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta, href: `/tesoreria/comisiones?periodo=${p.valor}` }))} elegido={periodo.valor} />
  );
  if (com.error || cob.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Costos de cobro" filtros={filtros} imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const comisiones = comisionesPorMes(
    (com.data ?? []).map((x) => ({ mes: String(x.mes).slice(0, 10), fuente: x.fuente as FilaComision["fuente"], concepto: String(x.concepto), monto: Number(x.monto) })),
    meses,
  );
  const medios = costoCobroPorMedio(
    (cob.data ?? []).map((x) => ({ mes: String(x.mes).slice(0, 10), metodo: String(x.metodo), ordenes: Number(x.ordenes), ventas: Number(x.ventas), comision: Number(x.comision) })) as FilaCostoCobro[],
    meses,
  );
  const columnas = meses.map((m) => ({ clave: m, etiqueta: mesCorto(m) }));

  const filasComision: FilaAF4[] = [];
  for (const f of FUENTES_COMISION) {
    const deFuente = comisiones.filter((c) => c.fuente === f.clave);
    if (!deFuente.length) continue;
    filasComision.push({ clave: f.clave, etiqueta: f.etiqueta, tipo: "seccion", valores: meses.map((_, i) => deFuente.reduce((a, c) => a + c.valores[i], 0)) });
    for (const c of deFuente) filasComision.push({ clave: `${f.clave}|${c.concepto}`, etiqueta: etiquetaComision(c.concepto), tipo: "detalle", padre: f.clave, valores: c.valores });
  }

  const ventasTotal = medios.reduce((a, m) => a + m.ventasTotal, 0);
  const costoTotal = medios.reduce((a, m) => a + m.costoTotal, 0);
  const filasCosto: FilaAF4[] = [];
  for (const m of medios) {
    if (m.ventasTotal <= 0 && m.costoTotal <= 0) continue;
    filasCosto.push({ clave: m.medio, etiqueta: m.etiqueta, tipo: "seccion", valores: m.costo });
    filasCosto.push({ clave: `${m.medio}|ventas`, etiqueta: "Ventas cobradas", tipo: "detalle", padre: m.medio, valores: m.ventas });
    filasCosto.push({ clave: `${m.medio}|pct`, etiqueta: "% de la venta", tipo: "porcentaje", valores: m.pct, total: m.pctTotal });
  }
  filasCosto.push({ clave: "total", etiqueta: "Costo de cobrar", tipo: "total", valores: meses.map((_, i) => medios.reduce((a, m) => a + m.costo[i], 0)) });
  filasCosto.push({
    clave: "total-pct",
    etiqueta: "% de la venta",
    tipo: "porcentaje",
    valores: meses.map((_, i) => {
      const v = medios.reduce((a, m) => a + m.ventas[i], 0);
      return v > 0 ? (medios.reduce((a, m) => a + m.costo[i], 0) / v) * 100 : null;
    }),
    total: ventasTotal > 0 ? (costoTotal / ventasTotal) * 100 : null,
  });
  // El libro y los extractos ven la misma comisión: por mes se toma la mayor de las dos, no la suma.
  const deFuente = (f: string, i: number) => comisiones.filter((c) => c.fuente === f).reduce((a, c) => a + c.valores[i], 0);
  const comisionesBanco = meses.reduce((a, _, i) => a + Math.max(deFuente("libro", i), deFuente("banco", i)), 0);
  const masCaro = [...medios].filter((m) => m.pctTotal !== null && m.ventasTotal > 0).sort((a, b) => (b.pctTotal ?? 0) - (a.pctTotal ?? 0))[0];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Costos de cobro" filtros={filtros} datosHasta={meses.at(-1)} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Costo de cobrar" destacado valor={dineroKpi(costoTotal)} subtexto={ventasTotal > 0 ? `${porcentaje((costoTotal / ventasTotal) * 100)} de la venta` : undefined} />
        <KpiAF4 titulo="Ventas cobradas" valor={dineroKpi(ventasTotal)} />
        <KpiAF4 titulo="Comisiones bancarias" valor={dineroKpi(comisionesBanco)} subtexto="Libro y extractos" />
        <KpiAF4 titulo="Medio más caro" valor={masCaro ? masCaro.etiqueta : "—"} subtexto={masCaro?.pctTotal !== null && masCaro ? `${porcentaje(masCaro.pctTotal)} de la venta` : undefined} />
      </FilaKpiAF4>
      {filasCosto.length > 2 ? (
        <TablaFinanciera
          id="tabla-costo-cobro"
          titulo="Costo de cobrar por medio de pago"
          detalle={`${rangoMeses(meses)} · USD`}
          columnas={columnas}
          filas={filasCosto}
          desplegado="nada"
          ariaLabel="Costo de cobrar por medio de pago y mes"
          textoDesplegar="ventas"
        />
      ) : (
        <EstadoVacioAF4 titulo="Sin ventas entregadas en el período" compacto />
      )}
      {filasComision.length > 0 ? (
        <TablaFinanciera
          id="tabla-comisiones"
          titulo="Comisiones bancarias y de pasarela"
          detalle={`${rangoMeses(meses)} · USD`}
          columnas={columnas}
          filas={filasComision}
          ariaLabel="Comisiones por mes, fuente y concepto"
          textoDesplegar="conceptos"
        />
      ) : (
        <EstadoVacioAF4 titulo="Sin comisiones en el período" compacto />
      )}
    </Pagina>
  );
}
