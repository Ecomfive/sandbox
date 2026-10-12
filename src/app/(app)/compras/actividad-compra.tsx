"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { HistorialIcon, ProductoIcon } from "@/lib/nav-icons";
import { comentarCompra, obtenerActividadCompra, type ActividadCompra as Datos } from "./actions";
import { CampoMenciones } from "@/components/ui/campo-menciones";
import { TarjetaComentario } from "./comentario-compra";
import { Badge } from "@/components/ui/badge";
import { archivosDe, BotonAdjuntar, GaleriaAdjuntos, TiraPendientes, useAdjuntosPendientes } from "./adjuntos-comentario";
import { colorEstado, colorEtapa, etiquetaEstado, etiquetaEtapa } from "./def-compras";
import { CAMPOS_EDITABLES } from "./def-edicion-compras";

/** El nombre de cada dato en la Actividad: los de las celdas de la lista y los demás de la ficha. */
const NOMBRE_CAMPO: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CAMPOS_EDITABLES).map(([clave, def]) => [clave, def.etiqueta])),
  nombre: "Nombre",
  descripcion: "Descripción",
  urlProducto: "URL del producto",
  documentos: "Documentos",
  planificacion: "Planificación",
  agenteEnvio: "Agente de envío",
  pais: "País",
  ventaImportacion: "Tipo de venta",
  productoRelacionado: "Producto relacionado",
  paisesDestino: "Países de destino",
  codigo: "Código",
};
const corto = (t: string | null, max = 120) => (t && t.length > max ? `${t.slice(0, max)}…` : t);

const fechaHora = (iso: string) =>
  `${formatearFecha(iso)} ${new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}`;

type Item =
  | { tipo: "comentario"; fecha: string; c: Datos["comentarios"][number] }
  | { tipo: "cambio"; fecha: string; e: Datos["eventos"][number] }
  | { tipo: "archivo"; fecha: string; a: Datos["adjuntos"][number] };

/**
 * Un cambio de la actividad, como en ClickUp: «Etapa: [01 - Cotizar] → [04 - Tracking]», con la etiqueta de cada valor en su
 * color (etapa y estado); otro campo, en texto.
 */
