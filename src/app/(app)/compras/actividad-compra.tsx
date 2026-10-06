"use client";

import { useEffect, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { AdjuntoIcon, HistorialIcon, ProductoIcon } from "@/lib/nav-icons";
import { comentarCompra, obtenerActividadCompra, type ActividadCompra as Datos } from "./actions";
import { CampoMenciones, TextoConMenciones } from "@/components/ui/campo-menciones";
import { Badge } from "@/components/ui/badge";
import { colorEstado, colorEtapa, etiquetaEstado, etiquetaEtapa } from "./def-compras";

const fechaHora = (iso: string) =>
  `${formatearFecha(iso)} ${new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}`;

const ICONO_CLASE: Record<string, string> = { foto: "🖼️", documento: "📄", video: "🎬", otro: "📎" };

/**
 * Un cambio de la actividad, como en ClickUp: «Etapa: [03 - Cotizar] → [09 - Tracking]», con la etiqueta de cada valor en su
 * color (etapa y estado); otro campo, en texto.
 */
function CambioEvento({ e }: { e: Datos["eventos"][number] }) {
  const nombre = e.campo === "etapa" ? "Etapa" : e.campo === "estado" ? "Estado" : e.campo;
  const valor = (v: string | null) => {
    if (v === null) return <span className="text-muted-foreground">—</span>;
    if (e.campo === "etapa") return <Badge color={colorEtapa(v)}>{etiquetaEtapa(v)}</Badge>;
    if (e.campo === "estado") return <Badge color={colorEstado(v)}>{etiquetaEstado(v)}</Badge>;
    return <span>{v}</span>;
  };
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{nombre}:</span>
      {e.antes !== null && (
        <>
          {valor(e.antes)}
          <span aria-label="pasó a" className="text-muted-foreground">
            →
          </span>
        </>
      )}
      {valor(e.despues)}
    </span>
  );
}

/**
 * La actividad de una compra, al final de su ficha: la actividad (cada cambio de etapa y estado, con sus etiquetas de color, su fecha y hora) (lo de ClickUp y lo
 * que se cambie aquí), los comentarios (con uno nuevo), las subtareas (las alternativas de proveedor) y los adjuntos. Se
 * pide al abrir la ficha.
 */
export function ActividadCompra({ id, puedeComentar = true, comentarioResaltado }: { id: string; puedeComentar?: boolean; comentarioResaltado?: string | null }) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<Datos | "error" | null>(null);
  const [version, setVersion] = useState(0);
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  // El campo se vuelve a armar (vacío) después de comentar.
  const [vueltaCampo, setVueltaCampo] = useState(0);
  const [pendiente, start] = useTransition();

  useEffect(() => {
    let vigente = true;
    obtenerActividadCompra(id)
      .then((r) => vigente && setDatos("error" in r ? "error" : r))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id, version]);

  function comentar() {
    start(async () => {
      const r = await comentarCompra(id, texto, menciones);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        if (menciones.length) mostrarToast(`Comentario guardado: se avisó a ${menciones.length} persona${menciones.length === 1 ? "" : "s"}`);
        setTexto("");
        setMenciones([]);
        setVueltaCampo((v) => v + 1);
        setVersion((v) => v + 1);
      }
    });
  }

  if (datos === null) return <p className="px-5 pb-5 text-sm text-muted-foreground">Cargando la actividad…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="px-5 pb-5 text-sm text-destructive">
        No se pudo cargar la actividad.
      </p>
    );

  return (
    <div className="flex flex-col divide-y divide-border border-t border-border p-5">
      {datos.adjuntos.length > 0 && (
        <Seccion icono={AdjuntoIcon} titulo={`Adjuntos (${datos.adjuntos.length})`}>
          <ul className="m-0 grid list-none grid-cols-1 gap-1.5 p-0 text-sm sm:grid-cols-2">
            {datos.adjuntos.map((a) => (
              <li key={a.id} className="min-w-0 truncate">
                <span aria-hidden="true">{ICONO_CLASE[a.clase] ?? "📎"} </span>
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                    {a.nombre}
                  </a>
                ) : (
                  a.nombre
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {datos.subtareas.length > 0 && (
        <Seccion icono={ProductoIcon} titulo={`Subtareas (${datos.subtareas.length})`}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {datos.subtareas.map((t) => (
              <li key={t.id} className="flex flex-col">
                <span>{t.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {t.estado ?? "—"}
                  {t.responsable ? ` · ${t.responsable}` : ""} · {formatearFecha(t.creadoEn)}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion icono={HistorialIcon} titulo="Comentarios">
        {puedeComentar && (
          <div className="flex flex-col gap-2">
            <CampoMenciones
              key={vueltaCampo}
              ariaLabel="Nuevo comentario"
              filas={2}
              valor={texto}
              alCambiar={setTexto}
              alMencionar={setMenciones}
              placeholder="Escribe un comentario… usa @ para etiquetar a alguien"
            />
            <button
              type="button"
              disabled={pendiente || !texto.trim()}
              onClick={comentar}
              className={`w-fit rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
            >
              {pendiente ? "Guardando…" : "Comentar"}
            </button>
          </div>
        )}
        {datos.comentarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin comentarios.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
            {datos.comentarios.map((c) => (
              <li
                key={c.id}
                id={`comentario-${c.id}`}
                ref={c.id === comentarioResaltado ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
                className={`flex flex-col gap-0.5 ${c.id === comentarioResaltado ? "-mx-2 rounded-lg bg-primario-suave px-2 py-1.5 ring-2 ring-primario" : ""}`}
              >
                <span className="text-xs text-muted-foreground">
                  <strong className="font-medium text-foreground">{c.autor ?? "—"}</strong> · {fechaHora(c.creadoEn)}
                </span>
                <span className="whitespace-pre-wrap break-words">
                  <TextoConMenciones texto={c.texto} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion icono={HistorialIcon} titulo="Actividad">
        {datos.eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
            {datos.eventos.map((e) => (
              <li key={e.id} className="flex flex-col">
                <CambioEvento e={e} />
                <span className="text-xs text-muted-foreground">
                  {fechaHora(e.ocurridoEn)}
                  {e.autor ? ` · ${e.autor}` : ""}
                  {e.origen.startsWith("clickup") ? " · ClickUp" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}
