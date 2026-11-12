"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { claseThLista, claseTdLista, Indicador, MarcoTabla, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { fieldClass } from "@/components/ui/field";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CerrarIcon, CheckIcon, DeshacerIcon, EnvioIcon, InventarioIcon, PedidoIcon } from "@/lib/nav-icons";
import { ESTADOS_PEDIDO, resumirPedidos, type EstadoPedido } from "@/lib/tienda/resumen";
import type { PedidoFila } from "@/lib/tienda/datos";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ESTADO = new Map(ESTADOS_PEDIDO.map((e) => [e.id, e]));
const MAX_FILAS = 300;

/** La fecha del pedido como se lee en la lista: hoy y ayer con la hora; si no, el día. */
function cuando(iso: string, sinHora = false): string {
  const d = new Date(iso);
  // Del Excel de Finanzas: solo el día (no tiene hora).
  if (sinHora) return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
  const dia = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });
  if (dia(d) === dia(hoy)) return `hoy ${hora}`;
  if (dia(d) === dia(new Date(hoy.getTime() - 86_400_000))) return `ayer ${hora}`;
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
}

/**
 * Gestión de tienda › Pedidos: el tablero de tarjetas (filtran la lista al pulsarlas, como en Gestión de IDs) y la lista de pedidos del periodo, con
 * búsqueda por número, cliente, zona o guía. Cada pedido abre su detalle.
 */
