"use client";

import type { ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { etiquetaFase } from "@/lib/crm/areas";
import { DIAS_SIN_PEDIR, diasEntre, etiquetaUltimoPedido, montoCorto, type FilaDropshipper } from "./def-crm";

/** Las columnas de la fila en pantalla ancha; las usa también el encabezado de la lista, así que van juntas. */
const COLUMNAS = "lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_1rem]";

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** «14:05» si es de hoy, «ayer», «26 oct». */
function cuando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date(hoy.getTime() - 86_400_000).toDateString()) return "ayer";
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short" });
}

/** Una celda de la fila: lo principal arriba y lo de apoyo abajo; el nombre del dato solo se lee con lector de pantalla. */
function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full overflow-hidden text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

/** El nombre de cada columna, en la franja fija de arriba de la lista (solo en pantalla ancha). */
export function EncabezadoFilasCrm() {
  const columnas: { nombre: string; derecha?: boolean }[] = [
    { nombre: "Dropshipper" },
    { nombre: "Vende en" },
    { nombre: "Pedidos del mes", derecha: true },
    { nombre: "Último pedido" },
    { nombre: "WhatsApp" },
    { nombre: "Casos" },
    { nombre: "Responsable" },
  ];
  return (
    <div className={`hidden items-center gap-x-4 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${COLUMNAS}`}>
      {columnas.map((c) => (
        <span key={c.nombre} className={`min-w-0 truncate ${c.derecha ? "text-right" : ""}`}>
          {c.nombre}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/**
 * Un dropshipper como fila de la lista (26 oct 2026, al estilo de Gestión de IDs Dropi): sus iniciales y su nombre con código y
 * tiendas, dónde vende, pedidos y ventas del mes, el último pedido (en ámbar si lleva un mes sin pedir), su último mensaje de WhatsApp
 * con los no leídos, sus casos y quién lo lleva. Toda la fila abre su ficha.
 */
export function FilaDropshipperLista({ d, codigoPais, hoy, alAbrir }: { d: FilaDropshipper; codigoPais: string; hoy: string; alAbrir: () => void }) {
  const sinPedir = d.estado === "activo" && !!d.ultimoPedido && diasEntre(d.ultimoPedido, hoy) >= DIAS_SIN_PEDIR;
  const cuentas = [...new Set(d.cuentas.map((c) => `${c.plataforma} ${c.codigoPais}`.trim()))];
  const w = d.whatsapp;
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha de ${d.nombre}`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${COLUMNAS} ${anilloFoco}`}
    >
      {/* Dropshipper */}
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primario-suave text-[13px] font-semibold text-primario">
          {iniciales(d.nombre)}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{d.nombre}</span>
            {d.nivel === "vip" && <span className="shrink-0 rounded-[5px] bg-primario-suave px-1.5 text-[11px] font-semibold text-primario">VIP</span>}
            {d.fase !== "activo" && <span className="shrink-0 rounded-[5px] bg-azul-soft px-1.5 text-[11px] font-medium text-azul">{etiquetaFase(d.fase)}</span>}
            {d.estado !== "activo" && d.fase === "activo" && <span className="shrink-0 rounded-[5px] bg-muted px-1.5 text-[11px] font-medium text-muted-foreground capitalize">{d.estado}</span>}
          </span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {d.codigo}
            {d.tiendas.length ? ` · ${d.tiendas.join(", ")}` : ""}
          </span>
        </span>
      </span>

      {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del nombre en una fila que envuelve. */}
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda
          nombre="Vende en"
          principal={
            cuentas.length ? (
              <span className="flex flex-wrap gap-1">
                {cuentas.map((c) => (
                  <span key={c} className="rounded-[5px] bg-muted px-1.5 py-px text-xs font-medium text-foreground-soft">
                    {c}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sin cuenta vinculada</span>
            )
          }
        />
        <Celda
          nombre="Pedidos del mes"
          alinear="derecha"
          principal={<span className="font-semibold tabular-nums">{d.pedidosMes ? d.pedidosMes.toLocaleString("es-PA") : "—"}</span>}
          apoyo={d.ventasMes ? <span className="tabular-nums">{montoCorto(d.ventasMes, codigoPais)}</span> : undefined}
        />
        <Celda
          nombre="Último pedido"
          principal={
            <span className={`inline-flex items-center gap-1.5 ${sinPedir ? "font-medium text-warning" : d.ultimoPedido ? "" : "text-muted-foreground"}`}>
              {sinPedir && <span role="img" aria-label={`Sin pedir hace ${DIAS_SIN_PEDIR} días o más`} className="h-2 w-2 shrink-0 rounded-full bg-warning" />}
              {etiquetaUltimoPedido(d.ultimoPedido, hoy)}
            </span>
          }
        />
        <Celda
          nombre="WhatsApp"
          principal={
            w ? (
              <span className="flex min-w-0 items-center gap-2">
                {w.noLeidos > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white" aria-label={`${w.noLeidos} sin leer`}>
                    {w.noLeidos}
                  </span>
                )}
                <span className={`truncate ${w.sinResponder ? "font-medium text-foreground" : "text-foreground-soft"}`}>
                  {w.ultimoDe === "saliente" ? "Tú: " : ""}
                  {w.ultimoTexto ?? "—"}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sin chat</span>
            )
          }
          apoyo={w ? <span className={w.sinResponder ? "font-medium text-destructive" : ""}>{w.sinResponder ? "Sin responder · " : ""}{cuando(w.ultimoMensajeEn)}</span> : undefined}
        />
        <Celda
          nombre="Casos abiertos"
          principal={
            d.casosAbiertos ? (
              <span className="rounded-[5px] bg-warning-soft px-1.5 py-px text-xs font-medium text-warning">
                {d.casosAbiertos} {d.casosAbiertos === 1 ? "abierto" : "abiertos"}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
        />
        <Celda nombre="Responsable" principal={d.responsable ? <span className="truncate text-foreground-soft">{d.responsable}</span> : <span className="text-xs text-muted-foreground">Sin asignar</span>} />
      </span>

      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
}
