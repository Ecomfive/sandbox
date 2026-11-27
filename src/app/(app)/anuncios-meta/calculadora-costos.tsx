"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { filasDeCostos, revisarCostos, type CostosGuardados, type CostosOperacion, type EntregasMeta, type FilaCosto } from "@/lib/meta-ads/costos-operacion";
import { horaDeMeta } from "@/lib/meta-ads/hora";
import { guiaDeTope, topeDeProducto, type TopeProducto } from "@/lib/meta-ads/limite";
import { dolares } from "@/lib/meta-ads/metricas";
import { ordenarPor, type CriterioOrden, type Orden } from "@/lib/meta-ads/orden";
import { MIN_PEDIDOS_RENTABILIDAD, NOMBRE_FUENTE } from "@/lib/meta-ads/rentabilidad";
import type { ProductoVista } from "@/lib/meta-ads/vistas";
import { guardarCostosMeta } from "./actions";
import { ColumnaOrdenable } from "./columna-ordenable";
import { BarraApilada } from "./graficas";
import { SeccionPlegable } from "./plegable";

const FILAS_A_LA_VISTA = 10;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const plata = (n: number | null | undefined) => (n === null || n === undefined ? "—" : dolares(n));

/** De qué está hecho el costo de una venta entregada, siempre con el mismo color. */
const PARTES = [
  { clave: "cpaReal", nombre: "Anuncios (CPA real)", color: "var(--meta-1)" },
  { clave: "envios", nombre: "Envíos", color: "var(--meta-2)" },
  { clave: "operativo", nombre: "Operativo", color: "var(--meta-3)" },
] as const;

const CAMPOS: { clave: keyof CostosOperacion; nombre: string }[] = [
  { clave: "envio", nombre: "Costo de cada envío (US$)" },
  { clave: "cod", nombre: "Comisión contra entrega (US$)" },
  { clave: "operativo", nombre: "Costo operativo por venta (US$)" },
];

const criterio = (valor: string, etiqueta: string, sentido: "asc" | "desc", de: (f: FilaCosto) => number | string | null): CriterioOrden<FilaCosto> => ({ valor, etiqueta, grupo: "Costos", sentido, de });
const CRITERIOS: CriterioOrden<FilaCosto>[] = [
  criterio("nombre", "Producto", "asc", (f) => f.nombre),
  criterio("gasto", "Gasto", "desc", (f) => f.gasto),
  criterio("cpa", "CPA de Meta", "asc", (f) => f.cpa),
  criterio("envio", "% de envío", "desc", (f) => f.envio),
  criterio("entrega", "% de entrega", "desc", (f) => f.entrega),
  criterio("cpaReal", "CPA real", "asc", (f) => f.costo?.cpaReal ?? null),
  criterio("total", "Costo por venta entregada", "asc", (f) => f.costo?.total ?? null),
  criterio("ganancia", "Ganancia por venta entregada", "desc", (f) => f.rentabilidad?.ganancia ?? null),
  criterio("noPerder", "CPA para no perder", "desc", (f) => f.rentabilidad?.cpaParaNoPerder ?? null),
];

/** Un monto que puede ser negativo, con su signo. */
const conSigno = (n: number | null) => (n === null ? "—" : `${n < 0 ? "−" : ""}${dolares(Math.abs(n))}`);

/** De dónde salen la venta y el costo del producto de una fila, en palabras (para el título de la celda). */
const origenDe = (f: FilaCosto) =>
  f.economia
    ? `${f.economia.pedidos} pedidos entregados de solo este producto: se cobra ${plata(f.economia.venta)} por pedido, con ${f.economia.unidades ?? "—"} unidades en promedio (un 2x1 cuenta 2).${f.economia.fuente ? ` Costo: ${NOMBRE_FUENTE[f.economia.fuente]}${f.economia.costoUnitario !== null ? `, ${dolares(f.economia.costoUnitario)} por unidad` : ""}.` : " Sin costo en Compras ni en la Matriz."}`
    : "Sin pedidos entregados de solo este producto en los últimos 180 días.";