export function PedidosTienda({
  pedidos,
  codigoPais,
  tiendas,
  sinVincular,
  conectada,
}: {
  pedidos: PedidoFila[];
  codigoPais: string;
  tiendas: Record<string, string>;
  /** Variantes de Shopify de esas tiendas que todavía no tienen producto nuestro. */
  sinVincular: number;
  /** Si alguna de las tiendas que se miran ya está conectada (sin eso, la lista vacía lo explica). */
  conectada: boolean;
}) {
  const [estado, setEstado] = useState<EstadoPedido | null>(null);
  const router = useRouter();
  const [q, setQ] = useState("");
  const r = useMemo(() => resumirPedidos(pedidos), [pedidos]);
  const filtrados = useMemo(() => {
    const t = normal(q.trim());
    return pedidos.filter(
      (p) =>
        (!estado || p.estado === estado) &&
        (!t || [p.numero, p.cliente, p.provincia, p.ciudad, p.guia, p.productos].some((x) => x && normal(x).includes(t))),
    );
  }, [pedidos, estado, q]);
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);
  const num = (n: number) => n.toLocaleString("es-PA");
  const alternar = (e: EstadoPedido) => setEstado((x) => (x === e ? null : e));
  const varias = Object.keys(tiendas).length > 1;

  return (
    <div className="flex flex-col gap-5">
      <TableroIndicadores etiqueta="Tablero de pedidos">
        <Indicador titulo="Pedidos" icono={PedidoIcon} color="violeta" valor={num(r.pedidos)} detalle="todos los del periodo" alPulsar={() => setEstado(null)} activo={!estado} />
        <Indicador titulo="Por confirmar" icono={AlertaIcon} color="ambar" punto={r.porEstado.nuevo ? "aviso" : undefined} valor={num(r.porEstado.nuevo)} detalle="esperan llamada o mensaje" alPulsar={() => alternar("nuevo")} activo={estado === "nuevo"} />
        <Indicador titulo="Confirmados" icono={CheckIcon} color="azul" valor={num(r.porEstado.confirmado)} detalle={`${pct(r.confirmacion)} pasó la confirmación`} alPulsar={() => alternar("confirmado")} activo={estado === "confirmado"} />
        <Indicador titulo="En camino" icono={EnvioIcon} color="violeta" valor={num(r.porEstado.en_camino)} detalle="con guía, sin entregar" alPulsar={() => alternar("en_camino")} activo={estado === "en_camino"} />
        <Indicador titulo="Entregados" icono={InventarioIcon} color="verde" punto={r.porEstado.entregado ? "exito" : undefined} valor={num(r.porEstado.entregado)} detalle={`${pct(r.entrega)} de lo que salió`} alPulsar={() => alternar("entregado")} activo={estado === "entregado"} />
        <Indicador titulo="Cancelados" icono={CerrarIcon} color="rojo" valor={num(r.porEstado.cancelado)} detalle={pct(r.cancelacion)} alPulsar={() => alternar("cancelado")} activo={estado === "cancelado"} />
        <Indicador titulo="Devoluciones" icono={DeshacerIcon} color="rojo" valor={num(r.porEstado.devuelto)} detalle={pct(r.devolucion)} alPulsar={() => alternar("devuelto")} activo={estado === "devuelto"} />
        <Indicador titulo="SKU sin vincular" icono={AlertaIcon} color="ambar" punto={sinVincular ? "aviso" : undefined} valor={num(sinVincular)} detalle="variantes de Shopify sin producto nuestro" href="/tienda-productos" />
      </TableroIndicadores>

      <section aria-label="Lista de pedidos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex min-w-[16rem] flex-1 items-center gap-2 text-sm text-muted-foreground sm:max-w-md">
            <span className="sr-only">Buscar</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, cliente, producto, zona o guía" className={`${fieldClass} w-full`} />
          </label>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {filtrados.length > MAX_FILAS ? `${num(MAX_FILAS)} de ${num(filtrados.length)} pedidos` : `${num(filtrados.length)} pedido${filtrados.length === 1 ? "" : "s"}`}
            {estado ? ` · ${ESTADO.get(estado)?.etiqueta.toLowerCase()}` : ""}
          </span>
        </div>
        {!filtrados.length ? (
          <div className="rounded-[10px] border border-border bg-card">
            <EstadoVacio mensaje={!pedidos.length ? (conectada ? "No hay pedidos en este periodo." : "Los pedidos aparecen aquí al conectar la tienda a Shopify.") : "Ningún pedido cumple con lo que estás filtrando."} />
          </div>
        ) : (
          <MarcoTabla ariaLabel="Pedidos">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={claseThLista}>Pedido</th>
                  {varias && <th scope="col" className={claseThLista}>Tienda</th>}
                  <th scope="col" className={claseThLista}>Fecha</th>
                  <th scope="col" className={claseThLista}>Cliente</th>
                  <th scope="col" className={claseThLista}>Productos</th>
                  <th scope="col" className={`${claseThLista} text-right`}>Unid.</th>
                  <th scope="col" className={`${claseThLista} text-right`}>Total</th>
                  <th scope="col" className={claseThLista}>Estado</th>
                  <th scope="col" className={claseThLista}>Zona</th>
                  <th scope="col" className={claseThLista}>Transportista</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, MAX_FILAS).map((p) => {
                  const e = ESTADO.get(p.estado)!;
                  return (
                    // Toda la fila abre la ficha del pedido (12 nov 2026, como en Mi Reto Digital); el número sigue siendo el enlace.
                    <tr key={p.id} onClick={() => router.push(`/tienda-pedidos/${p.id}`)} className="cursor-pointer hover:bg-muted/60">
                      <td className={claseTdLista}>
                        <Link href={`/tienda-pedidos/${p.id}`} className="font-semibold text-primario underline-offset-2 hover:underline">
                          {p.numero}
                        </Link>
                      </td>
                      {varias && <td className={claseTdLista}>{tiendas[p.tiendaId] ?? "—"}</td>}
                      <td className={`${claseTdLista} text-muted-foreground`}>{cuando(p.creado, p.sinHora)}</td>
                      <td className={claseTdLista}>{p.cliente ?? "—"}</td>
                      <td className={claseTdLista}>
                        <span className="block max-w-[18rem] truncate" title={p.productos ?? undefined}>
                          {p.productos ?? "—"}
                        </span>
                      </td>
                      <td className={`${claseTdLista} text-right tabular-nums`}>{p.unidades}</td>
                      <td className={`${claseTdLista} text-right tabular-nums`}>{formatearMoneda(p.total, codigoPais)}</td>
                      <td className={claseTdLista}>
                        <Pastilla tono={e.tono}>{e.etiqueta}</Pastilla>
                      </td>
                      <td className={`${claseTdLista} text-muted-foreground`}>{[p.provincia, p.ciudad].filter(Boolean).join(", ") || "—"}</td>
                      <td className={`${claseTdLista} text-muted-foreground`}>{p.transportista ? `${p.transportista}${p.guia ? ` · ${p.guia}` : ""}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </MarcoTabla>
        )}
      </section>
    </div>
  );
}
