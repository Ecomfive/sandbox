import { MEZCLA_DE_ANGULOS } from "@/lib/meta-ads/atributos-video";
import { conSigno, dolaresEnteros, resultado } from "@/lib/meta-ads/metricas";
import { NOMBRE_ETAPA, type Etapa } from "@/lib/meta-ads/nombre";
import type { CampanaVista } from "@/lib/meta-ads/vistas";
import { NOMBRE_VEREDICTO, veredictoDe, type Veredicto } from "./def-campanas";
import { Anillo, BarraApilada, coloresDeAngulos, Leyenda, TarjetaMeta } from "./graficas";

const COLOR_VEREDICTO: Record<Veredicto, string> = { deja: "var(--success)", pierde: "var(--destructive)", poca_data: "var(--warning)", sin_gasto: "var(--grafica-5)" };
const COLOR_ETAPA: Record<Etapa | "sin", string> = { testing: "var(--azul)", escala: "var(--success)", retargeting: "var(--warning)", sin: "var(--grafica-5)" };

/**
 * Arriba de Campañas: cómo van todas las campañas del periodo de un vistazo — cuántas dejan ganancia o pierden, cuánto se gastó y qué dejó, en qué etapa están y de qué ángulos están hechas
 * (el de cada una es el que usan la mayoría de sus videos; las que no tienen uno dominante van en «Mezcla de ángulos»).
 */
export function ResumenCampanas({ campanas }: { campanas: CampanaVista[] }) {
  const veredictos: Record<Veredicto, number> = { deja: 0, pierde: 0, poca_data: 0, sin_gasto: 0 };
  for (const c of campanas) veredictos[veredictoDe(c)]++;
  const gasto = campanas.reduce((s, c) => s + c.r.gasto, 0);
  const compras = campanas.reduce((s, c) => s + c.r.compras, 0);
  const total = campanas.reduce((s, c) => s + resultado(c.r, c.tope), 0);
  const etapas: Record<Etapa | "sin", number> = { testing: 0, escala: 0, retargeting: 0, sin: 0 };
  for (const c of campanas) etapas[c.etapa ?? "sin"]++;
  const partesEtapa = (Object.keys(etapas) as (Etapa | "sin")[]).filter((k) => etapas[k] > 0).map((k) => ({ nombre: k === "sin" ? "Sin etapa" : NOMBRE_ETAPA[k], valor: etapas[k], color: COLOR_ETAPA[k] }));
  const angulos = new Map<string, number>();
  for (const c of campanas) if (c.angulo) angulos.set(c.angulo, (angulos.get(c.angulo) ?? 0) + 1);
  const mezcla = angulos.get(MEZCLA_DE_ANGULOS) ?? 0;
  const colores = coloresDeAngulos(campanas);
  const partesAngulo = [...angulos]
    .filter(([n]) => n !== MEZCLA_DE_ANGULOS)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, valor]) => ({ nombre, valor, color: colores.get(nombre) ?? "var(--grafica-5)" }));
  if (mezcla > 0) partesAngulo.push({ nombre: MEZCLA_DE_ANGULOS, valor: mezcla, color: "var(--grafica-5)" });
  const sinAngulo = campanas.filter((c) => !c.angulo).length;
  if (campanas.length === 0) return null;
  const tipos = Object.keys(veredictos) as Veredicto[];
  return (
    <section aria-label="Resumen de las campañas" className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <TarjetaMeta titulo="Cómo van" derecha={`${campanas.length} campañas`} id="resumen-veredictos">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Anillo
            tamano={112}
            grosor={13}
            etiqueta={`Campañas: ${tipos.map((v) => `${veredictos[v]} ${NOMBRE_VEREDICTO[v].toLowerCase()}`).join(", ")}`}
            partes={tipos.map((v) => ({ nombre: NOMBRE_VEREDICTO[v], valor: veredictos[v], color: COLOR_VEREDICTO[v] }))}
            centro={
              <>
                <span className={`text-lg font-semibold tabular-nums ${total >= 0 ? "text-success" : "text-destructive"}`}>{conSigno(total)}</span>
                <span className="text-[11px] text-muted-foreground">estimado</span>
              </>
            }
          />
          <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
            <ul role="list" className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {tipos.map((v) => (
                <li key={v} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR_VEREDICTO[v] }} />
                    {NOMBRE_VEREDICTO[v]}
                  </span>
                  <span className="font-semibold tabular-nums">{veredictos[v]}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-xs text-muted-foreground tabular-nums">
              {dolaresEnteros(gasto)} gastados · {compras} compras
            </p>
          </div>
        </div>
      </TarjetaMeta>

      <TarjetaMeta titulo="Etapa y ángulos" derecha="Cuántas campañas hay en cada uno" id="resumen-mezcla">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs font-medium text-muted-foreground">Etapa</p>
            <BarraApilada partes={partesEtapa} alto={14} conPorcentaje etiqueta={`Campañas por etapa: ${partesEtapa.map((p) => `${p.valor} ${p.nombre}`).join(", ")}`} />
            <Leyenda partes={partesEtapa.map((p) => ({ nombre: p.nombre, color: p.color, texto: String(p.valor) }))} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs font-medium text-muted-foreground">Ángulo con que se clasifica cada campaña</p>
            {partesAngulo.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Todavía no hay videos con ángulo. Analízalos en Videos.</p>
            ) : (
              <>
                <BarraApilada partes={partesAngulo} alto={14} conPorcentaje etiqueta={`Campañas por ángulo: ${partesAngulo.map((p) => `${p.valor} ${p.nombre}`).join(", ")}`} />
                <Leyenda partes={partesAngulo.map((p) => ({ nombre: p.nombre, color: p.color, texto: String(p.valor) }))} />
                {sinAngulo > 0 && <p className="m-0 text-xs text-muted-foreground">{sinAngulo} {sinAngulo === 1 ? "campaña sin ángulo" : "campañas sin ángulo"} (sus videos todavía no se analizaron).</p>}
              </>
            )}
          </div>
        </div>
      </TarjetaMeta>
    </section>
  );
}
