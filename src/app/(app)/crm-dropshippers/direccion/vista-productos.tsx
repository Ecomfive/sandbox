"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { BotonBarra, MarcoTabla, Pastilla, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { useToast } from "@/components/ui/toast";
import { DIAS_SE_ACABA, ETIQUETA_ESTADO_STOCK, type EstadoStock, type ProductoCartera } from "@/lib/crm/productos";
import { ETIQUETA_SEGMENTO } from "@/lib/crm/salud";
import type { FilaDireccion } from "./datos-direccion";
import type { DatosProductos } from "./datos-productos";
import { descargarLista } from "./lista-csv";

type TonoPastilla = "neutro" | "exito" | "aviso" | "peligro" | "oscuro";
export const TONO_STOCK: Record<EstadoStock, TonoPastilla> = { agotado: "peligro", se_acaba: "peligro", reponer: "aviso", ok: "exito", sin_dato: "neutro" };
const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });

/** «500 u. · llega 12 nov», «500 u. sin fecha» o «Nada». */
export function textoCamino(c: ProductoCartera["camino"]): string {
  if (!c) return "Nada";
  return `${c.unidades.toLocaleString("es")} u.${c.llegada ? ` · llega ${fechaCorta(c.llegada)}` : " sin fecha"}`;
}

type Filtro = "todos" | "riesgo" | "reponer";
const POR_PAGINA = 50;

/**
 * Dirección › Productos (fase 3): lo que vende la cartera, con stock, días de stock y lo que viene en camino. Primero lo que se acaba; cada
 * fila se abre para ver quién lo vende y descargar esa lista (para avisarles). No envía nada.
 */
