"use client";

import { useMemo, useState } from "react";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { diaMes } from "@/lib/af4/fecha";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import type { Linea } from "@/lib/finanzas/proyeccion-caja";
import { cobrosAtrasables, compararQueSi, ESCENARIO_NEUTRO, type EscenarioQueSi } from "@/lib/finanzas/que-pasa-si";

const acotar = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : 0);

/**
 * «¿Qué pasa si?»: un escenario armado al vuelo sobre la proyección base (ventas, marketing, un cobro que se atrasa),
 * comparado con la base. No se guarda.
 */
export function QuePasaSi({ lineas, semanas, cajaHoy, cajaMinima }: { lineas: Linea[]; semanas: string[]; cajaHoy: number; cajaMinima: number }) {
  const [e, setE] = useState<EscenarioQueSi>(ESCENARIO_NEUTRO);
  const cobros = useMemo(() => cobrosAtrasables(lineas), [lineas]);
  const c = useMemo(() => compararQueSi(lineas, semanas, cajaHoy, cajaMinima, e), [lineas, semanas, cajaHoy, cajaMinima, e]);
  const cambiado = e.ventas !== 0 || e.marketing !== 0 || (e.cobro !== null && e.dias > 0);
  const semanaTexto = (i: number | null) => (i === null ? "No en 13 semanas" : `S${i + 1} · ${diaMes(semanas[i])}`);
  return (
    <MarcoAF4
      id="que-pasa-si"
      titulo="¿Qué pasa si?"
      detalle="Contra el escenario base · no se guarda"
      accion={
        cambiado ? (
          <button type="button" onClick={() => setE(ESCENARIO_NEUTRO)} className={`rounded text-xs font-medium text-foreground-soft underline-offset-2 hover:underline ${anilloFoco}`}>
            Volver a la base
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-36 flex-col gap-1">
            <span className={labelClassSm}>Ventas (%)</span>
            <input
              type="number"
              step={1}
              min={-90}
              max={100}
              value={Math.round(e.ventas * 100)}
              onChange={(x) => setE({ ...e, ventas: acotar(Number(x.target.value), -90, 100) / 100 })}
              className={`${fieldClassSm} w-full`}
            />
          </label>
          <label className="flex w-36 flex-col gap-1">
            <span className={labelClassSm}>Marketing (%)</span>
            <input
              type="number"
              step={1}
              min={-100}
              max={300}
              value={Math.round(e.marketing * 100)}
              onChange={(x) => setE({ ...e, marketing: acotar(Number(x.target.value), -100, 300) / 100 })}
              className={`${fieldClassSm} w-full`}
            />
          </label>
          <label className="flex min-w-48 flex-col gap-1">
            <span className={labelClassSm}>Cobro que se atrasa</span>
            <select value={e.cobro ?? ""} onChange={(x) => setE({ ...e, cobro: x.target.value || null })} className={`${fieldClassSm} w-full`}>
              <option value="">Ninguno</option>
              <option value="todos">Todos los cobros</option>
              {cobros.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {`${o.etiqueta} · ${dinero(o.total)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1">
            <span className={labelClassSm}>Días de atraso</span>
            <input type="number" step={1} min={0} max={90} value={e.dias} onChange={(x) => setE({ ...e, dias: acotar(Math.round(Number(x.target.value)), 0, 90) })} className={`${fieldClassSm} w-full`} />
          </label>
        </div>
        <FilaKpiAF4>
          <KpiAF4
            titulo="Caja al cierre"
            tono={c.cajaFinal.escenario < cajaMinima ? "destructive" : "neutral"}
            valor={dineroKpi(c.cajaFinal.escenario)}
            comparaciones={[{ v: calcularVariacion(c.cajaFinal.escenario, c.cajaFinal.base), contra: "la base", modo: "dinero" }]}
          />
          <KpiAF4
            titulo="Caja mínima"
            tono={c.cajaMinima.escenario < cajaMinima ? "destructive" : "neutral"}
            valor={dineroKpi(c.cajaMinima.escenario)}
            comparaciones={[{ v: calcularVariacion(c.cajaMinima.escenario, c.cajaMinima.base), contra: "la base", modo: "dinero" }]}
            subtexto={semanaTexto(c.cajaMinima.semanaEscenario)}
          />
          <KpiAF4 titulo="Caja negativa" tono={c.semanaNegativa.escenario === null ? "success" : "destructive"} valor={semanaTexto(c.semanaNegativa.escenario)} subtexto={`Base: ${semanaTexto(c.semanaNegativa.base)}`} />
          <KpiAF4 titulo="Semanas bajo el mínimo" tono={c.bajoMinimo.escenario ? "destructive" : "success"} valor={`${c.bajoMinimo.escenario} de ${semanas.length}`} subtexto={`Base: ${c.bajoMinimo.base}`} />
        </FilaKpiAF4>
        {cambiado && (
          <GraficaLineasAF4
            id="grafica-que-pasa-si"
            titulo="Caja al cierre de cada semana"
            detalle="Base y escenario · USD"
            etiquetaEje="Semana"
            alto={240}
            datos={semanas.map((s, i) => ({ etiqueta: `S${i + 1} · ${diaMes(s)}`, base: c.base.cajaFinal[i], escenario: c.escenario.cajaFinal[i] }))}
            series={[
              { clave: "base", nombre: "Base", color: 1, trazo: "rayas" },
              { clave: "escenario", nombre: "¿Qué pasa si?", color: 2 },
            ]}
            referencias={[{ valor: cajaMinima, etiqueta: "Caja mínima", tipo: "limite" }]}
          />
        )}
      </div>
    </MarcoAF4>
  );
}
