import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { rangoMeses } from "@/lib/af4/fecha";
import { dinero, porcentaje } from "@/lib/af4/formato";
import { SECCIONES } from "@/lib/finanzas/eerr";
import { ESCENARIOS, SECCIONES_GASTO, type SupuestoGasto, type Supuestos } from "@/lib/finanzas/presupuesto";

const pct = (v: number) => porcentaje(v, { decimales: Number.isInteger(v) ? 0 : 2 });
const gasto = (g: SupuestoGasto) => (g.modo === "pct" ? `${pct(g.valor)} de ingresos` : `${dinero(g.valor)} por mes`);

/** Los supuestos con que se generó el presupuesto, por escenario (los mismos que se ven al rehacerlo). */
export function TablaSupuestos({ supuestos }: { supuestos: Supuestos }) {
  const filas: { etiqueta: string; valor: (e: Supuestos["escenarios"]["base"]) => string }[] = [
    { etiqueta: "Crecimiento mensual de ingresos", valor: (e) => pct(e.crecimientoMensual) },
    { etiqueta: "Margen bruto", valor: (e) => pct(e.margenBruto) },
    ...SECCIONES_GASTO.map((s) => ({ etiqueta: SECCIONES.find((x) => x.clave === s)!.etiqueta, valor: (e: Supuestos["escenarios"]["base"]) => gasto(e.gastos[s]) })),
    { etiqueta: "Inflación anual de gastos fijos", valor: (e) => pct(e.inflacionAnual) },
  ];
  return (
    <TablaComparacionAF4
      id="titulo-supuestos"
      titulo="Supuestos"
      detalle={`Base ${rangoMeses(supuestos.mesesBase)}`}
      ariaLabel="Supuestos por escenario"
      etiquetaConcepto="Supuesto"
      columnas={ESCENARIOS.map((e) => ({ clave: e.clave, etiqueta: e.etiqueta }))}
      filas={filas.map((f) => ({ clave: f.etiqueta, etiqueta: f.etiqueta, celdas: ESCENARIOS.map((e) => f.valor(supuestos.escenarios[e.clave])) }))}
    />
  );
}
