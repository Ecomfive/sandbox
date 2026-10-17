"use client";

import { useId, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon, CheckIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, PapeleraIcon, PersonaIcon, PuestosIcon, UniversidadIcon } from "@/lib/nav-icons";
import type { EnlacePuesto, FilaPuesto, Persona } from "@/lib/puestos/datos";
import { textoAvance } from "@/lib/puestos/onboarding";
import { AREAS_PUESTO, ETAPAS, ETIQUETA_ETAPA, LARGO, MAX_KRA, type Etapa } from "@/lib/puestos/puesto";
import {
  actualizarPuesto,
  asignarPersona,
  cambiarEstadoPuesto,
  cambiarEtapa,
  enlazar,
  marcarPrincipal,
  obtenerHistorialPuesto,
  quitarEnlace,
  quitarPersona,
} from "./actions";

export interface OpcionesFicha {
  /** Todos los puestos (para «Reporta a»). */
  puestos: { id: string; nombre: string; activo: boolean }[];
  personas: Persona[];
  manuales: { id: string; titulo: string }[];
  cursos: { id: string; titulo: string }[];
}

interface Formulario {
  nombre: string;
  area: string;
  reporta_a: string;
  plazas: string;
  mision: string;
  responsabilidades: string;
  autoridad: string;
  kra: string;
}

const desde = (p: FilaPuesto): Formulario => ({
  nombre: p.nombre,
  area: p.area,
  reporta_a: p.reportaA ?? "",
  plazas: String(p.plazas),
  mision: p.mision,
  responsabilidades: p.responsabilidades,
  autoridad: p.autoridad,
  kra: p.kra.join("\n"),
});

const etiquetaEtapa = (e: Etapa | null) => (e === null ? "De consulta" : ETIQUETA_ETAPA[e]);

/**
 * Ficha de un puesto: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario** (como la de una
 * bodega): misión, responsabilidades, áreas de resultado y autoridad se guardan con «Guardar cambios»; las personas y los
 * procedimientos y cursos se guardan al momento. Sin permiso de escritura solo se lee. La actividad va al final.
 */
