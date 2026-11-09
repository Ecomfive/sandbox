import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { claseCifra } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseTono } from "@/components/ui/badge";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarHistorialRiesgos, cargarIndicadoresRiesgo, cargarRiesgos } from "@/lib/finanzas/cargar-riesgos";
import { ETIQUETA_NIVEL, evaluarRiesgos, mapaCalor, NIVELES, type NivelRiesgo } from "@/lib/finanzas/riesgos";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonEvaluar, TablaRiesgos } from "./riesgos-cliente";

export const metadata = { title: "Capital y riesgo" };

export const dynamic = "force-dynamic";

const TITULO = "Capital y riesgo";

const FONDO: Record<NivelRiesgo, string> = {
  bajo: claseTono("success"),
  medio: claseTono("info"),
  alto: claseTono("warning"),
  critico: claseTono("destructive"),
};

const PUNTO: Record<NivelRiesgo, string> = { bajo: "bg-success", medio: "bg-accent-foreground", alto: "bg-warning", critico: "bg-destructive" };

export default async function CapitalRiesgoPage() {
  const usuario = await requireModulo("capital-riesgo");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo={TITULO} />;
  const escribe = !usuario.modulosSoloLectura.includes("capital-riesgo");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const [rs, valores, historial] = await Promise.all([cargarRiesgos(supabase), cargarIndicadoresRiesgo(supabase, hoy), cargarHistorialRiesgos(supabase)]);
  if ("error" in rs) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Matriz de riesgos" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{rs.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const evaluados = evaluarRiesgos(rs, valores);
  const cuenta = (n: NivelRiesgo) => evaluados.filter((r) => r.nivel === n).length;
  const subieron = evaluados.filter((r) => r.cambio === "sube");
  const sinDato = evaluados.filter((r) => r.indicador && r.valor === null).length;
  const evaluadoEn = evaluados.map((r) => r.evaluadoEn).filter((x): x is string => !!x).sort().pop() ?? null;
  const mapa = mapaCalor(evaluados);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Matriz de riesgos" datosHasta={hoy} actualizado={evaluadoEn} acciones={escribe ? <BotonEvaluar /> : undefined} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Críticos" destacado tono={cuenta("critico") ? "destructive" : "success"} valor={entero(cuenta("critico"))} subtexto={`${entero(evaluados.length)} riesgos activos`} />
        <KpiAF4 titulo="Altos" tono={cuenta("alto") ? "warning" : "success"} valor={entero(cuenta("alto"))} subtexto={`${entero(cuenta("medio"))} medios · ${entero(cuenta("bajo"))} bajos`} />
        <KpiAF4 titulo="Subieron desde la última evaluación" tono={subieron.length ? "destructive" : "neutral"} valor={entero(subieron.length)} subtexto={subieron.slice(0, 2).map((r) => r.nombre).join(" · ") || "Sin cambios"} />
        <KpiAF4 titulo="Indicadores sin dato" tono={sinDato ? "warning" : "neutral"} valor={entero(sinDato)} subtexto="Usan la probabilidad manual" />
      </FilaKpiAF4>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <MarcoAF4 id="mapa-calor" titulo="Mapa de calor" detalle="Probabilidad × impacto">
          <table className="w-full table-fixed border-separate border-spacing-1 text-xs">
            <caption className="sr-only">Riesgos por probabilidad (columnas) e impacto (filas)</caption>
            <thead>
              <tr>
                <th scope="col" className="w-16 text-left font-medium text-muted-foreground">
                  Impacto
                </th>
                {[1, 2, 3, 4, 5].map((p) => (
                  <th key={p} scope="col" className={`font-medium text-muted-foreground ${claseCifra}`}>
                    P{p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mapa.map((fila) => (
                <tr key={fila.impacto}>
                  <th scope="row" className={`text-left font-medium text-muted-foreground ${claseCifra}`}>
                    I{fila.impacto}
                  </th>
                  {fila.celdas.map((c) => (
                    <td key={c.probabilidad} className={`h-12 rounded-md text-center align-middle ${FONDO[c.nivel]}`}>
                      {c.riesgos.length ? (
                        <span
                          className={`text-base font-semibold ${claseCifra}`}
                          aria-label={`${c.riesgos.length} riesgos: ${c.riesgos.map((r) => r.nombre).join(", ")}`}
                        >
                          {c.riesgos.length}
                        </span>
                      ) : (
                        <span aria-hidden="true" className="opacity-40">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {NIVELES.map((n) => (
              <li key={n} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PUNTO[n]}`} />
                {ETIQUETA_NIVEL[n]}
              </li>
            ))}
          </ul>
        </MarcoAF4>
        <MarcoAF4 id="riesgos-principales" titulo="Los más altos">
          <ol className="flex flex-col gap-2 text-sm">
            {evaluados.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border pb-2 last:border-0">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[r.nivel]}`} />
                  {r.nombre}
                </span>
                <span className={`text-muted-foreground ${claseCifra}`}>
                  {ETIQUETA_NIVEL[r.nivel]} · {r.probabilidad} × {r.impacto}
                  {r.dueno ? ` · ${r.dueno}` : ""}
                </span>
                {r.mitigacion && <span className="w-full text-xs text-muted-foreground line-clamp-1">{r.mitigacion}</span>}
              </li>
            ))}
          </ol>
        </MarcoAF4>
      </div>

      <TablaRiesgos riesgos={evaluados} historial={historial} escribe={escribe} />
    </Pagina>
  );
}
