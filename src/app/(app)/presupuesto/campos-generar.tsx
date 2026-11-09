"use client";

import { useMemo, useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import type { AyudaFaltantes } from "@/components/ui/ficha-crear";
import { fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, EstadoIcon, TiendaIcon } from "@/lib/nav-icons";
import { mesCorto } from "@/lib/finanzas/eerr";
import {
  ESCENARIOS,
  rangoMeses,
  supuestosPorDefecto,
  type SerieSecciones,
  type SupuestoGasto,
  type Supuestos,
} from "@/lib/finanzas/presupuesto";

export interface DatosGenerar {
  /** El real consolidado de los meses que se pueden elegir como base. */
  serie: SerieSecciones;
  /** Meses con movimientos, del más viejo al más nuevo. */
  meses: string[];
  baseDesde: string;
  baseHasta: string;
  anio: number;
}

type Modo = SupuestoGasto["modo"];

const FILAS = [
  { campo: "crecimiento", etiqueta: "Crecimiento mensual de ingresos (%)" },
  { campo: "margen", etiqueta: "Margen bruto (%)" },
  { campo: "administracion", etiqueta: "Administración" },
  { campo: "marketing", etiqueta: "Marketing" },
  { campo: "inflacion", etiqueta: "Inflación anual de gastos fijos (%)" },
] as const;

/**
 * Los campos para generar un presupuesto desde el real (los usan «Agregar» y «Rehacer»): meses base, si se reparte por
 * tienda y los supuestos de cada escenario, que se llenan solos con lo que dicen los meses base (se pueden cambiar).
 * Al cambiar los meses base o el modo de un gasto, los supuestos se vuelven a calcular.
 */
export function CamposGenerar({
  datos,
  ayuda,
  guardados,
  porTiendaInicial = true,
  conAnio = true,
}: {
  datos: DatosGenerar;
  ayuda: AyudaFaltantes;
  /** Al rehacer: los supuestos con que se generó (se muestran hasta que se cambien los meses base o un modo). */
  guardados?: Supuestos | null;
  porTiendaInicial?: boolean;
  conAnio?: boolean;
}) {
  const { faltante, invalido } = ayuda;
  const [desde, setDesde] = useState((guardados?.mesesBase[0] ?? datos.baseDesde).slice(0, 7));
  const [hasta, setHasta] = useState((guardados?.mesesBase.at(-1) ?? datos.baseHasta).slice(0, 7));
  const [modos, setModos] = useState<{ administracion: Modo; marketing: Modo }>({
    administracion: guardados?.escenarios.base.gastos.administracion.modo ?? "pct",
    marketing: guardados?.escenarios.base.gastos.marketing.modo ?? "pct",
  });
  const [cambiado, setCambiado] = useState(!guardados);

  const conDatos = useMemo(() => new Set(datos.meses), [datos.meses]);
  const mesesBase = useMemo(() => rangoMeses(`${desde}-01`, `${hasta}-01`).filter((m) => conDatos.has(m)), [desde, hasta, conDatos]);
  const calculados = useMemo(() => supuestosPorDefecto(datos.serie, mesesBase, modos), [datos.serie, mesesBase, modos]);
  const supuestos = !cambiado && guardados ? guardados : calculados;
  // Los campos se vuelven a montar con los valores nuevos cuando cambian los meses base o un modo.
  const llave = `${desde}|${hasta}|${modos.administracion}|${modos.marketing}|${cambiado}`;
  const sinBase = mesesBase.length === 0;

  const valor = (esc: (typeof ESCENARIOS)[number]["clave"], campo: (typeof FILAS)[number]["campo"]) => {
    const e = supuestos.escenarios[esc];
    if (campo === "crecimiento") return e.crecimientoMensual;
    if (campo === "margen") return e.margenBruto;
    if (campo === "inflacion") return e.inflacionAnual;
    return e.gastos[campo].valor;
  };
  const etiquetaFila = (f: (typeof FILAS)[number]) =>
    f.campo === "administracion" || f.campo === "marketing" ? `${f.etiqueta} (${modos[f.campo] === "pct" ? "% de ingresos" : "USD por mes"})` : f.etiqueta;

  return (
    <>
      <Seccion icono={CalendarioIcon} titulo="Meses base">
        {conAnio && (
          <Campo etiqueta="Año del presupuesto" id="campo-anio" obligatorio faltante={faltante}>
            <input
              id="campo-anio"
              name="anio"
              type="number"
              required
              min={2020}
              max={2100}
              defaultValue={datos.anio}
              aria-invalid={invalido("campo-anio")}
              className={`${fieldClass} w-full`}
            />
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde" id="campo-base-desde" obligatorio faltante={faltante}>
            <input
              id="campo-base-desde"
              name="base_desde"
              type="month"
              required
              value={desde}
              max={hasta}
              onChange={(e) => {
                setDesde(e.target.value);
                setCambiado(true);
              }}
              aria-invalid={invalido("campo-base-desde")}
              className={`${fieldClass} w-full`}
            />
          </Campo>
          <Campo etiqueta="Hasta" id="campo-base-hasta" obligatorio faltante={faltante}>
            <input
              id="campo-base-hasta"
              name="base_hasta"
              type="month"
              required
              value={hasta}
              min={desde}
              onChange={(e) => {
                setHasta(e.target.value);
                setCambiado(true);
              }}
              aria-invalid={invalido("campo-base-hasta")}
              className={`${fieldClass} w-full`}
            />
          </Campo>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {sinBase ? (
            <span className="text-destructive">Esos meses no tienen movimientos.</span>
          ) : (
            `${mesesBase.length} ${mesesBase.length === 1 ? "mes" : "meses"} con datos: ${mesCorto(mesesBase[0])} a ${mesCorto(mesesBase[mesesBase.length - 1])}`
          )}
        </p>
      </Seccion>

      <Seccion icono={TiendaIcon} titulo="Nivel">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="por_tienda" value="si" defaultChecked={porTiendaInicial} className="h-4 w-4" />
          Repartir por tienda
        </label>
      </Seccion>

      <Seccion icono={EstadoIcon} titulo="Supuestos por escenario">
        <div className="grid grid-cols-2 gap-3">
          {(["administracion", "marketing"] as const).map((s) => (
            <label key={s} className="flex flex-col gap-1">
              <span className={labelClassSm}>{s === "administracion" ? "Administración como" : "Marketing como"}</span>
              <select
                name={`modo_${s}`}
                value={modos[s]}
                onChange={(e) => {
                  setModos((m) => ({ ...m, [s]: e.target.value as Modo }));
                  setCambiado(true);
                }}
                className={`${fieldClass} w-full`}
              >
                <option value="pct">% de ingresos</option>
                <option value="fijo">Monto fijo</option>
              </select>
            </label>
          ))}
        </div>
        <div key={llave} className="flex flex-col gap-3">
          <div aria-hidden="true" className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
            {ESCENARIOS.map((e) => (
              <span key={e.clave}>{e.etiqueta}</span>
            ))}
          </div>
          {FILAS.map((f) => (
            <div key={f.campo} role="group" aria-labelledby={`supuesto-${f.campo}`} className="flex flex-col gap-1">
              <span id={`supuesto-${f.campo}`} className={labelClassSm}>
                {etiquetaFila(f)}
              </span>
              <div className="grid grid-cols-3 gap-2">
                {ESCENARIOS.map((e) => (
                  <input
                    key={e.clave}
                    name={`${e.clave}_${f.campo}`}
                    inputMode="decimal"
                    defaultValue={String(valor(e.clave, f.campo))}
                    aria-label={`${etiquetaFila(f)}, ${e.etiqueta}`}
                    pattern="-?[0-9]+([.,][0-9]+)?"
                    className={`${fieldClassSm} w-full text-right tabular-nums`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Seccion>
    </>
  );
}
