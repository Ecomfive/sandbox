"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cuandoTarea, diaSiguiente, estadoTarea, MAX_NOTA_CIERRE, MAX_NOTA_TAREA, MAX_TITULO_TAREA, type TareaVista } from "@/lib/publicaciones/tareas";
import { marcarTareaHecha } from "./recomendaciones-actions";
import { usePersonasTareas } from "./recomendacion-publicacion";
import { crearTareaPublicacion, resolverTareaPublicacion } from "./tareas-actions";

/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

const botonOscuro = `inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco}`;
const botonClaro = `inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-60 ${anilloFoco}`;

/** Dentro del formulario de la ficha, Enter en un campo de la tarea no debe enviar la ficha: lo atiende la tarea. */
function sinEnviarFicha(alEnter: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      alEnter();
    }
  };
}

/** «Agregar tarea»: qué hay que hacer, para cuándo (mañana de entrada) y a quién le toca (la persona, de entrada). */
export function FormularioTarea({ publicacionId, alCrear, alCancelar }: { publicacionId: string; alCrear: (t: TareaVista) => void; alCancelar: () => void }) {
  const id = useId();
  const { personas, yo } = usePersonasTareas();
  const { mostrarToast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [plazo, setPlazo] = useState(() => diaSiguiente(hoyPanama()));
  const [responsable, setResponsable] = useState(yo);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar() {
    if (pendiente) return;
    if (!titulo.trim()) return void setError("Escribe qué hay que hacer.");
    setError(null);
    empezar(async () => {
      const r = await crearTareaPublicacion(publicacionId, { titulo, plazo: plazo || null, responsableId: responsable || null, nota }).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", tarea: undefined }));
      if (r.error || !r.tarea) return void setError(r.error ?? "No se pudo guardar la tarea.");
      mostrarToast("Tarea agregada");
      alCrear(r.tarea);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3" onKeyDown={sinEnviarFicha(guardar)}>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Qué hay que hacer</span>
        <input
          autoFocus
          type="text"
          maxLength={MAX_TITULO_TAREA}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej: Verificar el inventario en bodega"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${fieldClass} w-full`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Para cuándo</span>
          <input type="date" value={plazo} onChange={(e) => setPlazo(e.target.value)} className={`${fieldClass} w-full`} />
        </label>
        {personas.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Quién la hace</span>
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={`${fieldClass} w-full`}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === yo ? `${p.nombre} (yo)` : p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Nota (opcional)</span>
        <textarea rows={2} maxLength={MAX_NOTA_TAREA} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Contar las que quedan en el estante B" className={`${fieldClass} w-full`} />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={pendiente} className={botonOscuro}>
          {pendiente ? "Guardando…" : "Agregar tarea"}
        </button>
        <button type="button" onClick={alCancelar} className={botonClaro}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

const PUNTO: Partial<Record<ReturnType<typeof estadoTarea>, { clase: string; texto: string }>> = {
  atrasada: { clase: "bg-destructive", texto: "Atrasada" },
  hoy: { clase: "bg-warning", texto: "Para hoy" },
};

/**
 * Una tarea en una lista: su punto si está atrasada (rojo) o es para hoy (ámbar), qué hay que hacer, para cuándo, a quién le toca, su nota y, si está
 * pendiente, «Resolver» con una nota opcional de qué se hizo. Una tarea de una recomendación se resuelve igual que en Recomendaciones.
 */
export function LineaTarea({
  t,
  hoy,
  puedeEscribir,
  mostrarResponsable = true,
  antes,
  alResolver,
}: {
  t: TareaVista;
  hoy: string;
  puedeEscribir: boolean;
  mostrarResponsable?: boolean;
  /** Lo que va antes del título (la publicación, en la pestaña «Tareas»). */
  antes?: ReactNode;
  alResolver: (t: TareaVista) => void;
}) {
  const { mostrarToast } = useToast();
  const [resolviendo, setResolviendo] = useState(false);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const estado = estadoTarea(t, hoy);
  const punto = PUNTO[estado];

  function resolver() {
    if (pendiente) return;
    setError(null);
    empezar(async () => {
      const r = await (t.origen === "manual" ? resolverTareaPublicacion(t.id, nota) : marcarTareaHecha(t.id, nota)).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }));
      if (r.error) return void setError(r.error);
      mostrarToast("Tarea resuelta");
      setResolviendo(false);
      alResolver({ ...t, hechaEn: new Date().toISOString(), hechaNota: nota.trim() || null });
    });
  }

  const hecha = estado === "hecha";
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        {antes}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${hecha ? "text-muted-foreground line-through" : ""}`}>
            {punto && <span role="img" aria-label={punto.texto} className={`h-2 w-2 shrink-0 rounded-full ${punto.clase}`} />}
            <span className="min-w-0 break-words">{t.titulo}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {hecha ? `Hecha${t.hechaPor ? ` por ${t.hechaPor}` : ""}` : cuandoTarea(t.plazo, hoy)}
            {mostrarResponsable && t.responsableNombre && !hecha ? ` · ${t.responsableNombre}` : ""}
            {t.origen === "recomendacion" ? " · De una recomendación" : ""}
          </span>
          {t.nota && <span className="text-xs break-words text-muted-foreground">{t.nota}</span>}
          {hecha && t.hechaNota && <span className="text-xs break-words text-muted-foreground">«{t.hechaNota}»</span>}
        </div>
        {!hecha && puedeEscribir && !resolviendo && (
          <button type="button" onClick={() => setResolviendo(true)} className={`${botonClaro} shrink-0`}>
            Resolver
          </button>
        )}
      </div>
      {resolviendo && (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-3" onKeyDown={sinEnviarFicha(resolver)}>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Qué se hizo (opcional)</span>
            <input autoFocus type="text" maxLength={MAX_NOTA_CIERRE} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Quedan 40 unidades" className={`${fieldClass} w-full`} />
          </label>
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resolver} disabled={pendiente} className={botonOscuro}>
              {pendiente ? "Guardando…" : "Marcar como hecha"}
            </button>
            <button type="button" onClick={() => setResolviendo(false)} className={botonClaro}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