function CambioEvento({ e }: { e: Datos["eventos"][number] }) {
  // Los productos de la orden y la foto se cuentan como una acción; el resto, «Dato: antes → después».
  if (e.campo === "productoAgregado") return <span>Agregó el producto {e.despues}</span>;
  if (e.campo === "productoQuitado") return <span>Quitó el producto {e.antes}</span>;
  if (e.campo === "productoCambiado")
    return (
      <span>
        Cambió {e.antes} <span className="text-muted-foreground">→</span> {e.despues}
      </span>
    );
  if (e.campo === "anulacion") return <span className="text-destructive">Anuló la compra: {e.despues}</span>;
  if (e.campo === "restauracion") return <span>Restauró la compra</span>;
  if (e.campo === "foto") return <span>{e.despues && e.despues !== "—" ? "Cambió la foto del producto" : "Quitó la foto del producto"}</span>;
  const nombre = e.campo === "etapa" ? "Etapa" : e.campo === "estado" ? "Estado" : (NOMBRE_CAMPO[e.campo] ?? e.campo);
  const valor = (v: string | null) => {
    if (v === null) return <span className="text-muted-foreground">—</span>;
    if (e.campo === "etapa") return <Badge color={colorEtapa(v)}>{etiquetaEtapa(v)}</Badge>;
    if (e.campo === "estado") return <Badge color={colorEstado(v)}>{etiquetaEstado(v)}</Badge>;
    return <span className="break-words">{corto(v)}</span>;
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
 * La actividad de una compra, al final de su ficha, como la de ClickUp: **un solo bloque** con los comentarios (tarjeta con
 * iniciales, autor, hora, texto y sus imágenes en miniatura de 40 × 40), los cambios (una línea corta en gris: quién, qué dato,
 * de qué a qué, con las etiquetas de color de etapa y estado) y los archivos sueltos (los de ClickUp), en orden de tiempo y con
 * el campo para comentar abajo. Se filtra por Todo, Comentarios o Cambios. Las subtareas (alternativas de proveedor) van
 * aparte, arriba. Se pide al abrir la ficha.
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
  // Los archivos del comentario que se escribe (la captura de un pago…): suben al elegirlos y viajan con el comentario.
  const adjuntos = useAdjuntosPendientes(id);
  const [sobreCampo, setSobreCampo] = useState(false);
  const [filtro, setFiltro] = useState<"todo" | "comentarios" | "cambios">("todo");
  const [verTodo, setVerTodo] = useState(false);
  const lista = useRef<HTMLDivElement>(null);

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
      const r = await comentarCompra(id, texto, menciones, adjuntos.listos);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        if (menciones.length) mostrarToast(`Comentario guardado: se avisó a ${menciones.length} persona${menciones.length === 1 ? "" : "s"}`);
        setTexto("");
        setMenciones([]);
        adjuntos.vaciar();
        setVueltaCampo((v) => v + 1);
        setVersion((v) => v + 1);
      }
    });
  }

  // Una sola línea de tiempo, como la actividad de ClickUp: comentarios, cambios y archivos sueltos juntos, de lo más viejo
  // (arriba) a lo más nuevo (abajo, junto al campo para comentar). Lo viejo se pliega detrás de «Ver anteriores».
  const items: Item[] = useMemo(() => {
    if (!datos || datos === "error") return [];
    const todos: Item[] = [
      // Las respuestas no van sueltas: se ven dentro del comentario al que responden.
      ...datos.comentarios.filter((c) => !c.respuestaA).map((c) => ({ tipo: "comentario" as const, fecha: c.creadoEn, c })),
      ...datos.eventos.map((e) => ({ tipo: "cambio" as const, fecha: e.ocurridoEn, e })),
      ...datos.adjuntos.map((a) => ({ tipo: "archivo" as const, fecha: a.creadoEn, a })),
    ];
    return todos.sort((x, y) => x.fecha.localeCompare(y.fecha));
  }, [datos]);
  const nComentarios = items.filter((it) => it.tipo === "comentario").length;
  // Las respuestas de cada comentario, de la más vieja a la más nueva.
  const respuestas = useMemo(() => {
    const m = new Map<string, Datos["comentarios"]>();
    if (!datos || datos === "error") return m;
    for (const c of [...datos.comentarios].sort((x, y) => x.creadoEn.localeCompare(y.creadoEn)))
      if (c.respuestaA) m.set(c.respuestaA, [...(m.get(c.respuestaA) ?? []), c]);
    return m;
  }, [datos]);
  const filtrados = items.filter((it) => filtro === "todo" || (filtro === "comentarios" ? it.tipo === "comentario" : it.tipo !== "comentario"));
  // Se ven los últimos 30 (todo si hay un comentario que señalar); el resto con «Ver anteriores».
  const ocultos = verTodo || comentarioResaltado ? 0 : Math.max(0, filtrados.length - 30);
  const visibles = filtrados.slice(ocultos);
  // Al cargar o comentar, la lista baja hasta lo más nuevo (salvo que haya un comentario que señalar).
  useEffect(() => {
    if (comentarioResaltado) return;
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, filtro, comentarioResaltado]);

  if (datos === null) return <p className="px-5 pb-5 text-sm text-muted-foreground">Cargando la actividad…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="px-5 pb-5 text-sm text-destructive">
        No se pudo cargar la actividad.
      </p>
    );

  return (
    <div className="flex flex-col gap-5 border-t border-border p-5">
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

      <section aria-labelledby={`actividad-${id}`} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-3.5 py-2">
          <h3 id={`actividad-${id}`} className="m-0 flex items-center gap-1.5 text-sm font-semibold">
            <HistorialIcon className="h-4 w-4 text-muted-foreground" />
            Actividad
          </h3>
          <div role="group" aria-label="Qué ver en la actividad" className="flex gap-0.5 rounded-[7px] border border-border bg-card p-0.5">
            {(
              [
                ["todo", "Todo", items.length],
                ["comentarios", "Comentarios", nComentarios],
                ["cambios", "Cambios", items.length - nComentarios],
              ] as const
            ).map(([valor, etiqueta, n]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
                className={`rounded-[5px] px-2 py-0.5 text-xs ${anilloFoco} ${filtro === valor ? "bg-primario text-white" : "text-muted-foreground hover:text-foreground"}`}
              >
                {etiqueta} <span className="tabular-nums opacity-75">{n}</span>
              </button>
            ))}
          </div>
        </header>

        <div ref={lista} className="flex max-h-[34rem] min-h-24 flex-col gap-1 overflow-y-auto overscroll-contain px-3.5 py-3">
          {ocultos > 0 && (
            <button
              type="button"
              onClick={() => setVerTodo(true)}
              className={`mx-auto mb-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
            >
              Ver {ocultos} {ocultos === 1 ? "anterior" : "anteriores"}
            </button>
          )}
          {visibles.length === 0 && <p className="m-auto text-sm text-muted-foreground">{filtro === "comentarios" ? "Sin comentarios todavía." : "Sin actividad todavía."}</p>}
          {visibles.map((it) =>
            it.tipo === "comentario" ? (
              <TarjetaComentario
                key={`c-${it.c.id}`}
                compraId={id}
                comentario={it.c}
                respuestas={respuestas.get(it.c.id) ?? []}
                resaltado={comentarioResaltado}
                puedeComentar={puedeComentar}
                alResponder={() => setVersion((v) => v + 1)}
              />
            ) : it.tipo === "archivo" ? (
              <div key={`a-${it.a.id}`} className="flex items-start gap-2 py-1 text-[13px]">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-control" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-muted-foreground">
                    <span>Adjuntó un archivo</span>
                    <time dateTime={it.a.creadoEn} className="text-xs">
                      {fechaHora(it.a.creadoEn)}
                    </time>
                  </span>
                  <GaleriaAdjuntos adjuntos={[it.a]} />
                </div>
              </div>
            ) : (
              <div key={`e-${it.e.id}`} className="flex items-start gap-2 py-1 text-[13px]">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-control" />
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="font-medium text-foreground">{it.e.autor ?? (it.e.origen.startsWith("clickup") ? "ClickUp" : "Sistema")}</span>
                    <CambioEvento e={it.e} />
                  </span>
                  <time dateTime={it.e.ocurridoEn} className="text-xs whitespace-nowrap text-muted-foreground">
                    {fechaHora(it.e.ocurridoEn)}
                    {it.e.origen.startsWith("clickup") ? " · ClickUp" : ""}
                  </time>
                </div>
              </div>
            ),
          )}
        </div>

        {puedeComentar && (
          <div
            // Una imagen que se pega (Ctrl+V) o se suelta sobre el campo queda adjunta al comentario, como en ClickUp.
            onPaste={(e) => {
              const archivos = archivosDe(e);
              if (archivos.length === 0) return;
              e.preventDefault();
              adjuntos.agregar(archivos);
            }}
            onDragOver={(e) => {
              if (![...e.dataTransfer.types].includes("Files")) return;
              e.preventDefault();
              setSobreCampo(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobreCampo(false);
            }}
            onDrop={(e) => {
              setSobreCampo(false);
              const archivos = archivosDe(e);
              if (archivos.length === 0) return;
              e.preventDefault();
              adjuntos.agregar(archivos);
            }}
            className={`flex flex-col gap-2 border-t border-border bg-card p-3 ${sobreCampo ? "outline-2 -outline-offset-2 outline-primario" : ""}`}
          >
            <CampoMenciones
              key={vueltaCampo}
              ariaLabel="Nuevo comentario"
              filas={2}
              valor={texto}
              alCambiar={setTexto}
              alMencionar={setMenciones}
              placeholder="Escribe un comentario… usa @ para etiquetar a alguien. Empieza con «Inconveniente:» para marcar una falla."
            />
            <TiraPendientes pendientes={adjuntos.pendientes} alQuitar={adjuntos.quitar} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <BotonAdjuntar alElegir={adjuntos.agregar} deshabilitado={pendiente || adjuntos.lleno} />
              <button
                type="button"
                disabled={pendiente || adjuntos.subiendo || (!texto.trim() && adjuntos.listos.length === 0)}
                onClick={comentar}
                className={`w-fit rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
              >
                {pendiente ? "Guardando…" : adjuntos.subiendo ? "Subiendo…" : "Comentar"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