/** La ganancia de una venta entregada; «Sin costo» o «—» si falta el costo o la venta. */
function Rentable({ f }: { f: FilaCosto }) {
  const r = f.rentabilidad;
  if (!r) return <span className="text-muted-foreground">{f.economia && f.economia.costoProducto === null ? "Sin costo" : "—"}</span>;
  return (
    <span className="tabular-nums">
      <span className={`block font-semibold ${r.pierde ? "text-destructive" : ""}`}>{conSigno(r.ganancia)}</span>
      {r.pierde && <span className="block text-xs font-medium text-destructive">pierde</span>}
    </span>
  );
}

const desglose = (f: FilaCosto) => (f.costo ? PARTES.map((p) => ({ nombre: p.nombre, valor: f.costo![p.clave], color: p.color })) : []);

const etiquetaDe = (f: FilaCosto) => `De qué está hecho: ${desglose(f).map((p) => `${p.nombre} ${dolares(p.valor)}`).join(", ")}`;

/** El tope de un producto: el que resulta y, si se ajustó, cuál era. */
function TopeEnTabla({ t }: { t: TopeProducto | null }) {
  if (!t) return <>—</>;
  const guia = guiaDeTope(t);
  return (
    <span className="tabular-nums">
      <span className={t.ajustado ? "font-semibold text-warning" : "font-semibold"}>{dolares(t.tope)}</span>
      <span className="block text-xs text-muted-foreground">{t.ajustado ? `ajustado, antes ${dolares(t.base)}` : t.definido ? "escrito en Cuentas" : "el general"}</span>
      {guia && (
        <span className="block text-xs">
          vigilar {dolares(guia.vigilar)} · <span className="text-destructive">apagar {dolares(guia.apagar)}</span>
        </span>
      )}
    </span>
  );
}

/** La leyenda de los tres colores. */
export function LeyendaDeCostos() {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {PARTES.map((p) => (
        <span key={p.clave} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.color }} />
          {p.nombre}
        </span>
      ))}
    </p>
  );
}

/**
 * La calculadora de costos de operación (25 nov 2026, pedido de Alcides, de su hoja): cuánto cuesta cada venta que sí se entrega, sumando los anuncios (el CPA de Meta repartido entre lo que se envía y se entrega), los envíos
 * y el costo operativo. Sin el costo del producto, sin precios de venta y sin IVA. Lo que se escribe arriba recalcula la tabla al momento; «Guardar» lo deja para todos.
 */
