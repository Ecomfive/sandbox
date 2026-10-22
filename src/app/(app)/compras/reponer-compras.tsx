"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CabeceraTarjeta, Indicador, Segmentado, claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { COBERTURAS, DIAS_COBERTURA, filasReponer, type EnCamino } from "@/lib/compras/reponer";
import { DIAS_REPONER, type ResumenProducto } from "@/lib/publicaciones/ventas";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const fecha = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/**
 * Compras › Reponer: cada SKU (o producto de Dropi sin vincular) que se vende y no tiene stock o se acaba en menos de 15 días,
 * con lo que viene en compras abiertas y cuánto comprar para cubrir los días elegidos. «Crear compra» abre la compra nueva con
 * ese producto y esa cantidad.
 */
export function ReponerCompras({
  pais,
  corte,
  stockLeido = null,
  resumen,
  skuDe,
  enCamino,
  comprasSinCargar,
}: {
  pais: { codigo: string; nombre: string };
  corte: string;
  /** La última lectura de «Mis productos» de Dropi, ya escrita en hora de Panamá: de ahí sale el stock. */
  stockLeido?: string | null;
  resumen: ResumenProducto[];
  skuDe: [number, { id: string; codigo: string; nombre: string }][];
  enCamino: [string, EnCamino][];
  comprasSinCargar: boolean;
}) {
  const [dias, setDias] = useState<number>(DIAS_COBERTURA);
  const filas = useMemo(() => filasReponer(resumen, new Map(skuDe), new Map(enCamino), dias), [resumen, skuDe, enCamino, dias]);
  const sinStock = filas.filter((f) => f.stock <= 0).length;
  const sugeridas = filas.reduce((a, f) => a + f.sugerido, 0);
  const conCompra = filas.filter((f) => f.enCamino.unidades > 0).length;
  const sinVincular = filas.filter((f) => !f.sku).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Reponer</h2>
        <p className="max-w-[75ch] text-sm text-muted-foreground">
          Lo que se vende en Dropi {pais.nombre} y no tiene stock o le alcanza para menos de {DIAS_REPONER} días. Lo sugerido cubre {dias} días de venta al ritmo de los últimos 30, menos el stock y lo que ya viene en compras abiertas.
        </p>
        <p className="text-xs text-muted-foreground">
          Ventas de Dropi hasta el {fecha(corte)} (Desempeño › Ventas Dropi)
          {stockLeido ? `; el stock es el de la última actualización desde Dropi (${stockLeido})` : ""}. Solo lo ven los administradores.
        </p>
      </header>

      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo="Productos para reponer" valor={entero(filas.length)} detalle={`${sinStock} ya sin stock`} punto={sinStock ? "peligro" : undefined} />
          <Indicador titulo="Unidades sugeridas" valor={entero(sugeridas)} detalle={`para ${dias} días de venta`} />
          <Indicador titulo="Con compra en camino" valor={entero(conCompra)} detalle="ya tienen una compra abierta" />
          <Indicador titulo="Sin vincular a Producto" punto={sinVincular ? "aviso" : undefined} valor={entero(sinVincular)} detalle="no se pueden comprar desde aquí" />
        </div>
      </section>

      {comprasSinCargar && (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras abiertas: lo sugerido no descuenta lo que viene en camino.
        </p>
      )}

      <section aria-labelledby="rp-lista" className="min-w-0 rounded-[10px] border border-border bg-card">
        <CabeceraTarjeta id="rp-lista" titulo={`Para reponer (${filas.length})`}>
          <Segmentado etiqueta="Cubrir" valor={String(dias)} alCambiar={(v) => setDias(Number(v))} opciones={COBERTURAS.map((d) => ({ valor: String(d), etiqueta: `${d} días` }))} />
        </CabeceraTarjeta>
        {filas.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">Nada que reponer: todo lo que se vende tiene stock para más de {DIAS_REPONER} días.</p>
        ) : (
          <div role="region" aria-label="Productos para reponer" tabIndex={0} className={`overflow-x-auto ${anilloFoco}`}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={claseThLista}>Producto</th>
                  <th className={`${claseThLista} text-right`}>Netas 30 días</th>
                  <th className={`${claseThLista} text-right`}>Por día</th>
                  <th className={`${claseThLista} text-right`}>Stock en Dropi</th>
                  <th className={`${claseThLista} text-right`}>Días de inventario</th>
                  <th className={claseThLista}>En camino</th>
                  <th className={`${claseThLista} text-right`}>Sugerido</th>
                  <th className={claseThLista}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.sku?.id ?? `d${f.dropiIds[0]}`}>
                    <td className={`${claseTdLista} whitespace-normal`}>
                      <span className="flex min-w-[14rem] max-w-[24rem] flex-col">
                        <span className="font-medium">{f.nombre}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {f.sku ? <span className="font-mono">{f.sku.codigo}</span> : <span className="text-warning">Sin vincular a Producto</span>}
                          {" · "}
                          {f.dropiIds.length === 1 ? `ID Dropi ${f.dropiIds[0]}` : `IDs Dropi ${f.dropiIds.join(", ")}`}
                        </span>
                      </span>
                    </td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{entero(f.netas30)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{f.porDia.toLocaleString("es-PA", { maximumFractionDigits: 1 })}</td>
                    <td className={`${claseTdLista} text-right tabular-nums ${f.stock <= 0 ? "font-semibold text-destructive" : ""}`}>{entero(f.stock)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums ${f.diasInventario !== null && f.diasInventario < 7 ? "font-semibold text-destructive" : "font-semibold text-warning"}`}>{f.diasInventario === null ? "—" : entero(f.diasInventario)}</td>
                    <td className={`${claseTdLista} whitespace-normal`}>
                      {f.enCamino.unidades > 0 ? (
                        <span className="flex min-w-[10rem] flex-col text-xs">
                          <span className="font-medium tabular-nums">{entero(f.enCamino.unidades)} u.</span>
                          {f.enCamino.compras.slice(0, 2).map((c) => (
                            <span key={c.numero} className="text-muted-foreground">
                              {c.numero} · {c.etapa}
                              {c.planificacion ? ` · ${c.planificacion}` : ""}
                            </span>
                          ))}
                          {f.enCamino.compras.length > 2 && <span className="text-muted-foreground">y {f.enCamino.compras.length - 2} más</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nada</span>
                      )}
                    </td>
                    <td className={`${claseTdLista} text-right text-base font-semibold tabular-nums`}>{f.sugerido > 0 ? entero(f.sugerido) : "—"}</td>
                    <td className={claseTdLista}>
                      {f.sku && f.sugerido > 0 ? (
                        <Link
                          href={`/compras/lista?ver=${encodeURIComponent(pais.codigo)}&reponer=${f.sku.id}.${f.sugerido}`}
                          className={`inline-flex items-center rounded-md border border-primario/40 bg-primario-suave px-2.5 py-1 text-xs font-medium whitespace-nowrap text-primario hover:border-primario ${anilloFoco}`}
                        >
                          Crear compra
                        </Link>
                      ) : !f.sku ? (
                        <Link href="/publicaciones-dropi" className={`text-xs font-medium whitespace-nowrap text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
                          Vincular
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ya alcanza</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
