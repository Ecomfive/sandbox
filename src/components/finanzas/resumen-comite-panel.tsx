import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiGroup } from "@/components/ui/kpi-card";
import { hoyPanama, mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dineroKpi, dinero, entero, porcentaje } from "@/lib/af4/formato";
import { cargarBasePauta } from "@/lib/finanzas/cargar-comite";
import { semaforo, seriePauta, TONO_SEMAFORO, defIndicador } from "@/lib/finanzas/comite";
import { pautaPorTienda, sobreTecho } from "@/lib/finanzas/pauta";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * La pauta de las tiendas propias en el Panel financiero (mejora 6): el % del último mes cerrado contra la meta del comité
 * y las tiendas sobre su techo en el mes en curso (proyectado) con lo que vale bajar al techo. Se carga aparte, dentro de un
 * `Suspense`; sin la migración 0942 no se muestra.
 */
export async function ResumenComitePanel() {
  const hoy = hoyPanama();
  const enCurso = `${hoy.slice(0, 7)}-01`;
  const cerrado = sumarMeses(enCurso, -1);
  const base = await cargarBasePauta(createServiceClient(), sumarMeses(enCurso, -6), enCurso, hoy);
  if ("error" in base || !base.propias.length) return null;
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(cerrado, i - 5));
  const serie = seriePauta(base.filas, meses, base.propias);
  const valor = serie[serie.length - 1].valor;
  const def = defIndicador("pauta_ventas");
  const meta = base.config.metas.pauta_ventas;
  const curso = pautaPorTienda(base.filas, [enCurso], base.propias, base.techo, hoy).filter(sobreTecho);
  const cerradoSobre = pautaPorTienda(base.filas, [cerrado], base.propias, base.techo, hoy).filter(sobreTecho);
  const excedente = curso.reduce((a, p) => a + p.excedente, 0);
  return (
    <KpiGroup titulo="Pauta de tiendas propias · USD">
      <FilaKpiAF4>
        <KpiAF4
          titulo={`Pauta ÷ ventas ${mesCorto(cerrado)}`}
          valor={porcentaje(valor)}
          tono={TONO_SEMAFORO[semaforo(def, valor, meta, base.config.partida.pauta_ventas)]}
          serie={serie.some((p) => p.valor !== null) ? serie.map((p) => p.valor ?? Number.NaN) : undefined}
          subtexto={`Meta ≤ ${porcentaje(meta, { decimales: 0 })}`}
          href="/panel-financiero/comite"
        />
        <KpiAF4
          titulo={`Sobre el techo · ${mesCorto(enCurso)} proyectado`}
          valor={entero(curso.length)}
          tono={curso.length ? "destructive" : "success"}
          subtexto={curso.length ? `Bajar al techo vale ${dinero(excedente)} en el mes` : `${entero(cerradoSobre.length)} en ${mesCorto(cerrado)}`}
          href="/rentabilidad"
        />
        <KpiAF4 titulo="Excedente al año" valor={dineroKpi(excedente * 12)} tono={excedente > 0 ? "warning" : "neutral"} href="/panel-financiero/comite" />
      </FilaKpiAF4>
    </KpiGroup>
  );
}
