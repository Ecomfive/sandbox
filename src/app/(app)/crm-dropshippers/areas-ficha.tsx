"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { TextoConMenciones } from "@/components/ui/campo-menciones";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { formatearFecha, formatearTiempoRelativo } from "@/lib/formato";
import { FASES, type AccesoCrm } from "@/lib/crm/areas";
import { CalendarioIcon, EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import {
  completarSeguimiento,
  crearSeguimiento,
  escalarCaso,
  obtenerLideresComerciales,
  obtenerLineaDeTiempo,
  obtenerSeguimientos,
  transferirDropshipper,
  type ItemLinea,
  type LiderComercial,
  type Seguimiento,
} from "./actions";
import type { FilaDropshipper } from "./def-crm";

const hoy = () => new Date().toLocaleDateString("en-CA");

/** Botón de la fila de acciones de la ficha: ícono arriba y texto abajo (igual que los de `paneles-ficha`). */
function BotonAccion({ texto, icono: Icono, alHacerClic }: { texto: string; icono: typeof PersonaIcon; alHacerClic: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={alHacerClic}
      className={`flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium hover:bg-accent-hover ${anilloFoco}`}
    >
      <Icono className="h-4 w-4" />
      {texto}
    </button>
  );
}

/** «Pasar a Comercial» en un caso abierto: Atención lo deja como seguimiento del área comercial. */
export function BotonEscalar({ casoId, escalado }: { casoId: string; escalado: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  if (escalado) return <span className="text-xs text-muted-foreground">Pasado a Comercial</span>;
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        start(async () => {
          const r = await escalarCaso(casoId);
          mostrarToast(r.error ?? "Caso pasado a Comercial", r.error ? "destructive" : undefined);
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-40 ${anilloFoco}`}
    >
      Pasar a Comercial
    </button>
  );
}

/** Nuevo seguimiento comercial. */
export function PanelSeguimiento({ d, alGuardar }: { d: FilaDropshipper; alGuardar?: () => void }) {
  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo="Nuevo seguimiento"
      etiquetaCrear="Crear seguimiento"
      action={crearSeguimiento}
      mensajeExito="Seguimiento creado"
      ocultos={{ dropshipper_id: d.id }}
      boton={(abrir) => <BotonAccion texto="Seguim." icono={CalendarioIcon} alHacerClic={abrir} />}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={CalendarioIcon} titulo="Seguimiento">
          <Campo etiqueta="Qué hay que hacer" id="campo-titulo-seguimiento" obligatorio faltante={faltante}>
            <input
              id="campo-titulo-seguimiento"
              type="text"
              name="titulo"
              required
              maxLength={200}
              autoComplete="off"
              data-enfocar
              aria-invalid={invalido("campo-titulo-seguimiento")}
              placeholder="Ej: Ofrecerle el nuevo producto de belleza"
              className={`${fieldClass} w-full`}
            />
          </Campo>
          <Campo etiqueta="Para cuándo" id="campo-vence-seguimiento">
            <input id="campo-vence-seguimiento" type="date" name="vence" min={hoy()} className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Detalle" id="campo-detalle-seguimiento">
            <textarea id="campo-detalle-seguimiento" name="detalle" rows={3} className={`${fieldClass} w-full resize-y`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

/** Fase de captación y líder comercial: aquí se hace la «transferencia» de un captado a un líder. */
export function PanelFase({ d, alGuardar }: { d: FilaDropshipper; alGuardar?: () => void }) {
  const [lideres, setLideres] = useState<LiderComercial[] | "error" | null>(null);
  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo="Fase y líder comercial"
      etiquetaCrear="Guardar"
      action={transferirDropshipper}
      mensajeExito="Guardado"
      ocultos={{ dropshipper_id: d.id }}
      alAbrir={() => {
        setLideres(null);
        obtenerLideresComerciales()
          .then((r) => setLideres("lideres" in r ? r.lideres : "error"))
          .catch(() => setLideres("error"));
      }}
      boton={(abrir) => <BotonAccion texto="Fase" icono={EstadoIcon} alHacerClic={abrir} />}
    >
      {() => (
        <Seccion icono={PersonaIcon} titulo="Captación">
          <Campo etiqueta="Fase" id="campo-fase-ds">
            <select id="campo-fase-ds" name="fase" defaultValue={d.fase} className={`${fieldClass} w-full`}>
              {FASES.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Líder comercial" id="campo-lider-ds">
            {lideres === "error" ? (
              <p id="campo-lider-ds" role="alert" className="py-1 text-xs text-destructive">
                No se pudo cargar la lista de líderes.
              </p>
            ) : (
              <select
                id="campo-lider-ds"
                name="responsable_id"
                disabled={lideres === null}
                defaultValue={d.responsableId ?? ""}
                key={Array.isArray(lideres) ? "listo" : "cargando"}
                className={`${fieldClass} w-full`}
              >
                <option value="">{lideres === null ? "Cargando…" : "Sin asignar"}</option>
                {(Array.isArray(lideres) ? lideres : []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}

/** Los seguimientos comerciales del dropshipper, con su casilla para marcarlos como hechos. */
export function SeguimientosDropshipper({ dropshipperId, puedeEscribir, version }: { dropshipperId: string; puedeEscribir: boolean; version: number }) {
  const { mostrarToast } = useToast();
  const [lista, setLista] = useState<Seguimiento[] | "error" | null>(null);
  const [pendiente, start] = useTransition();

  const cargar = useCallback(() => {
    obtenerSeguimientos(dropshipperId)
      .then((r) => setLista("seguimientos" in r ? r.seguimientos : "error"))
      .catch(() => setLista("error"));
  }, [dropshipperId]);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  if (lista === null) return <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>;
  if (lista === "error") return <p role="alert" className="m-0 text-[13px] text-destructive">No se pudieron cargar los seguimientos.</p>;
  if (lista.length === 0) return <p className="m-0 text-[13px] text-muted-foreground">Sin seguimientos.</p>;

  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
      {lista.map((t) => (
        <li key={t.id} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={t.estado === "hecha"}
            disabled={!puedeEscribir || pendiente}
            aria-label={`Marcar como hecho: ${t.titulo}`}
            onChange={(e) =>
              start(async () => {
                const r = await completarSeguimiento(t.id, e.target.checked);
                if (r.error) mostrarToast(r.error, "destructive");
                cargar();
              })
            }
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span className={`min-w-0 flex-1 ${t.estado === "hecha" ? "text-muted-foreground line-through" : ""}`}>
            {t.titulo}
            {t.escalado ? <span className="text-xs text-muted-foreground"> · desde Atención</span> : null}
            <span className="block text-xs text-muted-foreground">
              {t.vence ? `Para ${formatearFecha(t.vence)}` : "Sin fecha"}
              {t.responsable ? ` · ${t.responsable}` : ""}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const FILTROS = [
  { id: "todo", etiqueta: "Todo" },
  { id: "comercial", etiqueta: "Comercial" },
  { id: "atencion", etiqueta: "Atención" },
] as const;

/** Todo lo que ha pasado con el dropshipper. Quien tiene el área comercial puede filtrar por área; Atención ve solo lo suyo. */
export function LineaDeTiempo({ dropshipperId, acceso, version }: { dropshipperId: string; acceso: AccesoCrm; version: number }) {
  const [datos, setDatos] = useState<ItemLinea[] | "error" | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todo");

  useEffect(() => {
    let vigente = true;
    obtenerLineaDeTiempo(dropshipperId)
      .then((r) => vigente && setDatos("items" in r ? r.items : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, version]);

  const items = Array.isArray(datos) ? datos.filter((i) => filtro === "todo" || i.area === filtro || i.area === "general") : [];

  return (
    <div className="flex flex-col gap-2.5">
      {acceso.comercial && (
        <div role="group" aria-label="Filtrar actividad por área" className="flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${anilloFoco} ${
                filtro === f.id ? "border-primario bg-primario text-white" : "border-border bg-card hover:bg-accent"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}
      {datos === null && <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>}
      {datos === "error" && <p role="alert" className="m-0 text-[13px] text-destructive">No se pudo cargar la actividad.</p>}
      {Array.isArray(datos) && items.length === 0 && <p className="m-0 text-[13px] text-muted-foreground">Sin actividad.</p>}
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {items.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i.area === "comercial" ? "bg-foreground" : "bg-border-control"}`} />
              <span className="min-w-0">
                <TextoConMenciones texto={i.texto} />
                <span className="block text-xs text-muted-foreground">
                  {formatearTiempoRelativo(i.creadoEn)}
                  {acceso.comercial && i.area !== "general" ? ` · ${i.area === "comercial" ? "Comercial" : "Atención"}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