export function FichaPuesto(props: {
  puesto: FilaPuesto | undefined;
  opciones: OpcionesFicha;
  codigoPais: string;
  puedeEscribir: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const { puesto } = props;
  if (!puesto) return null;
  // Con otra `key` el formulario arranca con los datos del puesto (al abrir otro o tras guardar).
  return <ContenidoFicha key={`${puesto.id}-${JSON.stringify(desde(puesto))}-${puesto.activo}`} {...props} puesto={puesto} />;
}

function ContenidoFicha({
  puesto,
  opciones,
  codigoPais,
  puedeEscribir,
  anterior,
  siguiente,
  alCerrar,
}: {
  puesto: FilaPuesto;
  opciones: OpcionesFicha;
  codigoPais: string;
  puedeEscribir: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const formId = useId();
  const [d, setD] = useState<Formulario>(desde(puesto));
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(puesto));
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));
  const libres = Math.max(0, puesto.plazas - puesto.ocupantes.length);

  const confirmarSalida = () => !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  function cerrar() {
    if (pendiente || !confirmarSalida()) return;
    alCerrar();
  }

  /** Corre una acción que guarda al momento: avisa si falla y, si sale bien, refresca la actividad. */
  function correr(accion: () => Promise<{ error?: string }>, exito: string) {
    setError(null);
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(exito);
        setVersion((v) => v + 1);
      }
    });
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("id", puesto.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, v);
    correr(() => actualizarPuesto(formData), "Cambios guardados");
  }

  const navegar = (ir?: () => void) =>
    ir
      ? () => {
          if (confirmarSalida()) ir();
        }
      : undefined;

  return (
    <Ventana
      abierto
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      navegacion={
        <>
          <BotonNavegar texto="Puesto anterior" icono={FlechaArribaIcon} alHacerClic={navegar(anterior)} bloqueado={pendiente} />
          <BotonNavegar texto="Puesto siguiente" icono={FlechaAbajoIcon} alHacerClic={navegar(siguiente)} bloqueado={pendiente} />
        </>
      }
      titulo={
        <>
          <span className="text-lg font-semibold">{puesto.nombre}</span>
          <Badge tone="neutral">{puesto.area}</Badge>
          <Badge tone={puesto.activo ? "success" : "warning"}>{puesto.activo ? "Activo" : "Inactivo"}</Badge>
        </>
      }
    >
      <div aria-busy={pendiente} className="flex flex-1 flex-col">
        <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {puedeEscribir && sinGuardar && (
              <>
                <button type="submit" form={formId} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                  <CheckIcon className="h-4 w-4" />
                  {pendiente ? "Guardando..." : "Guardar cambios"}
                </button>
                <button type="button" onClick={() => setD(desde(puesto))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <CerrarIcon className="h-4 w-4" />
                  Cancelar
                </button>
              </>
            )}
            {puedeEscribir && (
              <BotonAccion
                icono={EstadoIcon}
                tono={puesto.activo ? "alerta" : "exito"}
                disabled={pendiente}
                onClick={() => correr(() => cambiarEstadoPuesto(puesto.id, !puesto.activo), puesto.activo ? "Puesto desactivado" : "Puesto activado")}
              >
                {puesto.activo ? "Desactivar" : "Activar"}
              </BotonAccion>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <form id={formId} onSubmit={guardar}>
          <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
            <Seccion icono={PuestosIcon} titulo="Puesto">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>
                  Nombre<span aria-hidden="true" className="text-destructive"> *</span>
                </span>
                <input type="text" value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} required maxLength={LARGO.nombre} className={`${fieldClass} w-full`} />
              </label>
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Área</span>
                  <select value={d.area} onChange={(e) => cambiar({ area: e.target.value })} className={`${fieldClass} w-full`}>
                    {AREAS_PUESTO.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Reporta a</span>
                  <select value={d.reporta_a} onChange={(e) => cambiar({ reporta_a: e.target.value })} className={`${fieldClass} w-full`}>
                    <option value="">Nadie (cabeza del organigrama)</option>
                    {opciones.puestos
                      .filter((p) => p.id !== puesto.id && (p.activo || p.id === d.reporta_a))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Plazas</span>
                  <input type="number" min={1} max={99} value={d.plazas} onChange={(e) => cambiar({ plazas: e.target.value })} className={`${fieldClass} w-full`} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Misión</span>
                <textarea value={d.mision} onChange={(e) => cambiar({ mision: e.target.value })} rows={2} maxLength={LARGO.mision} placeholder="Ej: Gestionar campañas de Meta Ads y optimizar la adquisición de clientes." className={`${fieldClass} w-full resize-y`} />
              </label>
            </Seccion>

            <Seccion icono={CheckIcon} titulo="Responsabilidades y autoridad">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Responsabilidades</span>
                <textarea
                  value={d.responsabilidades}
                  onChange={(e) => cambiar({ responsabilidades: e.target.value })}
                  rows={5}
                  maxLength={LARGO.texto}
                  placeholder={"Ej:\n- Crear, probar y escalar campañas\n- Revisar las campañas cada día"}
                  className={`${fieldClass} w-full resize-y`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Áreas de resultado (KRA, hasta {MAX_KRA})</span>
                <textarea value={d.kra} onChange={(e) => cambiar({ kra: e.target.value })} rows={3} placeholder={"Ej:\nRentabilidad de campañas\nGeneración de pedidos"} className={`${fieldClass} w-full resize-y`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Autoridad</span>
                <textarea
                  value={d.autoridad}
                  onChange={(e) => cambiar({ autoridad: e.target.value })}
                  rows={3}
                  maxLength={LARGO.texto}
                  placeholder={"Ej:\n- Aprueba presupuestos de hasta US$500 al día\n- Propone descuentos; los aprueba Dirección"}
                  className={`${fieldClass} w-full resize-y`}
                />
              </label>
            </Seccion>
          </fieldset>
        </form>

        <div className="flex flex-col divide-y divide-border border-t border-border p-5">
          <SeccionPersonas puesto={puesto} personas={opciones.personas} libres={libres} puedeEscribir={puedeEscribir} pendiente={pendiente} correr={correr} />
          <SeccionEnlaces puesto={puesto} opciones={opciones} puedeEscribir={puedeEscribir} pendiente={pendiente} correr={correr} />
        </div>

        <HistorialGenerico id={puesto.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialPuesto} />
      </div>
    </Ventana>
  );
}

function BotonNavegar({ texto, icono: Icono, alHacerClic, bloqueado }: { texto: string; icono: typeof FlechaArribaIcon; alHacerClic?: () => void; bloqueado: boolean }) {
  const activo = !!alHacerClic && !bloqueado;
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic?.()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

type Correr = (accion: () => Promise<{ error?: string }>, exito: string) => void;

const claseBotonSecundario = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";
const claseBotonIcono = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

function SeccionPersonas({ puesto, personas, libres, puedeEscribir, pendiente, correr }: { puesto: FilaPuesto; personas: Persona[]; libres: number; puedeEscribir: boolean; pendiente: boolean; correr: Correr }) {
  const [elegida, setElegida] = useState("");
  const disponibles = personas.filter((p) => !puesto.ocupantes.some((o) => o.id === p.id));
  return (
    <Seccion icono={PersonaIcon} titulo={`Personas · ${puesto.ocupantes.length} de ${puesto.plazas}`}>
      {libres > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
          {libres === 1 ? "1 plaza vacante" : `${libres} plazas vacantes`}
        </p>
      )}
      {puesto.ocupantes.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
          {puesto.ocupantes.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <AvatarPersona nombre={o.nombre} email={o.email} avatarUrl={o.avatarUrl} tamano="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{o.nombre}</span>
                <span className="text-xs text-muted-foreground">Onboarding: {textoAvance(o.avance)}</span>
              </div>
              {o.principal ? (
                <Badge tone="info">Puesto principal</Badge>
              ) : (
                puedeEscribir && (
                  <button type="button" disabled={pendiente} onClick={() => correr(() => marcarPrincipal(puesto.id, o.id), "Puesto principal cambiado")} className={claseBotonSecundario}>
                    Hacer principal
                  </button>
                )
              )}
              {puedeEscribir && (
                <Tooltip texto="Quitar del puesto">
                  <button
                    type="button"
                    aria-label={`Quitar a ${o.nombre} del puesto`}
                    disabled={pendiente}
                    onClick={() => confirm(`¿Quitar a ${o.nombre} de ${puesto.nombre}?`) && correr(() => quitarPersona(puesto.id, o.id), "Persona quitada")}
                    className={claseBotonIcono}
                  >
                    <CerrarIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && puesto.activo && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className={labelClassSm}>Asignar persona</span>
            <select value={elegida} onChange={(e) => setElegida(e.target.value)} className={`${fieldClassSm} w-full`}>
              <option value="">Elige una persona</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pendiente || !elegida}
            onClick={() => {
              const id = elegida;
              setElegida("");
              correr(() => asignarPersona(puesto.id, id), "Persona asignada");
            }}
            className={claseBotonSecundario}
          >
            Asignar
          </button>
        </div>
      )}
    </Seccion>
  );
}

function SeccionEnlaces({ puesto, opciones, puedeEscribir, pendiente, correr }: { puesto: FilaPuesto; opciones: OpcionesFicha; puedeEscribir: boolean; pendiente: boolean; correr: Correr }) {
  const [elegido, setElegido] = useState("");
  const [etapa, setEtapa] = useState("30");
  const ya = new Set(puesto.enlaces.map((e) => `${e.tipo}:${e.id}`));
  const grupos: { etapa: Etapa | null; enlaces: EnlacePuesto[] }[] = [...ETAPAS, null]
    .map((e) => ({ etapa: e, enlaces: puesto.enlaces.filter((x) => x.etapa === e) }))
    .filter((g) => g.enlaces.length > 0);

  function anadir() {
    const [tipo, id] = elegido.split(":") as ["manual" | "curso", string];
    setElegido("");
    correr(() => enlazar(puesto.id, tipo, id, etapa ? Number(etapa) : null), tipo === "manual" ? "Procedimiento enlazado" : "Curso enlazado");
  }

  return (
    <Seccion icono={UniversidadIcon} titulo="Procedimientos (SOP) y onboarding">
      {grupos.length === 0 && <p className="text-sm text-muted-foreground">Sin procedimientos ni cursos.</p>}
      {grupos.map((g) => (
        <div key={g.etapa ?? "consulta"} className="flex flex-col gap-1.5">
          <h4 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{etiquetaEtapa(g.etapa)}</h4>
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
            {g.enlaces.map((e) => (
              <li key={`${e.tipo}:${e.id}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <Badge tone={e.tipo === "manual" ? "neutral" : "azul"}>{e.tipo === "manual" ? "Manual" : "Curso"}</Badge>
                <a href={e.tipo === "manual" ? `/ayuda/manuales/${e.id}` : `/ayuda/universidad/${e.id}`} className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline">
                  {e.titulo}
                </a>
                {puedeEscribir && (
                  <>
                    <select
                      aria-label={`Etapa de ${e.titulo}`}
                      value={e.etapa ?? ""}
                      disabled={pendiente}
                      onChange={(ev) => correr(() => cambiarEtapa(puesto.id, e.tipo, e.id, ev.target.value ? Number(ev.target.value) : null), "Etapa cambiada")}
                      className={`${fieldClassSm} w-32`}
                    >
                      {ETAPAS.map((x) => (
                        <option key={x} value={x}>
                          {ETIQUETA_ETAPA[x]}
                        </option>
                      ))}
                      <option value="">De consulta</option>
                    </select>
                    <Tooltip texto="Quitar del puesto">
                      <button type="button" aria-label={`Quitar ${e.titulo} del puesto`} disabled={pendiente} onClick={() => correr(() => quitarEnlace(puesto.id, e.tipo, e.id), "Quitado del puesto")} className={claseBotonIcono}>
                        <PapeleraIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {puedeEscribir && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className={labelClassSm}>Añadir manual o curso</span>
            <select value={elegido} onChange={(e) => setElegido(e.target.value)} className={`${fieldClassSm} w-full`}>
              <option value="">Elige un manual o un curso</option>
              <optgroup label="Manuales de proceso">
                {opciones.manuales
                  .filter((m) => !ya.has(`manual:${m.id}`))
                  .map((m) => (
                    <option key={m.id} value={`manual:${m.id}`}>
                      {m.titulo}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Cursos de la Universidad">
                {opciones.cursos
                  .filter((c) => !ya.has(`curso:${c.id}`))
                  .map((c) => (
                    <option key={c.id} value={`curso:${c.id}`}>
                      {c.titulo}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Etapa</span>
            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={`${fieldClassSm} w-32`}>
              {ETAPAS.map((x) => (
                <option key={x} value={x}>
                  {ETIQUETA_ETAPA[x]}
                </option>
              ))}
              <option value="">De consulta</option>
            </select>
          </label>
          <button type="button" disabled={pendiente || !elegido} onClick={anadir} className={claseBotonSecundario}>
            Añadir
          </button>
        </div>
      )}
    </Seccion>
  );
}
