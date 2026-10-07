"use client";

import { BotonBarra, CabeceraTarjeta, Pastilla } from "@/components/panel/piezas-panel";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { colorEtapa, etiquetaEstado, etiquetaEtapa, etiquetaVia, ETAPAS_COMPRA, prioridadDe, valorUnitario, type FilaCompra, numeroOC, resumenLineas } from "./def-compras";
import { diasEntre, estaAbierta, hoy, usd } from "./calculos-compras";

// El recorrido de una compra (sin Backlog ni Descartado) para la barra de avance.
const RECORRIDO = ETAPAS_COMPRA.filter((e) => e.valor !== "backlog" && e.valor !== "descartado").map((e) => e.valor as string);

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 truncate text-[13px]">{children}</dd>
    </div>
  );
}

/** La ficha minimizada: una franja angosta a la derecha; al pulsarla se vuelve a abrir. */
export function FichaMinimizada({ alAbrir }: { alAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label="Mostrar la ficha de la compra"
      title="Mostrar la ficha"
      className={`hidden flex-col items-center gap-2 rounded-[10px] border border-border bg-card py-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground min-[1100px]:sticky min-[1100px]:top-[calc(var(--alto-barra,3.5rem)+1rem)] min-[1100px]:flex ${anilloFoco}`}
    >
      <span aria-hidden="true">←</span>
      <span className="[writing-mode:vertical-rl]">Ficha de compra</span>
    </button>
  );
}

/**
 * La ficha fija a la derecha de la lista de compras (como la de Productos Test): en qué etapa va y cuánto falta, sus
 * fechas clave con los días entre una y otra (de ahí salen los tiempos por tramo), montos y datos de envío. «Abrir ficha
 * completa» abre el formulario con la actividad (comentarios, adjuntos, historial).
 */
