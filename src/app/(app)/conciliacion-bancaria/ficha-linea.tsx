"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { CerrarIcon, CheckIcon, ConciliarIcon, ExtractoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, HistorialIcon, MasIcon } from "@/lib/nav-icons";
import type { FilaLinea } from "@/lib/conciliacion/cargar";
import {
  confirmarPropuestas,
  crearEnLibro,
  descartarPropuesta,
  ignorarLineas,
  obtenerHistorialLinea,
  obtenerPropuestasLinea,
  reabrirLineas,
  registrarIngresos,
  type IngresoPropuesto,
  type PropuestaDetalle,
} from "./actions";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

export const TONO_ESTADO: Record<FilaLinea["estadoClave"], Tone> = {
  conciliada: "success",
  sugerida: "info",
  pendiente: "warning",
  ignorada: "neutral",
};

const ETIQUETA_METODO: Record<string, string> = {
  exacto: "Monto exacto",
  suma: "Suma de varias",
  corte: "Corte del día",
  referencia: "Referencia del depósito",
  comision: "Neto de comisión",
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

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={labelClassSm}>{titulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * Ficha de una línea del banco: el panel a la derecha que se abre al pulsar su fila. Arriba lo que se puede hacer con
 * ella; luego sus datos, las propuestas con el detalle de cada parte (confirmar o descartar cada una) y la actividad.
 */
export function FichaLinea({
  linea,
  orden,
  irA,
  puedeEscribir,
  puedeCrear,
  alCerrar,
}: {
  linea: FilaLinea | undefined;
  orden: string[];
  irA: (id: string) => void;
  puedeEscribir: boolean;
  puedeCrear: boolean;
  alCerrar: () => void;
}) {
  if (!linea) return null;
  return <Contenido key={`${linea.id}-${linea.estadoClave}`} l={linea} orden={orden} irA={irA} puedeEscribir={puedeEscribir} puedeCrear={puedeCrear} alCerrar={alCerrar} />;
}

function Contenido({
  l,
  orden,
  irA,
  puedeEscribir,
  puedeCrear,
  alCerrar,
}: {
  l: FilaLinea;
  orden: string[];
  irA: (id: string) => void;
  puedeEscribir: boolean;
  puedeCrear: boolean;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [propuestas, setPropuestas] = useState<PropuestaDetalle[] | null | undefined>(undefined);
  const [ingreso, setIngreso] = useState<IngresoPropuesto | null>(null);
  const [version, setVersion] = useState(0);
  const [ignorando, setIgnorando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerPropuestasLinea(l.id)
      .then((r) => {
        if (!vigente) return;
        setPropuestas("propuestas" in r ? r.propuestas : null);
        setIngreso("propuestas" in r ? r.ingreso : null);
      })
      .catch(() => vigente && setPropuestas(null));
    return () => {
      vigente = false;
    };
  }, [l.id, version]);

  const indice = orden.indexOf(l.id);
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;
  const abierta = l.estadoClave === "pendiente" || l.estadoClave === "sugerida";
  const cerrada = !abierta;

  function hacer(accion: () => Promise<{ error: string } | { ok: true }>, mensaje: string) {
    setError(null);
    iniciar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo completar. Inténtalo de nuevo." }));
      if ("error" in r) {
        setError(r.error);
        return;
      }
      mostrarToast(mensaje);
      setIgnorando(false);
      setVersion((v) => v + 1);
      router.refresh();
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={() => !pendiente && alCerrar()}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-lg font-semibold">Línea del banco</span>
          <Badge tone={TONO_ESTADO[l.estadoClave]}>{l.estado}</Badge>
        </>
      }
      navegacion={
        <>
          <BotonNavegar texto="Línea anterior" icono={FlechaArribaIcon} activo={!!anterior && !pendiente} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Línea siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pendiente} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      <div aria-busy={pendiente} className="flex flex-1 flex-col">
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-b border-border bg-card px-5 py-3">
            {ignorando ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  hacer(() => ignorarLineas([l.id], motivo), "Línea ignorada");
                }}
              >
                <label className="flex min-w-60 flex-1 flex-col gap-1">
                  <span className={labelClassSm}>Motivo</span>
                  <input
                    data-enfocar
                    required
                    maxLength={200}
                    placeholder="Ej: traspaso entre cuentas propias"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    className={`${fieldClass} w-full`}
                    disabled={pendiente}
                  />
                </label>
                <button type="submit" disabled={pendiente || !motivo.trim()} className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                  {pendiente ? "Guardando…" : "Ignorar"}
                </button>
                <button type="button" onClick={() => setIgnorando(false)} disabled={pendiente} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {abierta && puedeCrear && (
                  <BotonAccion icono={MasIcon} disabled={pendiente} onClick={() => hacer(() => crearEnLibro([l.id]), "Creado en el libro y conciliado")}>
                    Crear en el libro
                  </BotonAccion>
                )}
                {abierta && (
                  <BotonAccion icono={CerrarIcon} disabled={pendiente} onClick={() => setIgnorando(true)}>
                    Ignorar
                  </BotonAccion>
                )}
                {puedeCrear && ingreso && l.ingreso === "disponible" && (
                  <BotonAccion icono={GastoIcon} disabled={pendiente} onClick={() => hacer(() => registrarIngresos([l.id]), "Ingreso registrado en su cuenta")}>
                    Registrar ingreso
                  </BotonAccion>
                )}
                {cerrada && (
                  <BotonAccion icono={HistorialIcon} disabled={pendiente} onClick={() => hacer(() => reabrirLineas([l.id]), "La línea vuelve a pendiente")}>
                    Volver a pendiente
                  </BotonAccion>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="flex min-w-0 flex-col divide-y divide-border p-5">
          <Seccion icono={ExtractoIcon} titulo="Línea">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Dato titulo="Fecha">{fechaCorta(l.fecha)}</Dato>
              <Dato titulo="Monto">
                <span className={`tabular-nums font-semibold ${l.monto < 0 ? "" : "text-success"}`}>{usd(l.monto)}</span>
              </Dato>
              <Dato titulo="Qué es">{l.clase}</Dato>
              <div className="col-span-2 sm:col-span-3">
                <Dato titulo="Descripción">{l.descripcion || "—"}</Dato>
              </div>
              <Dato titulo="Referencia">{l.referencia || "—"}</Dato>
              <Dato titulo="En el Excel">{l.excel}</Dato>
              {l.motivo && <Dato titulo="Motivo">{l.motivo}</Dato>}
            </dl>
          </Seccion>

          <Seccion icono={ConciliarIcon} titulo="Propuestas">
            {propuestas === undefined ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : propuestas === null ? (
              <p role="alert" className="text-sm text-destructive">
                No se pudieron cargar las propuestas.
              </p>
            ) : propuestas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin coincidencias.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {propuestas.map((p) => (
                  <li key={p.grupo} className="rounded-lg border border-border bg-card">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-2 text-sm">
                      {p.estado === "confirmado" && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />}
                      <span className="font-medium">{p.detalle}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.fuente} · {ETIQUETA_METODO[p.metodo] ?? p.metodo} · puntaje {p.puntaje}
                        {p.estado === "confirmado" ? (p.auto ? " · conciliada sola" : " · confirmada") : ""}
                      </span>
                      {puedeEscribir && p.estado === "sugerido" && abierta && (
                        <span className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => hacer(() => confirmarPropuestas([{ lineaId: l.id, grupo: p.grupo }]), "Línea conciliada")}
                            className={`inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            Confirmar
                          </button>
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => hacer(() => descartarPropuesta(l.id, p.grupo), "Propuesta descartada")}
                            className={`rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
                          >
                            Descartar
                          </button>
                        </span>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <caption className="sr-only">Partes de la propuesta «{p.detalle}»</caption>
                      <tbody>
                        {p.partes.slice(0, 60).map((x, i) => (
                          <tr key={i} className="border-b border-border/60 last:border-0">
                            <td className="w-20 px-3 py-1.5 whitespace-nowrap text-muted-foreground">{x.fecha ? fechaCorta(x.fecha) : "—"}</td>
                            <td className="px-3 py-1.5">{x.texto}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
                              {usd(x.monto)}
                              {x.comision > 0 && <span className="block text-xs text-muted-foreground">comisión {usd(x.comision)}</span>}
                            </td>
                          </tr>
                        ))}
                        {p.partes.length > 60 && (
                          <tr>
                            <td colSpan={3} className="px-3 py-1.5 text-muted-foreground">
                              y {p.partes.length - 60} más
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>

          {(l.ingreso === "registrado" || (ingreso && l.ingreso === "disponible")) && (
            <Seccion icono={GastoIcon} titulo="Ingreso en la cuenta">
              {l.ingreso === "registrado" ? (
                <p className="flex items-center gap-1.5 text-sm">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                  Registrado
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Dato titulo="Cuenta">{ingreso!.cuenta}</Dato>
                  {ingreso!.tiendas.map((t) => (
                    <Dato key={t.tienda} titulo={t.tienda}>
                      <span className="tabular-nums">{usd(t.monto)}</span>
                    </Dato>
                  ))}
                </dl>
              )}
            </Seccion>
          )}
        </div>

        <HistorialGenerico id={l.id} codigoPais="PA" version={version} obtener={obtenerHistorialLinea} />
      </div>
    </Ventana>
  );
}
