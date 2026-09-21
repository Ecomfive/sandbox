"use client";

import { Fragment, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha, formatearFechaHoraCompleta, formatearMoneda } from "@/lib/formato";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { CheckIcon, CerrarIcon } from "@/lib/nav-icons";
import { obtenerActividadRetiro, type EventoRetiro } from "./actividad";
import { ESTADO_ETIQUETA } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";
import type { Cuenta, Plataforma } from "./crear-retiro-panel";
import { ConciliarRetiroPanel } from "./conciliar-retiro-panel";
import { EditarRetiroPanel } from "./editar-retiro-panel";
import { CancelarRetiroBoton } from "./cancelar-retiro-boton";
import { EliminarRetiroBoton } from "./eliminar-retiro-boton";

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

type EstadoPaso = "completo" | "actual" | "pendiente" | "error";

/** A qué paso llegó el retiro en su recorrido real (no el `estado` interno de seguimiento):
 * se crea acá, Dropi lo aprueba (o lo rechaza), y por último se recibe el dinero (o hay una
 * diferencia). Un retiro cancelado se queda en "Creado" — no tiene sentido seguir avanzando. */
function pasosDelRetiro(fila: FilaRetiro): { aprobado: EstadoPaso; recibido: EstadoPaso } {
  if (fila.estado === "cancelado") return { aprobado: "pendiente", recibido: "pendiente" };

  const aprobado: EstadoPaso =
    fila.estadoDropi === "aprobado" ? "completo" : fila.estadoDropi === "rechazado" ? "error" : "actual";

  const recibido: EstadoPaso =
    fila.estado === "cerrado" ? "completo" : fila.estado === "novedad" ? "error" : aprobado === "completo" ? "actual" : "pendiente";

  return { aprobado, recibido };
}

function claseNodo(estado: EstadoPaso): string {
  switch (estado) {
    case "completo":
      return "border-success bg-success text-white";
    case "error":
      return "border-destructive bg-destructive text-white";
    case "actual":
      return "border-foreground bg-card text-foreground";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

/** Los tres pasos del recorrido de un retiro: Creado (siempre, ya existe), Aprobado (por
 * Dropi) y Recibido (el dinero, conciliado). No es el `estado` de seguimiento interno
 * (abierto/novedad/cerrado/cancelado) — ese ya se ve en la insignia del título. */
function BarraPasos({ fila, codigoPais }: { fila: FilaRetiro; codigoPais: string }) {
  const { aprobado, recibido } = pasosDelRetiro(fila);
  const pasos: { etiqueta: string; estado: EstadoPaso; subtexto: string }[] = [
    { etiqueta: "Creado", estado: "completo", subtexto: formatearFecha(fila.fecha) },
    {
      etiqueta: "Aprobado",
      estado: aprobado,
      subtexto:
        fila.estadoDropi && fila.estadoDropi in ETIQUETA_ESTADO_DROPI
          ? ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]
          : "En espera de Dropi",
    },
    {
      etiqueta: "Recibido",
      estado: recibido,
      subtexto:
        fila.montoRecibido !== null
          ? formatearMoneda(fila.montoRecibido, codigoPais)
          : recibido === "error"
            ? "Diferencia de monto"
            : "Sin registrar",
    },
  ];

  return (
    <div className="flex items-start">
      {pasos.map((paso, i) => (
        <Fragment key={paso.etiqueta}>
          {i > 0 && (
            <div
              aria-hidden="true"
              className={`mt-3.5 h-0.5 flex-1 ${pasos[i - 1].estado === "completo" ? "bg-success" : "bg-border"}`}
            />
          )}
          <div className="flex w-20 shrink-0 flex-col items-center gap-1 text-center">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${claseNodo(paso.estado)}`}
            >
              {paso.estado === "completo" && <CheckIcon className="h-3.5 w-3.5" />}
              {paso.estado === "error" && <CerrarIcon className="h-3.5 w-3.5" />}
            </span>
            <span className="text-xs font-medium">{paso.etiqueta}</span>
            <span className="text-[11px] text-muted-foreground">{paso.subtexto}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

const PESTANAS = [
  { id: "detalle", etiqueta: "Detalle" },
  { id: "historial", etiqueta: "Historial" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

/**
 * Ficha de un retiro: un panel a la derecha con lo esencial, sus acciones y su actividad, sin salir de la tabla —
 * reemplaza a la página completa que había antes en `/retiros/[id]`. Lo que muestra sale de la fila ya cargada;
 * solo la actividad se pide al abrirla.
 */
export function VistaRapidaRetiro({
  fila,
  codigoPais,
  paisId,
  plataformas,
  cuentas,
  alCerrar,
}: {
  /** El retiro que se ve; null = cerrada. */
  fila: FilaRetiro | null;
  codigoPais: string;
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
  alCerrar: () => void;
}) {
  // Cuál retiro tiene ya su actividad cargada: mientras no coincida con el que se ve, está cargando.
  const [cargada, setCargada] = useState<{ id: string; eventos: EventoRetiro[] | null } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("detalle");
  const id = fila?.id ?? null;

  useEffect(() => {
    setPestana("detalle");
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
      ancho="lg"
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
        <div className="flex flex-col gap-4 p-4">
          <BarraPasos fila={fila} codigoPais={codigoPais} />

          <div className="flex flex-wrap gap-2 border-y border-border py-3">
            <ConciliarRetiroPanel
              retiro={{
                id: fila.id,
                numeroCorrelativo: fila.numeroCorrelativo,
                plataformaNombre: fila.plataformaNombre,
                destino: fila.destino,
                gestionadoPor: fila.gestionadoPor,
                monto: fila.monto,
                fecha: fila.fecha,
                fechaLimite: fila.fechaLimite,
                comision: fila.comision,
                aRecibir: fila.aRecibir,
                notas: fila.notas,
                soporteNumero: fila.soporteNumero,
                montoRecibido: fila.montoRecibido,
              }}
              paisId={paisId}
              variante="boton"
            />
            <EditarRetiroPanel
              retiro={{
                id: fila.id,
                numeroCorrelativo: fila.numeroCorrelativo,
                plataformaId: fila.plataformaId,
                cuentaRetiroId: fila.cuentaRetiroId,
                destino: fila.destino,
                gestionadoPor: fila.gestionadoPor,
                monto: fila.monto,
                comision: fila.comision,
                fecha: fila.fecha,
                fechaLimite: fila.fechaLimite,
                notas: fila.notas,
                estado: fila.estado,
              }}
              plataformas={plataformas}
              cuentas={cuentas}
              variante="boton"
            />
            {fila.estado !== "cancelado" && (
              <CancelarRetiroBoton id={fila.id} correlativo={fila.numeroCorrelativo} />
            )}
            <EliminarRetiroBoton id={fila.id} correlativo={fila.numeroCorrelativo} variante="boton" />
          </div>

          <div className="flex gap-1 border-b border-border" role="tablist">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={pestana === p.id}
                onClick={() => setPestana(p.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  pestana === p.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>

          {pestana === "detalle" ? (
            <div className="flex flex-col gap-5">
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
            </div>
          ) : (
            <section aria-labelledby="actividad-retiro" aria-busy={cargando}>
              <h3 id="actividad-retiro" className="sr-only">
                Actividad
              </h3>
              {cargando ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : eventos === null ? (
                <p className="text-sm text-destructive">No se pudo cargar la actividad. Vuelve a intentarlo.</p>
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
          )}
        </div>
      )}
    </Ventana>
  );
}