export function FichaLateralCompra({
  compra,
  orden,
  alIr,
  alAbrir,
  alMinimizar,
  alCerrar,
}: {
  compra: FilaCompra | null;
  orden: string[];
  alIr: (id: string) => void;
  alAbrir: () => void;
  /** Guarda la ficha a la derecha para que la tabla use todo el ancho. */
  alMinimizar: () => void;
  /** Cierra el resumen (la tabla vuelve a usar todo el ancho). */
  alCerrar?: () => void;
}) {
  if (!compra) {
    return (
      <aside className="rounded-[10px] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground min-[1100px]:sticky min-[1100px]:top-[calc(var(--alto-barra,3.5rem)+1rem)]">
        Elige una compra para ver su resumen.
      </aside>
    );
  }
  const i = orden.indexOf(compra.id);
  const paso = RECORRIDO.indexOf(compra.etapa);
  const dia = hoy();
  const hitos: { nombre: string; fecha: string | null }[] = [
    { nombre: "Creada", fecha: compra.creadoEn },
    { nombre: "Primer pago", fecha: compra.fechaPago1 },
    { nombre: "Segundo pago", fecha: compra.fechaPago2 },
    { nombre: "Envío", fecha: compra.fechaEnvio },
    { nombre: "Llegada", fecha: compra.fechaLlegada },
    { nombre: compra.etapa === "descartado" ? "Descartada" : "Cerrada", fecha: compra.cerradoEn },
  ];
  const conFecha = hitos.filter((h) => h.fecha);
  const prioridad = prioridadDe(compra.prioridad);

  return (
    <aside aria-label={`Resumen de ${compra.nombre}`} className="min-w-0 rounded-[10px] border border-border bg-card min-[1100px]:sticky min-[1100px]:top-[calc(var(--alto-barra,3.5rem)+1rem)]">
      <CabeceraTarjeta titulo="Compra">
        <span className="flex gap-1">
          <BotonBarra aria-label="Compra anterior" disabled={i <= 0} onClick={() => alIr(orden[i - 1])} className="h-7 w-7 justify-center px-0 disabled:opacity-40">
            ↑
          </BotonBarra>
          <BotonBarra aria-label="Compra siguiente" disabled={i < 0 || i >= orden.length - 1} onClick={() => alIr(orden[i + 1])} className="h-7 w-7 justify-center px-0 disabled:opacity-40">
            ↓
          </BotonBarra>
          <BotonBarra aria-label="Minimizar la ficha" title="Minimizar la ficha" onClick={alMinimizar} className="h-7 w-7 justify-center px-0">
            →
          </BotonBarra>
          {alCerrar && (
            <BotonBarra aria-label="Cerrar el resumen" title="Cerrar el resumen" onClick={alCerrar} className="h-7 w-7 justify-center px-0">
              ×
            </BotonBarra>
          )}
        </span>
      </CabeceraTarjeta>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          {compra.fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compra.fotoUrl} alt="" className="h-14 w-14 shrink-0 rounded-md border border-border object-cover" />
          )}
          <div className="min-w-0">
            <p className="m-0 text-[15px] font-semibold leading-snug">
              <span className="mr-1.5 tabular-nums">{numeroOC(compra.numero)}</span>
              {compra.productos === 0 && compra.nombre}
            </p>
            {compra.lineas.length > 0 && <p className="m-0 text-xs text-foreground-soft">{resumenLineas(compra.lineas, 10)}</p>}
            <p className="m-0 text-xs text-muted-foreground">
              {[compra.codigo, compra.paisCodigo ?? "Importadora", compra.asignadoNombre].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Badge color={colorEtapa(compra.etapa)}>{etiquetaEtapa(compra.etapa)}</Badge>
              <Pastilla>{etiquetaEstado(compra.estado)}</Pastilla>
              {prioridad && <Badge color={prioridad.color}>{prioridad.etiqueta}</Badge>}
            </div>
          </div>
        </div>

        {paso >= 0 && (
          <div>
            <div className="flex gap-0.5" aria-label={`Etapa ${paso + 1} de ${RECORRIDO.length}`} role="img">
              {RECORRIDO.map((e, n) => (
                <span key={e} className={`h-1.5 flex-1 rounded-sm ${n < paso ? "bg-success" : n === paso ? "bg-primario" : "bg-muted"}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Etapa {paso + 1} de {RECORRIDO.length}
              {estaAbierta(compra) ? ` · lleva ${diasEntre(compra.creadoEn, dia) ?? 0} días` : ""}
            </p>
          </div>
        )}

        {conFecha.length > 0 && (
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {conFecha.map((h, n) => {
              const previo = conFecha[n - 1];
              const tramo = previo ? diasEntre(previo.fecha, h.fecha) : null;
              return (
                <li key={h.nombre} className="flex justify-between gap-2">
                  <span>{h.nombre}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatearFecha(h.fecha!)}
                    {tramo !== null && <span className="ml-1.5 text-foreground">+{tramo} d</span>}
                  </span>
                </li>
              );
            })}
            {compra.fechaEnvio && !compra.fechaLlegada && estaAbierta(compra) && (
              <li className="flex justify-between gap-2 text-warning">
                <span>En tránsito</span>
                <span className="tabular-nums">{diasEntre(compra.fechaEnvio, dia)} días</span>
              </li>
            )}
          </ol>
        )}

        <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2">
          <Dato etiqueta="🧾 QTY">{compra.qtyTotal ?? "—"}</Dato>
          <Dato etiqueta="💲 Pagado a proveedor">{compra.pagadoAProveedor !== null ? usd(compra.pagadoAProveedor) : "—"}</Dato>
          <Dato etiqueta="💲 Valor unitario">{valorUnitario(compra) !== null ? usd(valorUnitario(compra)!) : "—"}</Dato>
          <Dato etiqueta="❗ Pago pendiente">{compra.pagoPendiente ? usd(compra.pagoPendiente) : "—"}</Dato>
          <Dato etiqueta="🏭 Proveedor">{compra.proveedor ?? "—"}</Dato>
          <Dato etiqueta="🏗️ Vía">{compra.viaEnvio.length ? compra.viaEnvio.map(etiquetaVia).join(", ") : "—"}</Dato>
          <Dato etiqueta="🏪 Tienda">{compra.tienda ?? "—"}</Dato>
          <Dato etiqueta="🎫 Track ID">{compra.trackId ?? "—"}</Dato>
        </dl>
        {compra.inconveniente && <p className="m-0 rounded-md border border-border px-3 py-2 text-[13px]">🚨 {compra.inconveniente}</p>}

        <BotonBarra principal onClick={alAbrir} className="w-full justify-center">
          Abrir ficha completa
        </BotonBarra>
      </div>
    </aside>
  );
}