export function VistaProductos({ datos, clientes, codigoPais }: { datos: DatosProductos; clientes: FilaDireccion[]; codigoPais: string }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const enRiesgo = datos.productos.filter((p) => p.estado === "agotado" || p.estado === "se_acaba");
  const afectados = new Set(enRiesgo.flatMap((p) => p.clientes.map((c) => c.dropshipperId)));
  const pedidosEnRiesgo = enRiesgo.reduce((t, p) => t + p.pedidos, 0);
  const sinCamino = enRiesgo.filter((p) => !p.camino).length;

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return datos.productos.filter(
      (p) =>
        (filtro === "todos" || (filtro === "riesgo" ? p.estado === "agotado" || p.estado === "se_acaba" : p.estado === "reponer")) &&
        (!q || `${p.nombre} ${p.productoId}`.toLowerCase().includes(q)),
    );
  }, [datos.productos, filtro, busca]);

  function descargar(p: ProductoCartera) {
    const filas = p.clientes.map((c) => porId.get(c.dropshipperId)).filter((f): f is FilaDireccion => !!f);
    const pedidosDe = new Map(p.clientes.map((c) => [c.dropshipperId, c.pedidos]));
    empezar(async () => {
      const r = await descargarLista(filas, `venden ${p.nombre}`, `venden-${p.productoId}`, { titulo: `Pedidos de ${p.nombre} (30 días)`, valor: (f) => pedidosDe.get(f.id) ?? 0 });
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`Lista de ${filas.length} dropshippers descargada${r.conTelefono ? " con su WhatsApp" : ""}.`);
    });
  }

  return (
    <>
      {datos.sinStock && (
        <p role="status" className="m-0 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-warning">
          No hay ventas de Dropi cargadas para {codigoPais} (Desempeño › Ventas Dropi): sin ellas no se sabe el stock ni cuánto dura.
        </p>
      )}
      <KpiGrid>
        <KpiCard titulo={`Se acaban en ${DIAS_SE_ACABA} días o ya se agotaron`} valor={enRiesgo.length} subtexto={`${sinCamino} sin nada en camino`} tono={enRiesgo.length ? "destructive" : "success"} />
        <KpiCard titulo="Dropshippers afectados" valor={afectados.size} subtexto={`${pedidosEnRiesgo.toLocaleString("es")} pedidos en 30 días de esos productos`} tono={afectados.size ? "warning" : "neutral"} />
        <KpiCard titulo="Productos que vende la cartera" valor={datos.productos.length} subtexto="Con pedidos en los últimos 30 días" />
      </KpiGrid>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar productos">
          {(
            [
              ["todos", "Todos"],
              ["riesgo", "Se acaban o agotados"],
              ["reponer", "Reponer pronto"],
            ] as [Filtro, string][]
          ).map(([v, e]) => (
            <BotonBarra key={v} activo={filtro === v} onClick={() => (setFiltro(v), setMostrar(POR_PAGINA))}>
              {e}
            </BotonBarra>
          ))}
        </div>
        <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1 sm:flex-none">
          <span className={labelClassSm}>Buscar</span>
          <input type="search" value={busca} onChange={(e) => (setBusca(e.target.value), setMostrar(POR_PAGINA))} placeholder="Producto o ID de Dropi" className={`${fieldClass} w-full sm:w-64`} />
        </label>
      </div>

      <MarcoTabla ariaLabel="Productos que vende la cartera">
        <table className="w-full min-w-[60rem] border-collapse">
          <thead>
            <tr>
              {["Producto", "Stock", "Días de stock", "En camino", "Dropshippers", "Pedidos 30 días"].map((t) => (
                <th key={t} scope="col" className={claseTh}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Ningún producto coincide.
                </td>
              </tr>
            ) : (
              lista.slice(0, mostrar).map((p) => {
                const aqui = abierto === p.productoId;
                return (
                  <Fragment key={p.productoId}>
                    <tr className={aqui ? "bg-muted" : "hover:bg-muted"}>
                      <td className={`${claseTd} whitespace-normal`}>
                        <button type="button" aria-expanded={aqui} onClick={() => setAbierto(aqui ? null : p.productoId)} className={`flex flex-col items-start rounded text-left ${anilloFoco}`}>
                          <span className="font-medium">{p.nombre}</span>
                          <span className="text-xs text-muted-foreground">ID {p.productoId}</span>
                        </button>
                      </td>
                      <td className={claseTd}>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{p.stock === null ? "—" : p.stock.toLocaleString("es")}</span>
                          <Pastilla tono={TONO_STOCK[p.estado]}>{ETIQUETA_ESTADO_STOCK[p.estado]}</Pastilla>
                        </span>
                      </td>
                      <td className={`${claseTd} tabular-nums`}>{p.diasInventario === null ? "—" : p.diasInventario}</td>
                      <td className={`${claseTd} ${!p.camino && (p.estado === "agotado" || p.estado === "se_acaba") ? "font-medium text-destructive" : ""}`}>{textoCamino(p.camino)}</td>
                      <td className={`${claseTd} tabular-nums`}>{p.dropshippers}</td>
                      <td className={`${claseTd} tabular-nums`}>{p.pedidos.toLocaleString("es")}</td>
                    </tr>
                    {aqui && (
                      <tr>
                        <td colSpan={6} className="border-b border-border bg-card px-4 py-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="m-0 text-sm font-medium">Quién lo vende ({p.clientes.length})</p>
                              <BotonBarra onClick={() => descargar(p)} disabled={pendiente}>
                                {pendiente ? "Preparando…" : "Descargar la lista"}
                              </BotonBarra>
                            </div>
                            <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 text-sm sm:grid-cols-2 xl:grid-cols-3">
                              {p.clientes.slice(0, 30).map((c) => {
                                const f = porId.get(c.dropshipperId);
                                return (
                                  <li key={c.dropshipperId} className="flex items-center justify-between gap-2">
                                    <Link href={`/crm-dropshippers?abrir=${c.dropshipperId}`} className={`truncate hover:underline ${anilloFoco}`}>
                                      {f?.nombre ?? "Dropshipper"} <span className="text-xs text-muted-foreground">{f?.codigo}</span>
                                    </Link>
                                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                      {c.pedidos} pedidos{f ? ` · ${ETIQUETA_SEGMENTO[f.segmento]}` : ""}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            {p.clientes.length > 30 && <p className="m-0 text-xs text-muted-foreground">Y {p.clientes.length - 30} más: están en la lista que se descarga.</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </MarcoTabla>
      {lista.length > mostrar && (
        <div className="flex justify-center">
          <BotonBarra onClick={() => setMostrar((m) => m + POR_PAGINA)}>
            Ver {Math.min(POR_PAGINA, lista.length - mostrar)} más de {lista.length - mostrar}
          </BotonBarra>
        </div>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        Pedidos de los dropshippers con cuenta vinculada en {codigoPais}, sin cancelados. El stock y los días de stock son los de Dropi (Desempeño › Ventas Dropi); lo que viene en camino sale de Compras, por el producto vinculado en Gestión de IDs Dropi.
      </p>
    </>
  );
}