export function CalculadoraCostos({ productos, entrega, costos, guardados, escribe }: { productos: ProductoVista[]; entrega: EntregasMeta | null; costos: CostosOperacion; guardados: CostosGuardados | null; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [guardando, iniciar] = useTransition();
  const aTexto = (c: CostosOperacion) => ({ envio: String(c.envio), cod: String(c.cod), operativo: String(c.operativo) });
  const [escrito, setEscrito] = useState(() => aTexto(costos));
  const [orden, setOrden] = useState<Orden | null>(null);
  const [todas, setTodas] = useState(false);
  const revisado = revisarCostos(escrito);
  const usados = "costos" in revisado ? revisado.costos : costos;
  const cambiado = "costos" in revisado && CAMPOS.some((c) => revisado.costos[c.clave] !== costos[c.clave]);

  const filas = entrega ? filasDeCostos(productos.map((p) => ({ clave: p.clave, nombre: p.nombre, gasto: p.r.gasto, compras: p.r.compras })), entrega.productos, entrega.tienda, usados, entrega.economia) : [];
  // Un análisis guardado antes del 27 nov 2026 no trae la venta ni el costo del producto: salen con el siguiente.
  const sinEconomia = !!entrega && !entrega.economia;
  const ordenadas = orden ? ordenarPor(filas, CRITERIOS, [orden], (f) => f.gasto) : filas;
  const visibles = todas ? ordenadas : ordenadas.slice(0, FILAS_A_LA_VISTA);
  // El tope de cada producto: el de Cuentas si se escribió uno; si no, el general ajustado por su envío y entrega (los costos de arriba no lo mueven).
  const topeDe = (clave: string) => {
    const p = productos.find((x) => x.clave === clave);
    return entrega ? topeDeProducto(p?.topeDefinido ? p.tope : undefined, entrega.productos[clave], entrega.tienda) : null;
  };
  const conTienda = filas.some((f) => f.envioDeLaTienda || f.entregaDeLaTienda);
  const columna = (valor: string, texto: string, clase: string) => <ColumnaOrdenable criterio={valor} texto={texto} natural={CRITERIOS.find((c) => c.valor === valor)?.sentido} clase={clase} orden={orden} alElegir={setOrden} />;

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarCostosMeta(escrito);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Costos guardados.");
        router.refresh();
      }
    });

  return (
    <SeccionPlegable titulo="Costo de cada venta entregada" resumen={`Envío ${dolares(usados.envio)} · Operativo ${dolares(usados.operativo)}`} derecha={<span className="hidden sm:inline">Con el costo del producto de Compras · sin flete ni IVA</span>} sinRelleno>
      <form
        className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (escribe && cambiado) guardar();
        }}
      >
        {CAMPOS.map((c) => (
          <label key={c.clave} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {c.nombre}
            <input type="number" inputMode="decimal" min="0" max="500" step="0.01" value={escrito[c.clave]} onChange={(e) => setEscrito((x) => ({ ...x, [c.clave]: e.target.value }))} className={`${fieldClassSm} w-44 text-foreground`} />
          </label>
        ))}
        {escribe && cambiado && (
          <>
            <button type="submit" disabled={guardando} className="min-h-9 cursor-pointer rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-60">
              {guardando ? "Guardando…" : "Guardar para todos"}
            </button>
            <button type="button" onClick={() => setEscrito(aTexto(costos))} className="min-h-9 cursor-pointer rounded-md border border-border-control bg-card px-4 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              Descartar
            </button>
          </>
        )}
        <p className="m-0 min-w-0 flex-1 basis-56 text-xs text-muted-foreground" aria-live="polite">
          {"error" in revisado ? (
            <span className="font-medium text-destructive">{revisado.error}</span>
          ) : cambiado ? (
            escribe ? "Prueba sin guardar: la tabla ya usa estos valores." : "Prueba solo para ti: la tabla ya usa estos valores."
          ) : guardados ? (
            `Guardados${guardados.por ? ` por ${guardados.por}` : ""} el ${horaDeMeta(guardados.en)}.`
          ) : (
            "Son los valores de la hoja de la calculadora; todavía nadie ha guardado otros."
          )}
        </p>
      </form>

      {!entrega ? (
        <p className="m-0 px-4 py-4 text-sm text-muted-foreground" role="status">
          Leyendo los pedidos de la tienda…
        </p>
      ) : (
        <>
          {entrega.tienda.envio === null && (
            <p className="m-0 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning">
              Todavía no hay porcentaje de envío: se calcula con el siguiente análisis. Para tenerlo ya, pulsa «Actualizar el análisis ahora» en Hallazgos.
            </p>
          )}
          {sinEconomia && (
            <p className="m-0 border-b border-border bg-primario-suave px-4 py-2 text-xs text-foreground">
              La venta y el costo del producto salen con el siguiente análisis. Para tenerlos ya, pulsa «Actualizar el análisis ahora» en Hallazgos.
            </p>
          )}
          {filas.length === 0 ? (
            <p className="m-0 px-4 py-4 text-sm text-muted-foreground">Ningún producto de esta vista gastó en el periodo elegido.</p>
          ) : (
            <>
              {/* En el celular, una tarjeta por producto con lo que importa primero: lo que cuesta cada venta. */}
              <ul role="list" aria-label="Costo de cada venta entregada por producto" className="m-0 flex list-none flex-col divide-y divide-border p-0 md:hidden">
                {visibles.map((f) => (
                  <li key={f.clave} className="flex flex-col gap-1.5 px-4 py-3 text-xs tabular-nums">
                    <p className="m-0 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-medium">{f.nombre}</span>
                      <span className="shrink-0 text-sm font-semibold">{plata(f.costo?.total)}</span>
                    </p>
                    {f.costo && <BarraApilada partes={desglose(f)} alto={5} etiqueta={etiquetaDe(f)} />}
                    <p className="m-0 text-muted-foreground">
                      CPA de Meta {f.cpa === null ? "sin compras" : dolares(f.cpa)} · CPA real {plata(f.costo?.cpaReal)} · envíos {plata(f.costo?.envios)} · operativo {plata(f.costo?.operativo)}
                    </p>
                    <p className="m-0 text-muted-foreground">
                      Envía {pct(f.envio)}
                      {f.envioDeLaTienda ? "*" : ""} · entrega {pct(f.entrega)}
                      {f.entregaDeLaTienda ? "*" : ""} · gastó {dolares(f.gasto)}
                    </p>
                    {f.rentabilidad && (
                      <p className={`m-0 ${f.rentabilidad.pierde ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        Venta {dolares(f.rentabilidad.venta)} · producto {dolares(f.rentabilidad.producto)} · deja {conSigno(f.rentabilidad.ganancia)} por venta · no pierde hasta un CPA de {dolares(f.rentabilidad.cpaParaNoPerder)}
                      </p>
                    )}
                    <p className="m-0 flex flex-wrap items-baseline gap-1.5">
                      <span className="text-muted-foreground">CPA tope</span>
                      <TopeEnTabla t={topeDe(f.clave)} />
                    </p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="tabla-datos w-full min-w-[84rem] border-collapse text-sm">
                  <caption className="sr-only">Costo de cada venta entregada por producto, en el periodo elegido</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {columna("nombre", "Producto", "px-4 py-2 text-left")}
                      {columna("gasto", "Gasto", "px-3 py-2 text-right")}
                      {columna("cpa", "CPA de Meta", "px-3 py-2 text-right")}
                      {columna("envio", "% envío", "px-3 py-2 text-right")}
                      {columna("entrega", "% entrega", "px-3 py-2 text-right")}
                      {columna("cpaReal", "CPA real", "px-3 py-2 text-right")}
                      <th scope="col" className="px-3 py-2 text-right font-medium">Envíos</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Operativo</th>
                      {columna("total", "Costo por venta entregada", "px-3 py-2 text-right")}
                      <th scope="col" className="px-3 py-2 text-right font-medium">Venta</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Producto</th>
                      {columna("ganancia", "Ganancia por venta entregada", "px-3 py-2 text-right")}
                      {columna("noPerder", "CPA para no perder", "px-3 py-2 text-right")}
                      <th scope="col" className="px-4 py-2 text-right font-medium">CPA tope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibles.map((f) => (
                      <tr key={f.clave} className="tabular-nums">
                        <th scope="row" className="max-w-[18rem] px-4 py-2.5 text-left font-medium">
                          <span className="block truncate" title={f.nombre}>
                            {f.nombre}
                          </span>
                        </th>
                        <td className="px-3 py-2.5 text-right">{dolares(f.gasto)}</td>
                        <td className="px-3 py-2.5 text-right">{f.cpa === null ? "Sin compras" : dolares(f.cpa)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {pct(f.envio)}
                          {f.envioDeLaTienda && <abbr title="El de toda la tienda: este producto tiene pocos pedidos" className="no-underline">*</abbr>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {pct(f.entrega)}
                          {f.entregaDeLaTienda && <abbr title="El de toda la tienda: este producto tiene pocos pedidos" className="no-underline">*</abbr>}
                        </td>
                        <td className="px-3 py-2.5 text-right">{plata(f.costo?.cpaReal)}</td>
                        <td className="px-3 py-2.5 text-right">{plata(f.costo?.envios)}</td>
                        <td className="px-3 py-2.5 text-right">{plata(f.costo?.operativo)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="block font-semibold">{plata(f.costo?.total)}</span>
                          {f.costo && (
                            <span className="mt-1 ml-auto block w-36">
                              <BarraApilada partes={desglose(f)} alto={5} etiqueta={etiquetaDe(f)} />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right" title={origenDe(f)}>
                          {plata(f.economia && f.economia.pedidos >= MIN_PEDIDOS_RENTABILIDAD ? f.economia.venta : null)}
                        </td>
                        <td className="px-3 py-2.5 text-right" title={origenDe(f)}>
                          {f.economia?.costoProducto != null ? (
                            <>
                              <span className="block">{dolares(f.economia.costoProducto)}</span>
                              <span className="block text-xs text-muted-foreground">{f.economia.fuente === "matriz" ? "de la Matriz" : `${f.economia.unidades ?? 1} ud. por pedido`}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sin costo</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Rentable f={f} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {f.rentabilidad ? <span className={`font-semibold ${f.cpa !== null && f.cpa > f.rentabilidad.cpaParaNoPerder ? "text-destructive" : ""}`}>{dolares(f.rentabilidad.cpaParaNoPerder)}</span> : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <TopeEnTabla t={topeDe(f.clave)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
                <LeyendaDeCostos />
                {conTienda && <p className="m-0 text-xs text-muted-foreground">* Porcentaje de toda la tienda (el producto tiene pocos pedidos).</p>}
                {filas.length > FILAS_A_LA_VISTA && (
                  <button type="button" aria-expanded={todas} onClick={() => setTodas((v) => !v)} className="ml-auto min-h-8 cursor-pointer rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                    {todas ? "Ver menos" : `Ver los ${filas.length} productos`}
                  </button>
                )}
              </div>
            </>
          )}
          <details className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <summary className="min-h-6 cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Cómo se calcula</summary>
            <ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5">
              <li>% de envío: pedidos enviados entre los ya decididos (enviados, cancelados o sin gestionar). % de entrega: entregados entre entregados y devueltos. Pedidos de la tienda de los últimos 180 días.</li>
              <li>CPA real = CPA de Meta ÷ (% de envío × % de entrega).</li>
              <li>Envíos = envío + comisión × % de entrega + (1 − % de entrega) × envío.</li>
              <li>Costo por venta entregada = CPA real + envíos + costo operativo.</li>
              <li>Venta: lo que se cobra por pedido, con los pedidos entregados de solo ese producto de los últimos 180 días (hacen falta al menos 5). Producto: costo por unidad × unidades del pedido; un 2x1 o un «PACK 2» cuenta como 2 unidades. El costo es el promedio de Compras (primero el del país); si no hay, el de la Matriz, que puede estar desactualizado. Sin flete ni IVA.</li>
              <li>Ganancia por venta entregada = venta − producto − costo por venta entregada. En rojo y con «pierde»: con el CPA de ahora se pierde plata en cada venta.</li>
              <li>CPA para no perder = (venta − producto − envíos − operativo) × % de envío × % de entrega: el CPA de Meta más alto con el que una venta entregada todavía no pierde. Por ahora solo informa: no cambia el CPA tope ni lo que el sistema recomienda apagar.</li>
              <li>CPA tope: el general ($10) baja como mucho a $9 en el producto al que le llegan menos ventas que a la tienda (% de envío × % de entrega): $1 si le llegan un 25 % menos o peor, y en proporción si es menos. Nunca sube, uno escrito en Cuentas se usa tal cual y los costos de arriba no lo cambian. Con ese tope el sistema decide qué apagar y qué no tocar.</li>
            </ul>
          </details>
        </>
      )}
    </SeccionPlegable>
  );
}
