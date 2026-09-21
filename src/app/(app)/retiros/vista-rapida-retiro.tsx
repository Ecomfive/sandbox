"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Ventana } from "@/components/ui/ventana";
import { linkClass } from "@/components/ui/link";
import { formatearFecha, formatearFechaHoraCompleta, formatearMoneda } from "@/lib/formato";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { obtenerActividadRetiro, type EventoRetiro } from "./actividad";
import { ESTADO_ETIQUETA } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

const ESTADO_TONO = { abierto: "info", cancelado: "neutral", novedad: "destructive", cerrado: "success" } as const;
const GESTIONADO_ETIQUETA: Record<string, string> = { plataforma: "Plataforma", correo: "Correo" };

/** Ícono del botón «Vista rápida» de cada fila: un panel con un lado resaltado. */
export function VistaRapidaIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
      <path d="M17 9h.01M17 12h.01M17 15h.01" />
    </svg>
  );
}

const numeroDe = (fila: FilaRetiro) => `#${String(fila.numeroCorrelativo).padStart(4, "0")}`;

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Vista rápida de un retiro (estilo ClickUp): un panel a la derecha con lo esencial y su actividad, sin salir de la
 * tabla. Lo que muestra sale de la fila ya cargada; solo la actividad se pide al abrirla. La ficha completa sigue
 * a un clic («Abrir ficha completa»).
 */
export function VistaRapidaRetiro({
  fila,
  codigoPais,
  alCerrar,
}: {
  /** El retiro que se ve; null = cerrada. */
  fila: FilaRetiro | null;
  codigoPais: string;
  alCerrar: () => void;
}) {
  // Cuál retiro tiene ya su actividad cargada: mientras no coincida con el que se ve, está cargando.
  const [cargada, setCargada] = useState<{ id: string; eventos: EventoRetiro[] | null } | null>(null);
  const id = fila?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    obtenerActividadRetiro(id)
      .then((r) => vigente && setCargada({ id, eventos: "eventos" in r ? r.eventos : null }))
      .catch(() => vigente && setCargada({ id, eventos: null }));
    return () => {
      vigente = false;
    };
  }, [id]);

  const cargando = !!id && cargada?.id !== id;
  const eventos = cargada?.id === id ? cargada.eventos : null;
  const moneda = (valor: number) => formatearMoneda(valor, codigoPais);
  const diferencia = fila && fila.montoRecibido !== null ? fila.montoRecibido - fila.aRecibir : null;

  return (
    <Ventana
      abierto={fila !== null}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="md"
      titulo={
        fila && (
          <>
            Retiro {numeroDe(fila)}
            <Badge tone={ESTADO_TONO[fila.estado as keyof typeof ESTADO_TONO] ?? "neutral"}>
              {ESTADO_ETIQUETA[fila.estado] ?? fila.estado}
            </Badge>
          </>
        )
      }
    >
      {fila && (
        <div className="flex flex-col gap-5 p-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato etiqueta="Plataforma">{fila.plataformaNombre ?? "—"}</Dato>
            <Dato etiqueta="Destino">{fila.destino}</Dato>
            <Dato etiqueta="Monto">
              <span className="font-semibold tabular-nums">{moneda(fila.monto)}</span>
            </Dato>
            <Dato etiqueta="Comisión">
              <span className="tabular-nums">{moneda(fila.comision)}</span>
            </Dato>
            <Dato etiqueta="A recibir">
              <span className="tabular-nums">{moneda(fila.aRecibir)}</span>
            </Dato>
            <Dato etiqueta="Recibido">
              {fila.montoRecibido === null ? (
                <span className="text-muted-foreground">Sin registrar</span>
              ) : (
                <span className="tabular-nums">
                  {moneda(fila.montoRecibido)}
                  {diferencia !== null && Math.abs(diferencia) > 0.005 && (
                    <span className={diferencia < 0 ? "ml-1 text-destructive" : "ml-1 text-success"}>
                      ({diferencia > 0 ? "+" : ""}
                      {moneda(diferencia)})
                    </span>
                  )}
                </span>
              )}
            </Dato>
            <Dato etiqueta="Creación">{formatearFecha(fila.fecha)}</Dato>
            <Dato etiqueta="Fecha límite">{fila.fechaLimite ? formatearFecha(fila.fechaLimite) : "—"}</Dato>
            <Dato etiqueta="Cierre">{fila.fechaCierre ? formatearFecha(fila.fechaCierre) : "—"}</Dato>
            <Dato etiqueta="Gestionado por">{GESTIONADO_ETIQUETA[fila.gestionadoPor] ?? fila.gestionadoPor ?? "—"}</Dato>
            <Dato etiqueta="Persona asignada">{fila.asignadoNombre ?? "—"}</Dato>
            <Dato etiqueta="Consolidación">
              <Badge tone={fila.consolidado ? "success" : "warning"}>{fila.consolidado ? "Consolidado" : "Pendiente"}</Badge>
            </Dato>
            <Dato etiqueta="Estado en Dropi">
              {fila.estadoDropi && fila.estadoDropi in TONO_ESTADO_DROPI ? (
                <Badge tone={TONO_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}>
                  {ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}
                </Badge>
              ) : (
                "—"
              )}
            </Dato>
            <Dato etiqueta="Soporte">{fila.soporteNumero ?? "—"}</Dato>
          </dl>

          {fila.notas && (
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">Notas</h3>
              <p className="text-sm whitespace-pre-wrap">{fila.notas}</p>
            </div>
          )}

          <section aria-labelledby="actividad-retiro" aria-busy={cargando}>
            <h3 id="actividad-retiro" className="mb-2 text-sm font-semibold">
              Actividad
            </h3>
            {cargando ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : eventos === null ? (
              <p className="text-sm text-destructive">No se pudo cargar la actividad. Ábrela en la ficha completa.</p>
            ) : eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay actividad registrada.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {eventos.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <div>
                      <p>{e.evento}</p>
                      <p className="text-xs text-muted-foreground">{formatearFechaHoraCompleta(e.creadoEn, codigoPais)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="border-t border-border pt-3 text-sm">
            <Link href={`/retiros/${fila.id}`} className={linkClass}>
              Abrir ficha completa
            </Link>
          </p>
        </div>
      )}
    </Ventana>
  );
}
