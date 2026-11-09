"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { claseSigno } from "@/components/af4/estilos-af4";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero2, entero } from "@/lib/af4/formato";
import { EnvioIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import type { ClienteMostrado } from "@/lib/ventas/cliente";
import { ETIQUETA_ESTADO, ETIQUETA_METODO } from "@/lib/ventas/resumen";
import { mostrarDatosCliente, obtenerOrden, type LineaFicha, type OrdenFicha } from "../actions";
import { TONO_ESTADO } from "./estado-tono";
import { PasoOrdenFicha } from "./paso-orden";

const FUENTE: Record<LineaFicha["fuente"], string> = {
  costo_vigente: "Costo vigente",
  excel: "Costo de la Matriz",
  servicio: "Servicio",
  sin_costo: "Sin costo",
};

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 text-sm">{children || "—"}</dd>
    </div>
  );
}

/** La ficha de una orden: datos, líneas con su costo y la persona (enmascarada; «Mostrar datos» la deja ver entera). */
export function FichaOrden({ id, orden, irA, alCerrar }: { id: string; orden: string[]; irA: (id: string) => void; alCerrar: () => void }) {
  const [cargada, setCargada] = useState<{ id: string; ficha: OrdenFicha | { error: string } } | null>(null);
  const [cliente, setCliente] = useState<{ id: string; datos: ClienteMostrado } | null>(null);
  const [errorCliente, setErrorCliente] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    obtenerOrden(id).then((r) => vigente && setCargada({ id, ficha: r }));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  const i = orden.indexOf(id);
  const anterior = i > 0 ? orden[i - 1] : null;
  const siguiente = i >= 0 && i < orden.length - 1 ? orden[i + 1] : null;
  const ficha = cargada?.id === id ? cargada.ficha : null;
  const o = ficha && !("error" in ficha) ? ficha : null;
  const datosCliente = cliente?.id === id ? cliente.datos : (o?.cliente ?? null);
  const completos = cliente?.id === id;

  function mostrar() {
    setErrorCliente(null);
    iniciar(async () => {
      const r = await mostrarDatosCliente(id);
      if ("error" in r) setErrorCliente(r.error);
      else setCliente({ id, datos: r.cliente });
    });
  }

  const costoLineas = o ? o.lineas.reduce((a, l) => a + (l.costo ?? 0), 0) : 0;

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-lg font-semibold">{o ? `Orden ${o.numero}` : "Orden"}</span>
          {o && <Badge tone={TONO_ESTADO[o.estado]}>{ETIQUETA_ESTADO[o.estado]}</Badge>}
          {o?.facturado && <Badge tone="info">Facturada</Badge>}
        </>
      }
      navegacion={
        <>
          <BotonNavegar texto="Orden anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Orden siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {!ficha ? (
        <p className="p-5 text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : "error" in ficha ? (
        <p role="alert" className="m-5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {ficha.error}
        </p>
      ) : (
        o && (
          <div className="flex flex-col divide-y divide-border p-5">
            <Seccion icono={EnvioIcon} titulo="Siguiente paso">
              <PasoOrdenFicha id={id} alCambiar={() => setVersion((v) => v + 1)} />
            </Seccion>
            <Seccion icono={GastoIcon} titulo="Orden">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Dato etiqueta="Tienda">{o.tienda}</Dato>
                <Dato etiqueta="Fecha">{fechaCorta(o.fecha)}</Dato>
                <Dato etiqueta="Total">{dinero2(o.total)}</Dato>
                <Dato etiqueta="Estado en Shopify">{o.estadoPago}</Dato>
                <Dato etiqueta="Método de pago">{o.metodo ? ETIQUETA_METODO[o.metodo] : null}</Dato>
                <Dato etiqueta="Forma de pago (Matriz)">{o.formaPago}</Dato>
                {o.informe && <Dato etiqueta="Informe de Servientrega">{o.informe}</Dato>}
                {o.factura && <Dato etiqueta="Factura">{o.factura}</Dato>}
                {o.motivo && <Dato etiqueta="Motivo de cancelación">{o.motivo}</Dato>}
                {o.mesGestion && <Dato etiqueta="Mes de gestión">{o.mesGestion}</Dato>}
              </dl>
              {o.etiquetas && <p className="text-xs text-muted-foreground">{o.etiquetas}</p>}
            </Seccion>

            <Seccion icono={EnvioIcon} titulo="Envío">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Dato etiqueta="Transportista">{o.transportista}</Dato>
                <Dato etiqueta="Guía">{o.guia}</Dato>
                <Dato etiqueta="Fecha de envío">{o.fechaEnvio ? fechaCorta(o.fechaEnvio) : null}</Dato>
                <Dato etiqueta="Costo de envío">{dinero2(o.costoEnvio)}</Dato>
                {o.resultado && <Dato etiqueta="Resultado del courier">{o.resultado}</Dato>}
                {o.fechaDevolucion && <Dato etiqueta="Devolución">{fechaCorta(o.fechaDevolucion)}</Dato>}
              </dl>
            </Seccion>

            <Seccion icono={ProductoIcon} titulo="Productos">
              <table className="w-full text-sm">
                <caption className="sr-only">Productos de la orden con su costo</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-2 font-medium">Producto</th>
                    <th scope="col" className="py-1 pr-2 text-right font-medium">Cant.</th>
                    <th scope="col" className="py-1 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lineas.map((l) => (
                    <tr key={l.linea} className="border-t border-border/60 align-top">
                      <td className="py-1.5 pr-2">
                        {l.producto}
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {l.fuente === "sin_costo" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
                          {FUENTE[l.fuente]}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{entero(l.cantidad)}</td>
                      <td className="py-1.5 text-right tabular-nums">{dinero2(l.costo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-xs text-muted-foreground">
                    <th scope="row" colSpan={2} className="py-1.5 pr-2 text-left font-medium">
                      Margen (total − costo − envío)
                    </th>
                    <td className={`py-1.5 text-right font-semibold tabular-nums ${claseSigno(o.total - costoLineas - o.costoEnvio) || "text-foreground"}`}>{dinero2(o.total - costoLineas - o.costoEnvio)}</td>
                  </tr>
                </tfoot>
              </table>
            </Seccion>

            <Seccion icono={PersonaIcon} titulo="Cliente">
              {datosCliente ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <Dato etiqueta="Nombre">{datosCliente.nombre}</Dato>
                    <Dato etiqueta="Teléfono">{datosCliente.telefono}</Dato>
                    <Dato etiqueta="Corregimiento">{datosCliente.corregimiento}</Dato>
                    <Dato etiqueta="Dirección">{datosCliente.direccion}</Dato>
                    <Dato etiqueta="Notas">{datosCliente.notas}</Dato>
                  </dl>
                  {o.puedeVerCliente && !completos && (
                    <button
                      type="button"
                      onClick={mostrar}
                      disabled={pendiente}
                      className={`self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                    >
                      {pendiente ? "Abriendo…" : "Mostrar datos"}
                    </button>
                  )}
                  {errorCliente && (
                    <p role="alert" className="text-sm text-destructive">
                      {errorCliente}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </Seccion>
          </div>
        )
      )}
    </Ventana>
  );
}
