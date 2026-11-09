"use client";

import { useMemo, useState, useTransition } from "react";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mesCorto } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { planBaseReparto, type BaseExistente, type Decision, type VentaMes } from "@/lib/ventas/base-reparto";
import { actualizarBaseReparto } from "../actions";
import { DesplazableX } from "@/components/ui/desplazable-x";

const DECISION: Record<Decision, { texto: string; punto: string }> = {
  nueva: { texto: "Se agrega", punto: "bg-success" },
  actualiza: { texto: "Se actualiza", punto: "bg-success" },
  igual: { texto: "Igual", punto: "" },
  conserva_manual: { texto: "Cargada a mano: se conserva", punto: "bg-muted-foreground" },
  conserva_excel: { texto: "Del Excel: se conserva", punto: "bg-warning" },
  mes_incompleto: { texto: "Falta la base de ECOMFIVE", punto: "bg-warning" },
};

const celda = `${claseCeldaColumna} text-right tabular-nums whitespace-nowrap`;
const texto = `${claseCeldaColumna} whitespace-nowrap`;
const th = `${claseEncabezadoColumna} whitespace-nowrap`;
const TODOS = "todos";

/**
 * Órdenes y entregadas por tienda y mes contra la base de reparto del EERR, y «Actualizar base de reparto». Lo que se va
 * a escribir se calcula aquí mismo con la misma regla que usa el servidor (`planBaseReparto`).
 */
export function BaseReparto({
  ventas,
  base,
  otras,
  nombres,
  meses,
  puedeEscribir,
}: {
  ventas: VentaMes[];
  base: BaseExistente[];
  otras: string[];
  nombres: Record<string, string>;
  meses: string[];
  puedeEscribir: boolean;
}) {
  const [reemplazarExcel, setReemplazarExcel] = useState(false);
  const [incluirIncompletos, setIncluirIncompletos] = useState(false);
  const [mes, setMes] = useState(TODOS);
  const [pendiente, iniciar] = useTransition();
  const { mostrarToast } = useToast();

  const plan = useMemo(
    () => planBaseReparto(mes === TODOS ? ventas : ventas.filter((v) => v.periodo === mes), base, otras, { reemplazarExcel, incluirIncompletos }),
    [ventas, base, otras, mes, reemplazarExcel, incluirIncompletos],
  );
  const aEscribir = plan.filter((p) => p.decision === "nueva" || p.decision === "actualiza").length;
  const cuadran = plan.filter((p) => p.actual && p.actual.envios === p.ordenes && p.actual.entregados === p.entregadas).length;
  const comparables = plan.filter((p) => p.actual && p.actual.envios > 0).length;

  function aplicar() {
    iniciar(async () => {
      const r = await actualizarBaseReparto({ reemplazarExcel, incluirIncompletos, meses: mes === TODOS ? [] : [mes] });
      if ("error" in r) mostrarToast(r.error, "destructive");
      else mostrarToast(r.escritas ? `Base de reparto actualizada: ${r.escritas} filas.` : "La base ya estaba al día.");
    });
  }

  const origen = (o: string) => (o === "ventas" ? "Ventas por tienda" : o === "manual" ? "A mano" : o);

  return (
    <MarcoAF4
      id="titulo-base"
      titulo="Base de reparto del EERR"
      detalle={`${entero(cuadran)} de ${entero(comparables)} iguales a la base actual`}
      sinRelleno
    >
      {puedeEscribir && (
        <div className="flex flex-wrap items-end gap-4 border-b border-border p-4">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Meses</span>
            <select value={mes} onChange={(e) => setMes(e.target.value)} className={fieldClass} disabled={pendiente}>
              <option value={TODOS}>Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesCorto(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reemplazarExcel} onChange={(e) => setReemplazarExcel(e.target.checked)} disabled={pendiente} />
            Reemplazar los meses que vienen del Excel
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incluirIncompletos} onChange={(e) => setIncluirIncompletos(e.target.checked)} disabled={pendiente} />
            Incluir meses sin la base de ECOMFIVE
          </label>
          <Button type="button" onClick={aplicar} disabled={pendiente || aEscribir === 0}>
            {pendiente ? "Actualizando…" : `Actualizar base de reparto${aEscribir ? ` (${entero(aEscribir)})` : ""}`}
          </Button>
        </div>
      )}

      <DesplazableX ariaLabel="Base de reparto por tienda y mes">
        <table className="tabla-datos w-full text-sm">
          <caption className="sr-only">Órdenes y entregadas de cada tienda y mes contra la base de reparto actual</caption>
          <thead>
            <tr className={claseFilaEncabezado}>
              <th scope="col" className={th}>Mes</th>
              <th scope="col" className={th}>Tienda</th>
              <th scope="col" className={`${th} text-right`}>Órdenes</th>
              <th scope="col" className={`${th} text-right`}>Envíos en la base</th>
              <th scope="col" className={`${th} text-right`}>Entregadas</th>
              <th scope="col" className={`${th} text-right`}>Entregados en la base</th>
              <th scope="col" className={th}>Origen de la base</th>
              <th scope="col" className={th}>Qué pasa</th>
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => {
              const d = DECISION[p.decision];
              const distintoEnvios = p.actual !== null && p.actual.envios !== p.ordenes;
              const distintoEntregados = p.actual !== null && p.actual.entregados !== p.entregadas;
              return (
                <tr key={`${p.periodo}|${p.unidad_id}`} className="border-t border-border/60">
                  <th scope="row" className={`${texto} text-left font-normal`}>{mesCorto(p.periodo)}</th>
                  <td className={`${texto} font-medium`}>{nombres[p.unidad_id] ?? "—"}</td>
                  <td className={celda}>{entero(p.ordenes)}</td>
                  <td className={`${celda} ${distintoEnvios ? "font-semibold" : "text-muted-foreground"}`}>{p.actual ? entero(p.actual.envios) : "—"}</td>
                  <td className={celda}>{entero(p.entregadas)}</td>
                  <td className={`${celda} ${distintoEntregados ? "font-semibold" : "text-muted-foreground"}`}>{p.actual ? entero(p.actual.entregados) : "—"}</td>
                  <td className={`${texto} text-muted-foreground`}>{p.actual ? origen(p.actual.origen) : "—"}</td>
                  <td className={texto}>
                    <span className="inline-flex items-center gap-1.5">
                      {d.punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${d.punto}`} />}
                      {d.texto}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DesplazableX>
    </MarcoAF4>
  );
}
