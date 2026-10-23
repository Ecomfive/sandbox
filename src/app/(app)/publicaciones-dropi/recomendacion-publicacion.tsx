"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { SugerenciaIcon } from "@/lib/nav-icons";
import { DECISIONES, DIAS_POSPONER, ESTADOS_TAREA, TIPOS_RECOMENDACION, etiquetaRecomendacion, type Decision, type Recomendacion } from "@/lib/publicaciones/recomendaciones";
import type { DecisionVista, FilaPublicacion } from "./def-publicaciones";
import { tipoIADeRecomendacion } from "@/lib/publicaciones/ia/asistente";
import { BotonAsistenteIA } from "./asistente-ia";
import { decidirRecomendacion, marcarTareaHecha } from "./recomendaciones-actions";

/** A quién se le puede asignar una tarea, quién es la persona y si ya existe la migración 0128 (sin ella, no hay tareas). */
interface Tareas {
  personas: { id: string; nombre: string }[];
  yo: string;
  conTareas: boolean;
}
const ContextoTareas = createContext<Tareas>({ personas: [], yo: "", conTareas: false });

export function ProveedorTareas({ children, ...valor }: Tareas & { children: ReactNode }) {
  return <ContextoTareas.Provider value={valor}>{children}</ContextoTareas.Provider>;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" });
const botonClaro = `inline-flex h-9 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonOscuro = `inline-flex h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;

const TEXTO_CONFIRMAR: Record<Decision, string> = { aceptada: "Aceptar", rechazada: "Rechazar", pospuesta: "Posponer" };
const TOAST: Record<Decision, string> = { aceptada: "Recomendación aceptada", rechazada: "Recomendación rechazada", pospuesta: "Recomendación pospuesta" };

/**
 * Una recomendación como tarea: qué hacer, por qué y qué se espera, con Aceptar, Rechazar o Posponer. Al elegir, se pide el porqué
 * (obligatorio al rechazar): es lo que queda guardado para que el sistema aprenda de cada decisión.
 */
export function TarjetaRecomendacion({ publicacionId, rec, puedeDecidir, responsableSugerido = null }: { publicacionId: string; rec: Recomendacion; puedeDecidir: boolean; responsableSugerido?: string | null }) {
  const router = useRouter();
  const { personas, yo, conTareas } = useContext(ContextoTareas);
  const [responsable, setResponsable] = useState(() => (responsableSugerido && personas.some((p) => p.id === responsableSugerido) ? responsableSugerido : yo));
  const { mostrarToast } = useToast();
  const id = useId();
  const [eligiendo, setEligiendo] = useState<Decision | null>(null);
  const [nota, setNota] = useState("");
  const [dias, setDias] = useState(DIAS_POSPONER[0]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const color = TIPOS_RECOMENDACION.find((t) => t.valor === rec.tipo)?.color;
  const faltaNota = eligiendo === "rechazada" && !nota.trim();

  const confirmar = () => {
    if (!eligiendo || faltaNota) return;
    setError(null);
    empezar(async () => {
      const r = await decidirRecomendacion({ publicacionId, recomendacion: rec, decision: eligiendo, nota, dias, responsableId: eligiendo === "aceptada" ? responsable : null });
      if (r.error) return setError(r.error);
      mostrarToast(r.dropi ? `${TOAST[eligiendo]}. ${r.dropi}` : TOAST[eligiendo]);
      setEligiendo(null);
      setNota("");
      router.refresh();
    });
  };

  return (
    <article aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        {etiquetaRecomendacion(rec.tipo)}
      </div>
      <h4 id={`${id}-t`} className="m-0 text-sm font-semibold">
        {rec.titulo}
      </h4>
      <p className="m-0 text-sm">{rec.motivo}</p>
      <p className="m-0 flex gap-1.5 text-sm text-muted-foreground">
        <SugerenciaIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{rec.resultado}</span>
      </p>

      {puedeDecidir && !eligiendo && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tipoIADeRecomendacion(rec.tipo) && <BotonAsistenteIA publicacionId={publicacionId} tipo={tipoIADeRecomendacion(rec.tipo)!} />}
          <button type="button" className={botonOscuro} onClick={() => setEligiendo("aceptada")}>
            Aceptar
          </button>
          <button type="button" className={botonClaro} onClick={() => setEligiendo("rechazada")}>
            Rechazar
          </button>
          <button type="button" className={botonClaro} onClick={() => setEligiendo("pospuesta")}>
            Posponer
          </button>
        </div>
      )}

      {eligiendo && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          {eligiendo === "aceptada" && conTareas && personas.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>¿Quién lo hace?</span>
              <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={`${fieldClass} w-full sm:w-64`}>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === yo ? `${p.nombre} (yo)` : p.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {eligiendo === "pospuesta" && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Posponer por</span>
              <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={`${fieldClass} w-full sm:w-48`}>
                {DIAS_POSPONER.map((d) => (
                  <option key={d} value={d}>
                    {d} días
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>{eligiendo === "rechazada" ? "Por qué la rechazas *" : "Por qué (opcional)"}</span>
            <textarea
              data-enfocar
              autoFocus
              rows={2}
              maxLength={1000}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEligiendo(null);
                }
              }}
              placeholder={eligiendo === "rechazada" ? "Ej: es talla única, no se vende de a dos" : "Ej: lo publico esta semana"}
              aria-invalid={(!!error && faltaNota) || undefined}
              className={`${fieldClass} w-full`}
            />
          </label>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonOscuro} disabled={pendiente || faltaNota} onClick={confirmar}>
              {pendiente ? "Guardando..." : TEXTO_CONFIRMAR[eligiendo]}
            </button>
            <button type="button" className={botonClaro} disabled={pendiente} onClick={() => setEligiendo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Una tarea (recomendación aceptada): cómo va, quién la hace y hasta cuándo, con «Ya lo hice» si sigue abierta. */
export function TareaRecomendacion({ d, producto, puedeMarcar }: { d: DecisionVista; producto?: ReactNode; puedeMarcar: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const estado = ESTADOS_TAREA.find((e) => e.valor === d.estado);
  const abierta = d.estado === "por_hacer" || d.estado === "atrasada";

  const marcar = () =>
    empezar(async () => {
      setError(null);
      const r = await marcarTareaHecha(d.id, nota);
      if (r.error) return setError(r.error);
      mostrarToast("Tarea marcada como hecha");
      setAbierto(false);
      router.refresh();
    });

  return (
    <article aria-labelledby={`${id}-t`} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {estado && <Badge color={estado.color}>{estado.etiqueta}</Badge>}
        <h4 id={`${id}-t`} className="m-0 text-sm font-semibold">
          {d.titulo || etiquetaRecomendacion(d.tipo)}
        </h4>
      </div>
      {producto}
      <p className="m-0 text-xs text-muted-foreground">
        {d.responsable ? `La hace ${d.responsable}` : "Sin responsable"}
        {d.plazo && !d.hechaEn && (
          <>
            {" · "}
            <span className={d.estado === "atrasada" ? "font-medium text-destructive" : undefined}>{d.estado === "atrasada" ? `venció el ${fechaCorta(`${d.plazo}T12:00:00Z`)}` : `para el ${fechaCorta(`${d.plazo}T12:00:00Z`)}`}</span>
          </>
        )}
        {" · aceptada el "}
        {fechaCorta(d.fecha)}
      </p>
      {d.hechaEn && (
        <p className="m-0 text-xs">
          {d.hechaComo === "manual" ? `Hecha por ${d.hechaPor || "alguien"}` : "Lo detectó el sistema"} el {fechaCorta(d.hechaEn)}
          {d.hechaNota && ` · ${d.hechaComo === "manual" ? `«${d.hechaNota}»` : d.hechaNota}`}
        </p>
      )}
      {abierta && puedeMarcar && !abierto && (
        <div className="flex flex-wrap gap-2 pt-1">
          {tipoIADeRecomendacion(d.tipo) && <BotonAsistenteIA publicacionId={d.publicacionId} tipo={tipoIADeRecomendacion(d.tipo)!} />}
          <button type="button" className={botonClaro} onClick={() => setAbierto(true)}>
            Ya lo hice
          </button>
        </div>
      )}
      {abierto && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Qué se hizo (opcional)</span>
            <textarea
              autoFocus
              rows={2}
              maxLength={600}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAbierto(false);
                }
              }}
              placeholder="Ej: lo dejé en $5.49 en Dropi"
              className={`${fieldClass} w-full`}
            />
          </label>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonOscuro} disabled={pendiente} onClick={marcar}>
              {pendiente ? "Guardando..." : "Marcar como hecha"}
            </button>
            <button type="button" className={botonClaro} disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Una decisión ya tomada: cuándo, qué se decidió, sobre qué recomendación, por qué y quién. */
export function LineaDecision({ d, producto }: { d: DecisionVista; producto?: string }) {
  const o = DECISIONES.find((x) => x.valor === d.decision);
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <span className="flex flex-wrap items-center gap-2">
        {o && <Badge color={o.color}>{o.etiqueta}</Badge>}
        {d.estado && <Badge color={ESTADOS_TAREA.find((e) => e.valor === d.estado)!.color}>{ESTADOS_TAREA.find((e) => e.valor === d.estado)!.etiqueta}</Badge>}
        <span className="font-medium">{d.titulo || etiquetaRecomendacion(d.tipo)}</span>
        {producto && <span className="text-muted-foreground">· {producto}</span>}
      </span>
      {d.nota && <span>«{d.nota}»</span>}
      <span className="text-xs text-muted-foreground">
        {d.usuario || "Alguien"} · {fechaCorta(d.fecha)}
        {d.decision === "pospuesta" && ` · hasta el ${fechaCorta(`${d.vigenteHasta}T12:00:00Z`)}`}
        {d.responsable && ` · la hace ${d.responsable}`}
      </span>
    </li>
  );
}

/** El bloque «Recomendaciones» de la ficha: las tareas abiertas, las pendientes y, plegadas, las decisiones anteriores. */
export function RecomendacionesFicha({ p, puedeEscribir, disponible }: { p: FilaPublicacion; puedeEscribir: boolean; disponible: boolean }) {
  const tareas = p.decisiones.filter((d) => d.estado === "por_hacer" || d.estado === "atrasada");
  if (!p.recomendaciones.length && !p.decisiones.length) return null;
  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={SugerenciaIcon} titulo="Recomendaciones">
        {tareas.length > 0 && (
          <div className="flex flex-col gap-2">
            {tareas.map((d) => (
              <TareaRecomendacion key={d.id} d={d} puedeMarcar={puedeEscribir} />
            ))}
          </div>
        )}
        {p.recomendaciones.length > 0 && (
          <div className="flex flex-col gap-2">
            {p.recomendaciones.map((r) => (
              <TarjetaRecomendacion key={r.tipo} publicacionId={p.id} rec={r} puedeDecidir={puedeEscribir && disponible} responsableSugerido={p.responsableId} />
            ))}
          </div>
        )}
        {puedeEscribir && !disponible && p.recomendaciones.length > 0 && (
          <p role="alert" className="m-0 text-sm text-destructive">
            Para guardar decisiones falta correr en Supabase la migración 0127.
          </p>
        )}
        {p.decisiones.length > 0 && (
          <details className="text-sm">
            <summary className={`cursor-pointer rounded font-medium ${anilloFoco}`}>Decisiones anteriores ({p.decisiones.length})</summary>
            <ul className="m-0 list-none divide-y divide-border p-0">
              {p.decisiones.map((d) => (
                <LineaDecision key={d.id} d={d} />
              ))}
            </ul>
          </details>
        )}
      </Seccion>
    </div>
  );
}
