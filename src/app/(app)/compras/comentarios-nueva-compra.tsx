"use client";

import { useState } from "react";
import { CampoMenciones } from "@/components/ui/campo-menciones";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { MAX_ADJUNTOS_COMENTARIO, motivoDeRechazo } from "@/lib/compras/adjuntos";
import { AdjuntoIcon, CerrarIcon, HistorialIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { comentarCompra, prepararSubidaAdjuntoComentario } from "./actions";
import { archivosDe, BotonAdjuntar } from "./adjuntos-comentario";

/** Un comentario escrito antes de crear la compra: su texto, a quién menciona y sus archivos (todavía en el navegador). */
export interface ComentarioBorrador {
  id: string;
  texto: string;
  menciones: string[];
  archivos: File[];
}

/**
 * Publica los comentarios en borrador en la compra recién creada: sube sus archivos (como el campo de comentario de la ficha)
 * y comenta, avisando a las personas mencionadas. Devuelve cuántos no se pudieron guardar.
 */
export async function publicarComentarios(compraId: string, borradores: ComentarioBorrador[]): Promise<number> {
  let fallidos = 0;
  for (const b of borradores) {
    try {
      const adjuntos: { ruta: string; nombre: string }[] = [];
      for (const archivo of b.archivos) {
        const nombre = archivo.name || (archivo.type.startsWith("image/") ? "captura.png" : "archivo");
        const permiso = await prepararSubidaAdjuntoComentario(compraId, nombre);
        if ("error" in permiso) throw new Error(permiso.error);
        const { error } = await supabase.storage.from("wms-compras").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
        if (error) throw new Error(error.message);
        adjuntos.push({ ruta: permiso.ruta, nombre });
      }
      const r = await comentarCompra(compraId, b.texto, b.menciones, adjuntos);
      if (r.error) throw new Error(r.error);
    } catch {
      fallidos++;
    }
  }
  return fallidos;
}

/**
 * Los comentarios de una orden de compra nueva, igual que en la ficha de una existente: se escribe con @ para avisar a
 * alguien, se adjuntan imágenes o PDF (botón, pegar o arrastrar sobre el campo) y «Agregar comentario» lo deja listo. Se
 * guardan en la compra al pulsar «Crear compra».
 */
export function ComentariosNuevaCompra({ borradores, alCambiar }: { borradores: ComentarioBorrador[]; alCambiar: (b: ComentarioBorrador[]) => void }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState("");
  const [menciones, setMenciones] = useState<string[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [vuelta, setVuelta] = useState(0);
  const [sobre, setSobre] = useState(false);

  function agregarArchivos(nuevos: File[]) {
    const aceptados: File[] = [];
    for (const f of nuevos) {
      const motivo = motivoDeRechazo({ tipo: f.type, tamano: f.size });
      if (motivo) mostrarToast(`${f.name}: ${motivo}`, "destructive");
      else aceptados.push(f);
    }
    setArchivos((a) => {
      const todos = [...a, ...aceptados];
      if (todos.length > MAX_ADJUNTOS_COMENTARIO) mostrarToast(`Un comentario lleva hasta ${MAX_ADJUNTOS_COMENTARIO} archivos.`, "destructive");
      return todos.slice(0, MAX_ADJUNTOS_COMENTARIO);
    });
  }

  function agregar() {
    if (!texto.trim() && archivos.length === 0) return;
    alCambiar([...borradores, { id: crypto.randomUUID(), texto: texto.trim(), menciones, archivos }]);
    setTexto("");
    setMenciones([]);
    setArchivos([]);
    setVuelta((v) => v + 1);
  }

  return (
    <Seccion icono={HistorialIcon} titulo="Comentarios">
      <div
        onPaste={(e) => {
          const f = archivosDe(e);
          if (f.length) {
            e.preventDefault();
            agregarArchivos(f);
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setSobre(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false);
        }}
        onDrop={(e) => {
          setSobre(false);
          const f = archivosDe(e);
          if (f.length === 0) return;
          e.preventDefault();
          agregarArchivos(f);
        }}
        // Lo que se escribe aquí no es un dato de la compra: no enciende «cambios» ni se envía con Enter.
        onChange={(e) => e.stopPropagation()}
        onInput={(e) => e.stopPropagation()}
        className={`flex flex-col gap-2 rounded-lg ${sobre ? "outline-2 outline-offset-2 outline-primario" : ""}`}
      >
        <CampoMenciones
          key={vuelta}
          ariaLabel="Comentario de la compra nueva"
          filas={2}
          valor={texto}
          alCambiar={setTexto}
          alMencionar={setMenciones}
          placeholder="Escribe un comentario… usa @ para etiquetar a alguien. Empieza con «Inconveniente:» para marcar una falla."
        />
        {archivos.length > 0 && (
          <ul aria-label="Archivos del comentario" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {archivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs">
                <AdjuntoIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <span className="max-w-40 truncate">{f.name || "captura"}</span>
                <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} className={`rounded text-muted-foreground hover:text-foreground ${anilloFoco}`}>
                  <CerrarIcon className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!texto.trim() && archivos.length === 0}
            onClick={agregar}
            className={`w-fit rounded-md border border-foreground bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
          >
            Agregar comentario
          </button>
          <BotonAdjuntar alElegir={agregarArchivos} deshabilitado={archivos.length >= MAX_ADJUNTOS_COMENTARIO} />
        </div>
      </div>
      {borradores.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {borradores.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
              <span className="flex min-w-0 flex-col gap-1">
                {b.texto && <span className="whitespace-pre-wrap break-words">{b.texto}</span>}
                {b.archivos.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {b.archivos.length} archivo{b.archivos.length === 1 ? "" : "s"}: {b.archivos.map((f) => f.name || "captura").join(", ")}
                  </span>
                )}
                {b.menciones.length > 0 && (
                  <span className="text-xs text-primario">
                    Avisará a {b.menciones.length} persona{b.menciones.length === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => alCambiar(borradores.filter((x) => x.id !== b.id))} className={`shrink-0 text-xs text-muted-foreground hover:text-destructive ${anilloFoco}`}>
                Quitar
              </button>
            </li>
          ))}
          <li className="text-xs text-muted-foreground">Se guardan en la compra al pulsar «Crear compra».</li>
        </ul>
      )}
    </Seccion>
  );
}
