import { cpa, conSigno, conSignoCompacto, dolares, dolaresEnteros, GASTO_MINIMO_CONFIABLE, resultado } from "@/lib/meta-ads/metricas";
import type { ProductoVista } from "@/lib/meta-ads/vistas";
import { NOMBRE_VEREDICTO, type Veredicto } from "./def-campanas";
import { Anillo, BarraProgreso, TarjetaMeta } from "./graficas";
import { entero } from "./piezas";

const COLOR: Record<Veredicto, string> = { deja: "var(--success)", pierde: "var(--destructive)", poca_data: "var(--warning)", sin_gasto: "var(--grafica-5)" };

/** Cómo le va a un producto en el periodo: con el mismo criterio que a una campaña (gasto suficiente y el resultado estimado con su CPA tope). */
function veredictoDeProducto(p: ProductoVista): Veredicto {
  if (p.r.gasto <= 0) return "sin_gasto";
  if (p.r.gasto < GASTO_MINIMO_CONFIABLE) return "poca_data";
  return resultado(p.r, p.tope) >= 0 ? "deja" : "pierde";
}

/**
 * Arriba de Productos (24 nov 2026, pedido de Alcides: «más parecido a Videos y a Campañas, con gráficos»): cuántos productos dejan ganancia o pierden, con lo que dejaron en total, y a la derecha dónde se va el dinero: los ocho
 * productos con más gasto, cada uno con su barra del color de su veredicto, su CPA y su resultado estimado.
 */
export function ResumenProductos({ productos }: { productos: ProductoVista[] }) {
  const conNombre = productos.filter((p) => p.clave);
  if (conNombre.length === 0) return null;
  const conteo: Record<Veredicto, number> = { deja: 0, pierde: 0, poca_data: 0, sin_gasto: 0 };
  for (const p of conNombre) conteo[veredictoDeProducto(p)]++;
  const tipos = Object.keys(conteo) as Veredicto[];
  const total = conNombre.reduce((s, p) => s + resultado(p.r, p.tope), 0);
  const gasto = conNombre.reduce((s, p) => s + p.r.gasto, 0);
  const compras = conNombre.reduce((s, p) => s + p.r.compras, 0);
  const top = [...conNombre].filter((p) => p.r.gasto > 0).sort((a, b) => b.r.gasto - a.r.gasto).slice(0, 8);
  const maximo = Math.max(1, ...top.map((p) => p.r.gasto));
  const sinTope = conNombre.filter((p) => !p.topeDefinido && p.r.gasto > 0).length;
  return (
    <section aria-label="Resumen de los productos" className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <TarjetaMeta titulo="Cómo van los productos" derecha={`${conNombre.length} productos`} id="resumen-productos">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Anillo
            tamano={112}
            grosor={13}
            etiqueta={`Productos: ${tipos.map((v) => `${conteo[v]} ${NOMBRE_VEREDICTO[v].toLowerCase()}`).join(", ")}`}
            partes={tipos.map((v) => ({ nombre: NOMBRE_VEREDICTO[v], valor: conteo[v], color: COLOR[v] }))}
            centro={
              <>
                <span title={conSigno(total)} className={`text-lg font-semibold tabular-nums ${total >= 0 ? "text-success" : "text-destructive"}`}>
                  {conSignoCompacto(total)}
                </span>
                <span className="text-[11px] text-muted-foreground">estimado</span>
              </>
            }
          />
          <ul role="list" className="m-0 flex min-w-[10rem] flex-1 list-none flex-col gap-1.5 p-0 text-sm">
            {tipos.map((v) => (
              <li key={v} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR[v] }} />
                  {NOMBRE_VEREDICTO[v]}
                </span>
                <span className="font-semibold tabular-nums">{conteo[v]}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 mt-3 text-xs tabular-nums text-muted-foreground">
          {dolaresEnteros(gasto)} gastados · {entero(compras)} compras{sinTope > 0 && ` · ${sinTope} usan el CPA tope general o su ajuste`}
        </p>
      </TarjetaMeta>

      <TarjetaMeta titulo="Dónde se va el dinero" derecha="Los 8 con más gasto del periodo" id="resumen-gasto-productos">
        {top.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay productos con gasto en este periodo.</p>
        ) : (
          <ol role="list" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {top.map((p) => {
              const v = veredictoDeProducto(p);
              const res = resultado(p.r, p.tope);
              return (
                <li key={p.clave} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className="truncate font-medium" title={p.nombre}>
                    {p.nombre}
                  </span>
                  <BarraProgreso valor={p.r.gasto} maximo={maximo} color={COLOR[v]} alto={10} />
                  <span className="min-w-[10.5rem] text-right tabular-nums">
                    <span className="font-semibold">{dolaresEnteros(p.r.gasto)}</span>
                    <span className="ml-1.5 text-muted-foreground">{cpa(p.r) === null ? "Sin compras" : `CPA ${dolares(cpa(p.r)!)}`}</span>
                    {v !== "poca_data" && <span className={`ml-1.5 font-medium ${res >= 0 ? "text-success" : "text-destructive"}`}>{conSignoCompacto(res)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </TarjetaMeta>
    </section>
  );
}
