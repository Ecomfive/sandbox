"use client";

import { useState } from "react";
import type { FilaEntrega, FilaVentas, VeredictoEntrega } from "@/lib/meta-ads/historico";
import { dolares } from "@/lib/meta-ads/metricas";
import type { HistorialSecciones } from "@/lib/meta-ads/analisis-tipos";
import { Anillo, BarraProgreso } from "./graficas";
import { SeccionPlegable } from "./plegable";
import { entero } from "./piezas";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

/** Verde desde 70 %, ámbar desde 55 % y rojo debajo: los mismos cortes que usa el análisis para decir que una entrega es mala. */
const colorDeTasa = (t: number | null) => (t === null ? "var(--muted-foreground)" : t >= 0.7 ? "var(--success)" : t >= 0.55 ? "var(--warning)" : "var(--destructive)");

const VEREDICTO: Record<VeredictoEntrega, { texto: string; clase: string }> = {
  vende_y_entrega: { texto: "Vende y entrega", clase: "bg-success-soft text-success" },
  vende_pero_no_entrega: { texto: "Vende, pero no entrega", clase: "bg-destructive-soft text-destructive" },
  no_funciona: { texto: "No llega a su tope", clase: "bg-muted text-muted-foreground" },
  poca_data: { texto: "Poca data", clase: "bg-muted text-muted-foreground" },
  sin_entrega: { texto: "Sin tasa todavía", clase: "bg-muted text-muted-foreground" },
};

