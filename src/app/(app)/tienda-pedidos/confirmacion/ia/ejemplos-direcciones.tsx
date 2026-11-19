"use client";

import { textosCiudad, type TextosCiudad } from "@/lib/confirmacion-ia/textos-pais";
import { useState, useTransition } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { ListaIcon } from "@/lib/nav-icons";
import { SeccionCard } from "./seccion";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { NOMBRE_ZONA, type Zona } from "@/lib/confirmacion-ia/zonas";
import { agregarEjemplo, editarEjemplo, eliminarEjemplo, listarEjemplos, type EjemploDireccion } from "../ia-actions";

const POR_VEZ = 20;
const ZONA_TEXTO = NOMBRE_ZONA;
const boton = `rounded-md border border-border-control bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonPrincipal = `rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`;

/** El formulario de una dirección de ejemplo: sirve para agregar una nueva y para corregir una guardada. */
function FormularioEjemplo({
  inicial,
  distingueZona,
  tiendas,
  tiendaObligatoria,
  etiquetaBoton,
  textos,
  alGuardar,
  alCancelar,
}: {
  inicial?: EjemploDireccion;
  textos: TextosCiudad;
  distingueZona: boolean;
  tiendas: { id: string; nombre: string }[];
  /** La persona ve solo algunas tiendas: tiene que elegir una (no hay «todas»). */
  tiendaObligatoria: boolean;
  etiquetaBoton: string;
  alGuardar: (d: { ciudad: string; direccion: string; completa: boolean; falta: string | null; zona: Zona | null; tiendaId: string | null }) => Promise<string | null>;
  alCancelar?: () => void;
}) {
  const [ciudad, setCiudad] = useState(inicial?.ciudad ?? "");
  const [direccion, setDireccion] = useState(inicial?.direccion ?? "");
  const [completa, setCompleta] = useState(inicial?.completa ?? true);
  const [falta, setFalta] = useState(inicial?.falta ?? "");
  const [zona, setZona] = useState<Zona | "">(inicial?.zona ?? "");
  const [tiendaId, setTiendaId] = useState(inicial?.tiendaId ?? (tiendaObligatoria ? (tiendas[0]?.id ?? "") : ""));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const id = inicial?.id ?? "nuevo";
  const lista = ciudad.trim().length >= 2 && direccion.trim().length >= 5 && (completa || falta.trim().length > 0) && (!tiendaObligatoria || !!tiendaId);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await alGuardar({ ciudad, direccion, completa, falta: completa ? null : falta, zona: completa && distingueZona ? zona || null : null, tiendaId: tiendaId || null });
          if (r) setError(r);
          else if (!inicial) {
            setCiudad("");
            setDireccion("");
            setFalta("");
            setZona("");
            setCompleta(true);
          }
        });
      }}
    >
      <label className="flex flex-col gap-1 sm:max-w-sm">
        <span className={labelClass}>{textos.campo} *</span>
        <input value={ciudad} required maxLength={120} onChange={(e) => setCiudad(e.target.value)} placeholder={textos.ejemploCiudad} className={fieldClass} />
        <span className="text-xs text-muted-foreground">Lo que el cliente puso en ese campo: es lo primero que mira la IA.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Dirección, tal como la dejó el cliente *</span>
        <textarea
          rows={3}
          maxLength={600}
          required
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
          placeholder={textos.ejemploDireccion}
          className={fieldClass}
        />
      </label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={`${labelClass} mb-1 p-0`}>¿La dirección está completa?</legend>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={`completa-${id}`} checked={completa} onChange={() => setCompleta(true)} /> Completa
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`completa-${id}`} checked={!completa} onChange={() => setCompleta(false)} /> Incompleta
          </label>
        </div>
      </fieldset>
      {!completa && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>¿Qué le falta?</span>
          <input value={falta} maxLength={200} onChange={(e) => setFalta(e.target.value)} placeholder="Ej: el número de casa o un punto de referencia" className={fieldClass} />
        </label>
      )}
      {completa && distingueZona && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          <span className={labelClass}>Zona de envío (opcional)</span>
          <select value={zona} onChange={(e) => setZona(e.target.value as Zona | "")} className={fieldClass}>
            <option value="">No sé</option>
            <option value="ciudad">{NOMBRE_ZONA.ciudad}</option>
            <option value="interior">{NOMBRE_ZONA.interior}</option>
            <option value="adelantado">{NOMBRE_ZONA.adelantado}</option>
          </select>
        </label>
      )}
      {tiendas.length > 1 && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          <span className={labelClass}>Tienda</span>
          <select value={tiendaId} onChange={(e) => setTiendaId(e.target.value)} required={tiendaObligatoria} className={fieldClass}>
            {!tiendaObligatoria && <option value="">Todas las tiendas</option>}
            {tiendas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {alCancelar && (
          <button type="button" className={boton} disabled={pendiente} onClick={alCancelar}>
            Cancelar
          </button>
        )}
        <button type="submit" className={botonPrincipal} disabled={pendiente || !lista}>
          {pendiente ? "Guardando…" : etiquetaBoton}
        </button>
      </div>
    </form>
  );
}

export function EjemplosDirecciones({
  paisNombre,
  paisCodigo,
  distingueZona,
  tiendas,
  tiendaObligatoria,
  puedeEscribir,
  total: totalInicial,
}: {
  paisNombre: string;
  paisCodigo?: string;
  distingueZona: boolean;
  tiendas: { id: string; nombre: string }[];
  tiendaObligatoria: boolean;
  puedeEscribir: boolean;
  total: number;
}) {
  const textos = textosCiudad(paisCodigo);
  const { mostrarToast } = useToast();
  const [total, setTotal] = useState(totalInicial);
  const [abierto, setAbierto] = useState(false);
  const [solo, setSolo] = useState<"todos" | "mios">("todos");
  const [limite, setLimite] = useState(POR_VEZ);
  const [lista, setLista] = useState<EjemploDireccion[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [, empezar] = useTransition();

  async function cargar(s: "todos" | "mios", l: number) {
    setCargando(true);
    const r = await listarEjemplos(s, l);
    setCargando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    setLista(r.ejemplos);
    if (s === "todos") setTotal(r.total);
  }

  return (
    <SeccionCard
      id="ejemplos"
      icono={ListaIcon}
      titulo="Direcciones de ejemplo"
      derecha={
        <span className="text-xs text-muted-foreground">
          {paisNombre} · {total} {total === 1 ? "guardada" : "guardadas"}
        </span>
      }
      ayuda="Escribe una dirección como la dejó el cliente y marca si está completa o incompleta. Cuantas más agregues, mejor distingue la IA qué falta."
    >
      <div className="flex flex-col gap-4">
        {puedeEscribir ? (
          <FormularioEjemplo
            distingueZona={distingueZona}
            tiendas={tiendas}
            tiendaObligatoria={tiendaObligatoria}
            textos={textos}
            etiquetaBoton="Guardar dirección"
            alGuardar={async (d) => {
              const r = await agregarEjemplo(d);
              if (r.error) return r.error;
              mostrarToast("Dirección guardada.");
              setTotal((n) => n + 1);
              if (abierto) void cargar(solo, limite);
              return null;
            }}
          />
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Solo lectura: tu rol no puede agregar direcciones.</p>
        )}
      </div>

      <details
        className="rounded-lg border border-border"
        onToggle={(e) => {
          const abre = (e.currentTarget as HTMLDetailsElement).open;
          setAbierto(abre);
          if (abre && !lista) void cargar(solo, limite);
        }}
      >
        <summary className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium ${anilloFoco}`}>Ver y corregir las últimas agregadas</summary>
        <div className="flex flex-col gap-3 border-t border-border p-4">
          <div role="group" aria-label="Quién las agregó" className="flex gap-2">
            {(["todos", "mios"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={solo === s}
                onClick={() => {
                  setSolo(s);
                  setLimite(POR_VEZ);
                  void cargar(s, POR_VEZ);
                }}
                className={`min-h-8 rounded-full border px-3 text-xs font-semibold ${solo === s ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"} ${anilloFoco}`}
              >
                {s === "todos" ? "De todos" : "Las mías"}
              </button>
            ))}
          </div>
          {cargando && !lista ? (
            <p className="m-0 text-sm text-muted-foreground">Cargando…</p>
          ) : !lista?.length ? (
            <p className="m-0 text-sm text-muted-foreground">{solo === "mios" ? "Todavía no agregaste ninguna." : "Todavía no hay direcciones."}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {lista.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 py-3 first:pt-0">
                  {editando === e.id ? (
                    <FormularioEjemplo
                      inicial={e}
                      distingueZona={distingueZona}
                      tiendas={tiendas}
                      tiendaObligatoria={tiendaObligatoria}
                      textos={textos}
                      etiquetaBoton="Guardar cambios"
                      alCancelar={() => setEditando(null)}
                      alGuardar={async (d) => {
                        const r = await editarEjemplo(e.id, d);
                        if (r.error) return r.error;
                        mostrarToast("Cambios guardados.");
                        setEditando(null);
                        void cargar(solo, limite);
                        return null;
                      }}
                    />
                  ) : (
                    <>
                      <p className="m-0 text-sm">
                        {e.ciudad && <b>{e.ciudad} · </b>}
                        {e.direccion}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Pastilla tono={e.completa ? "exito" : "aviso"}>{e.completa ? "Completa" : "Incompleta"}</Pastilla>
                        {!e.completa && e.falta && <span>Falta {e.falta}</span>}
                        {e.zona && <Pastilla>{ZONA_TEXTO[e.zona]}</Pastilla>}
                        <span>{e.tienda ?? "Todas las tiendas"}</span>
                        <span>
                          {e.mio ? "Tú" : (e.creadoPor ?? "—")} · {new Date(e.creadoEn).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" })}
                        </span>
                        {puedeEscribir && (
                          <span className="ml-auto flex gap-2">
                            {borrando === e.id ? (
                              <>
                                <button type="button" className={boton} onClick={() => setBorrando(null)}>
                                  No
                                </button>
                                <button
                                  type="button"
                                  className={`rounded-md bg-destructive px-3 py-1.5 text-sm font-semibold text-white ${anilloFoco}`}
                                  onClick={() =>
                                    empezar(async () => {
                                      const r = await eliminarEjemplo(e.id);
                                      if (r.error) return mostrarToast(r.error, "destructive");
                                      setBorrando(null);
                                      setTotal((n) => Math.max(0, n - 1));
                                      void cargar(solo, limite);
                                    })
                                  }
                                >
                                  Sí, borrar
                                </button>
                              </>
                            ) : (
                              <>
                                <button type="button" className={boton} onClick={() => setEditando(e.id)}>
                                  Editar
                                </button>
                                <button type="button" className={boton} onClick={() => setBorrando(e.id)}>
                                  Borrar
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {lista && lista.length >= limite && (
            <button
              type="button"
              className={`${boton} self-start`}
              disabled={cargando}
              onClick={() => {
                const l = limite + POR_VEZ;
                setLimite(l);
                void cargar(solo, l);
              }}
            >
              Ver más
            </button>
          )}
        </div>
      </details>
    </SeccionCard>
  );
}
