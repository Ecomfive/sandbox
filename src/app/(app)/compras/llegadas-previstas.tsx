"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CabeceraTarjeta, Punto, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { cubetaLlegada, etiquetaMes } from "@/lib/compras/llegadas";
import { etiquetaEtapa, etiquetaVia, numeroOC, type FilaCompra } from "./def-compras";
import { entero, usd } from "./calculos-compras";

interface Columna {
  clave: string;
  titulo: string;
  detalle: string;
  compras: FilaCompra[];
}

/** Lo que suma una columna: compras, unidades, monto y cuántas por cada vía. */
function resumen(compras: FilaCompra[]) {
  const vias = new Map<string, number>();
  for (const c of compras) for (const v of c.viaEnvio.length ? c.viaEnvio : ["sin"]) vias.set(v, (vias.get(v) ?? 0) + 1);
  return {
    unidades: compras.reduce((s, c) => s + (c.qtyTotal ?? 0), 0),
    monto: compras.reduce((s, c) => s + (c.montoTotal ?? 0), 0),
    vias: [...vias].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v === "sin" ? "Sin vía" : etiquetaVia(v)} ${n}`).join(" · "),
  };
}

/**
 * «Llegadas previstas»: las compras que todavía no llegan, por el mes en que se espera que lleguen (su Planificación): el mes
 * en curso (lo que resta) y los 3 siguientes, más las que ya debían haber llegado. Pulsar un mes filtra todo el Dashboard;
 * debajo, la lista de esas compras con un enlace a su ficha.
 */
export function LlegadasPrevistas({
  compras,
  meses,
  activa,
  alElegir,
  vista,
}: {
  /** Las compras con los demás filtros del Dashboard aplicados (no el de llegada). */
  compras: FilaCompra[];
  /** El mes en curso y los 3 siguientes («2026-10»…). */
  meses: string[];
  activa: string;
  alElegir: (clave: string) => void;
  vista: string;
}) {
  const { columnas, sin, despues, porClave } = useMemo(() => {
    const porClave = new Map<string, FilaCompra[]>();
    for (const c of compras) {
      const k = cubetaLlegada(c, meses);
      if (k) porClave.set(k, [...(porClave.get(k) ?? []), c]);
    }
    const columnas: Columna[] = [
      ...(porClave.get("antes")?.length ? [{ clave: "antes", titulo: "Debían llegar", detalle: "planificadas antes y sin llegar", compras: porClave.get("antes")! }] : []),
      ...meses.map((m, i) => ({ clave: m, titulo: etiquetaMes(m), detalle: i === 0 ? "lo que resta del mes" : "", compras: porClave.get(m) ?? [] })),
    ];
    return { columnas, sin: porClave.get("sin")?.length ?? 0, despues: porClave.get("despues")?.length ?? 0, porClave };
  }, [compras, meses]);

  // La lista: la columna elegida o, sin elegir, todos los meses que se ven.
  const lista = (activa ? (porClave.get(activa) ?? []) : columnas.filter((c) => c.clave !== "antes").flatMap((c) => c.compras))
    .map((c) => ({ c, mes: cubetaLlegada(c, meses)! }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || (a.c.fechaEnvio ?? "").localeCompare(b.c.fechaEnvio ?? ""));
  const prefijo = `/compras/lista?${vista === "todos" ? "" : `ver=${vista}&`}abrir=`;

  return (
    <section aria-labelledby="d-llegadas" className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="d-llegadas" titulo="Llegadas previstas">
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          pulsa un mes para filtrar
          <Link href={`/compras/planificacion${vista === "todos" ? "" : `?ver=${vista}`}`} className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}>
            Ver planificación
          </Link>
        </span>
      </CabeceraTarjeta>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-5">
        {columnas.map((col) => {
          const r = resumen(col.compras);
          const elegida = activa === col.clave;
          return (
            <button
              key={col.clave}
              type="button"
              aria-pressed={elegida}
              onClick={() => alElegir(col.clave)}
              className={`flex min-h-11 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted ${anilloFoco} ${
                elegida ? "border-primario bg-primario-suave" : "border-border"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {col.clave === "antes" && <Punto tono="peligro" />}
                {col.titulo}
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {entero(col.compras.length)} <span className="text-xs font-normal text-muted-foreground">{col.compras.length === 1 ? "compra" : "compras"}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {entero(r.unidades)} unid. · {usd(r.monto, true)}
              </span>
              {r.vias && <span className="text-xs text-muted-foreground">{r.vias}</span>}
              {col.detalle && <span className="text-[11px] text-muted-foreground">{col.detalle}</span>}
            </button>
          );
        })}
      </div>
      {(sin > 0 || despues > 0) && (
        <p className="m-0 px-4 pb-2 text-xs text-muted-foreground">
          {sin > 0 && `${entero(sin)} abiertas sin fecha de envío (aún sin planificación)`}
          {sin > 0 && despues > 0 && " · "}
          {despues > 0 && `${entero(despues)} llegan más adelante`}
        </p>
      )}
      {lista.length === 0 ? (
        <p className="m-0 px-4 pb-4 text-sm text-muted-foreground">No hay compras por llegar en estos meses con estos filtros.</p>
      ) : (
        <div className="max-h-[360px] overflow-auto border-t border-border">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-card">
              <tr>
                {["Llega", "Compra", "País", "Vía", "Envío", "Etapa", "Unidades", "Monto"].map((t) => (
                  <th key={t} scope="col" className={claseTh}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(({ c, mes }) => (
                <tr key={c.id}>
                  <td className={`${claseTd} ${mes === "antes" ? "text-destructive" : ""}`}>{mes === "antes" ? `${c.planificacion} (atrasada)` : etiquetaMes(mes)}</td>
                  <td className={`${claseTd} max-w-[22rem] truncate`}>
                    <Link href={`${prefijo}${c.id}`} className={`rounded hover:underline ${anilloFoco}`}>
                      <span className="text-muted-foreground tabular-nums">{c.codigo ?? numeroOC(c.numero)}</span> {c.nombre}
                    </Link>
                  </td>
                  <td className={claseTd}>{c.paisCodigo ?? "—"}</td>
                  <td className={claseTd}>{c.viaEnvio.length ? c.viaEnvio.map(etiquetaVia).join(", ") : "—"}</td>
                  <td className={`${claseTd} tabular-nums`}>{c.fechaEnvio ? formatearFecha(c.fechaEnvio) : "—"}</td>
                  <td className={claseTd}>{etiquetaEtapa(c.etapa)}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{c.qtyTotal === null ? "—" : entero(c.qtyTotal)}</td>
                  <td className={`${claseTd} text-right tabular-nums`}>{c.montoTotal === null ? "—" : usd(c.montoTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