function FilaDeEntrega({ f, promedio }: { f: FilaEntrega; promedio: number | null }) {
  const v = VEREDICTO[f.veredicto];
  return (
    <li className="grid items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-medium">{f.nombre}</p>
        <p className="m-0 mt-0.5 text-xs tabular-nums text-muted-foreground">
          {dolares(f.gasto)} gastados · {entero(f.compras)} compras{f.cpa !== null && ` · CPA ${dolares(f.cpa)}`}
        </p>
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold tabular-nums" style={{ color: colorDeTasa(f.tasa) }}>
            {f.tasa === null ? "Sin tasa" : `${pct(f.tasa)} entregado`}
          </span>
          {f.cpaEntregado !== null && <span className="tabular-nums text-muted-foreground">{dolares(f.cpaEntregado)} por entrega</span>}
        </div>
        <span className="relative block">
          <BarraProgreso valor={(f.tasa ?? 0) * 100} maximo={100} color={colorDeTasa(f.tasa)} alto={8} />
          {promedio !== null && <span aria-hidden="true" className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/60" style={{ left: `${promedio * 100}%` }} />}
        </span>
      </div>
      <span className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${v.clase}`}>{v.texto}</span>
    </li>
  );
}

/**
 * La entrega de cada producto (antes una tabla de siete columnas en Hallazgos; 24 nov 2026 pasó a Productos, pedido de Alcides): el producto, cuánto se gastó, una barra con el porcentaje que sí se entrega (con una marca en el promedio de todos)
 * y un veredicto en una palabra. Tasa = entregados ÷ (entregados + devueltos). Plegable; se ven los 6 de más gasto y el resto con «Ver todos».
 */
export function EntregaDeProductos({ historial }: { historial: HistorialSecciones }) {
  const [todos, setTodos] = useState(false);
  const { entrega, tasaEntrega, tiendas, pedidos } = historial;
  const resumen = tasaEntrega === null ? "Sin pedidos suficientes" : `Promedio ${pct(tasaEntrega)} entregado`;
  const lista = todos ? entrega : entrega.slice(0, 6);
  return (
    <SeccionPlegable
      titulo="Entrega de cada producto"
      resumen={resumen}
      derecha={tasaEntrega !== null ? `Promedio de todos: ${pct(tasaEntrega)}` : undefined}
      abierta={false}
    >
      {tiendas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">No se encontró la tienda de las cuentas en los pedidos: anótala en «Cuentas › Tienda» con el nombre de la tienda (por ejemplo «Oferfy») para ver cuánto se entrega de cada producto.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <Anillo
              etiqueta={`Tasa de entrega promedio: ${pct(tasaEntrega)}`}
              tamano={84}
              grosor={11}
              partes={tasaEntrega === null ? [] : [{ nombre: "Entregado", valor: tasaEntrega, color: colorDeTasa(tasaEntrega) }, { nombre: "Devuelto", valor: 1 - tasaEntrega, color: "var(--muted)" }]}
              centro={<span className="text-sm font-semibold tabular-nums">{pct(tasaEntrega)}</span>}
            />
            <p className="m-0 max-w-md text-xs text-muted-foreground">
              Pedidos de {tiendas.join(", ")} de los últimos 180 días ({entero(pedidos)} líneas). La rayita sobre cada barra marca el promedio de todos. Lo cancelado antes de salir y lo que sigue en camino no cuentan.
            </p>
          </div>
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {lista.map((f) => (
              <FilaDeEntrega key={f.clave} f={f} promedio={tasaEntrega} />
            ))}
          </ul>
          {entrega.length > 6 && (
            <button type="button" aria-expanded={todos} onClick={() => setTodos((v) => !v)} className="min-h-9 self-start rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              {todos ? "Ver menos" : `Ver los ${entrega.length - 6} restantes`}
            </button>
          )}
        </div>
      )}
    </SeccionPlegable>
  );
}

export type ClaveRanking = keyof HistorialSecciones["rankings"];
const NOMBRE_RANKING: Record<ClaveRanking, string> = { productos: "Productos", campanas: "Campañas", videos: "Videos", angulos: "Ángulos", ganchos: "Ganchos", formatos: "Formatos" };

function BarrasDeVentas({ filas }: { filas: FilaVentas[] }) {
  if (filas.length === 0) return <p className="m-0 text-sm text-muted-foreground">Todavía no hay ventas con este dato.</p>;
  const maximo = Math.max(...filas.map((f) => f.compras), 1);
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
      {filas.map((f, i) => (
        <li key={f.nombre} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-x-2">
          <span aria-hidden="true" className="pt-0.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="m-0 min-w-0 truncate text-sm font-medium" title={f.nombre}>
                {f.nombre}
              </p>
              <p className="m-0 shrink-0 text-xs tabular-nums text-muted-foreground">
                <span className="text-sm font-semibold text-foreground">{entero(f.compras)}</span> compras · {pct(f.parte)}
              </p>
            </div>
            <div className="mt-1">
              <BarraProgreso valor={f.compras} maximo={maximo} color="var(--meta-1)" alto={7} />
            </div>
            <p className="m-0 mt-1 text-xs tabular-nums text-muted-foreground">
              {f.cpa !== null ? `CPA ${dolares(f.cpa)}` : "Sin CPA"}
              {f.comprasEntregadas !== null && ` · ≈ ${entero(f.comprasEntregadas)} entregadas${f.entregaReal ? "" : " (con el promedio)"}`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Qué genera más ventas (antes una tabla de Hallazgos; 24 nov 2026 se repartió entre las pantallas): barras con las compras que Meta atribuye a cada uno y su parte del total de todo el historial. `claves` dice qué listas ofrece
 * esta pantalla (Productos solo productos; Videos, videos, ángulos, ganchos y formatos). Las entregadas son estimadas: compras × la tasa de entrega del producto.
 */
export function QueGeneraMasVentas({ historial, claves }: { historial: HistorialSecciones; claves: ClaveRanking[] }) {
  const [clave, setClave] = useState<ClaveRanking>(claves[0]);
  const filas = historial.rankings[clave];
  return (
    <SeccionPlegable titulo="Qué genera más ventas" resumen={filas[0] ? `${filas[0].nombre} · ${entero(filas[0].compras)} compras` : undefined} derecha="Todo el historial" abierta={false}>
      <div className="flex flex-col gap-3">
        {claves.length > 1 && (
          <div role="group" aria-label="Qué ordenar" className="flex flex-wrap gap-1.5">
            {claves.map((c) => (
              <button key={c} type="button" aria-pressed={clave === c} onClick={() => setClave(c)} className={`min-h-8 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${clave === c ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
                {NOMBRE_RANKING[c]}
              </button>
            ))}
          </div>
        )}
        <BarrasDeVentas filas={filas} />
        <p className="m-0 text-xs text-muted-foreground">Ordenado por las compras que Meta atribuye. «Entregadas» es una estimación: compras × la tasa de entrega del producto.</p>
      </div>
    </SeccionPlegable>
  );
}
