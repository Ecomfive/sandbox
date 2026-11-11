"use client";

import { useId, useMemo, useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { dinero, dinero2, numero } from "@/lib/af4/formato";
import { curvaPrecio, simularPrecio, type BaseSimulador } from "@/lib/finanzas/unidad-economica";

export interface OpcionSimulador {
  clave: string;
  etiqueta: string;
  base: BaseSimulador;
}

const leer = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cuánto cambia la utilidad de un producto si su precio sube o baja $X. Sin elasticidad se venden las mismas unidades; con
 * ella (−1.5: precio +10 % → unidades −15 %), menos o más. El marketing se toma como fijo.
 */
export function SimuladorPrecio({ opciones }: { opciones: OpcionSimulador[] }) {
  const id = useId();
  const [clave, setClave] = useState(opciones[0]?.clave ?? "");
  const [delta, setDelta] = useState("1");
  const [elasticidad, setElasticidad] = useState("0");
  const elegido = opciones.find((o) => o.clave === clave) ?? opciones[0];
  const rango = elegido ? Math.max(1, Math.round(elegido.base.precio * 0.3)) : 1;
  const d = Math.max(-rango * 3, Math.min(rango * 3, leer(delta)));
  const e = Math.max(-10, Math.min(0, leer(elasticidad)));
  const sim = elegido ? simularPrecio(elegido.base, d, e) : null;
  const curva = useMemo(
    () =>
      elegido
        ? curvaPrecio(elegido.base, rango, e, 12).map((s) => ({ etiqueta: dinero2(s.precio), utilidad: Math.round(s.utilidad * 100) / 100 }))
        : [],
    [elegido, rango, e],
  );
  if (!elegido || !sim) return null;
  const actual = sim.utilidad - sim.diferencia;

  return (
    <MarcoAF4 id={`${id}-titulo`} titulo="Simulador de precio" detalle={elegido.etiqueta}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 sm:max-w-sm">
            <span className={labelClassSm}>Producto</span>
            <select value={elegido.clave} onChange={(ev) => setClave(ev.target.value)} className={fieldClassSm}>
              {opciones.map((o) => (
                <option key={o.clave} value={o.clave}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cambio de precio (US$)</span>
            <input inputMode="decimal" value={delta} onChange={(ev) => setDelta(ev.target.value)} placeholder="Ej: 2" className={`${fieldClassSm} w-28 text-right ${claseCifra}`} />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1">
            <span className={labelClassSm}>Deslizar</span>
            <input
              type="range"
              min={-rango}
              max={rango}
              step={0.5}
              value={Math.max(-rango, Math.min(rango, d))}
              onChange={(ev) => setDelta(ev.target.value)}
              className="h-8 accent-[var(--foreground)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Elasticidad</span>
            <input inputMode="decimal" value={elasticidad} onChange={(ev) => setElasticidad(ev.target.value)} placeholder="Ej: -1.5" className={`${fieldClassSm} w-24 text-right ${claseCifra}`} />
          </label>
        </div>
        <FilaKpiAF4>
          <KpiAF4 titulo="Precio" valor={dinero2(sim.precio)} subtexto={`Hoy ${dinero2(elegido.base.precio)}`} />
          <KpiAF4 titulo="Unidades" valor={numero(sim.unidades, 0)} subtexto={`Hoy ${numero(elegido.base.unidades, 0)}`} />
          <KpiAF4 titulo="Utilidad" tono={sim.utilidad < 0 ? "destructive" : "neutral"} valor={dinero(sim.utilidad)} subtexto={`Hoy ${dinero(actual)}`} />
          <KpiAF4
            titulo="Diferencia"
            destacado
            tono={sim.diferencia < 0 ? "destructive" : sim.diferencia > 0 ? "success" : "neutral"}
            valor={dinero(sim.diferencia, "USD", { conSigno: true })}
          />
        </FilaKpiAF4>
        <GraficaLineasAF4
          id={`${id}-curva`}
          titulo="Utilidad según el precio"
          detalle={e ? `Elasticidad ${numero(e, 1)}` : "Mismas unidades"}
          etiquetaEje="Precio"
          alto={220}
          datos={curva}
          series={[{ clave: "utilidad", nombre: "Utilidad", color: 2 }]}
          referencias={[{ valor: actual, etiqueta: "Hoy", tipo: "meta" }]}
        />
      </div>
    </MarcoAF4>
  );
}
