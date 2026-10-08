"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { supabase } from "@/lib/supabase/client";
import { AdjuntoIcon } from "@/lib/nav-icons";
import { guardarFotoProducto, prepararSubidaFotoProducto, subirFotoProductoDesdeUrl } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;

/** La dirección de la imagen que se arrastró desde otra página (la lista de enlaces, el `<img>` del HTML o el texto). */
function urlArrastrada(dt: DataTransfer): string | null {
  const html = dt.getData("text/html");
  const deHtml = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src") : null;
  const lista = dt
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((l) => l && !l.startsWith("#"));
  const texto = dt.getData("text/plain").trim();
  const candidata = deHtml || lista || (/^(https?:|data:image\/)/.test(texto) ? texto : null);
  return candidata || null;
}

/** Si lo que se arrastra puede ser una imagen (un archivo o algo de otra página). */
// (Un texto seleccionado que se arrastra trae HTML pero no `text/uri-list`: ese no cuenta.)
const pareceImagen = (dt: DataTransfer | null) => !!dt && (dt.types.includes("Files") || dt.types.includes("text/uri-list"));

/**
 * La foto del producto arriba de su ficha. Con permiso de escritura se sube, se cambia o se quita ahí mismo, y además:
 * mientras la ficha está abierta se puede **arrastrar una imagen** desde el escritorio o desde cualquier página de internet y
 * soltarla en cualquier parte, o **pegarla** (Ctrl+V). Del escritorio sube directo; de internet la descarga el servidor (solo
 * de sitios públicos, revisando que sea una imagen). Se guarda al instante y se ve también en Producto e Inventario.
 */
export function FotoProducto({ id, nombre, foto, puedeEscribir }: { id: string; nombre: string; foto: string | null; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const ocupado = subiendo || pendiente;
  // Las funciones de subir cambian en cada dibujo; los oyentes del documento usan siempre la última.
  const recibir = useRef<(dt: DataTransfer) => void>(() => {});

  async function subirArchivo(f: File) {
    if (!f.type.startsWith("image/")) return mostrarToast("Eso no es una imagen (JPG, PNG, WebP o GIF).", "destructive");
    if (f.size > MAX_BYTES) return mostrarToast("La imagen pesa más de 5 MB.", "destructive");
    setSubiendo(true);
    try {
      const permiso = await prepararSubidaFotoProducto(id, f.name || "foto");
      if ("error" in permiso) return mostrarToast(permiso.error, "destructive");
      const { error } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type });
      if (error) return mostrarToast("No se pudo subir la imagen.", "destructive");
      const r = await guardarFotoProducto(id, permiso.ruta);
      if (r.error) return mostrarToast(r.error, "destructive");
      listo();
    } catch {
      mostrarToast("No se pudo subir la imagen.", "destructive");
    } finally {
      setSubiendo(false);
    }
  }

  async function subirDesdeUrl(url: string) {
    if (url.startsWith("data:image/")) {
      const blob = await (await fetch(url)).blob();
      return subirArchivo(new File([blob], "imagen", { type: blob.type }));
    }
    setSubiendo(true);
    try {
      const r = await subirFotoProductoDesdeUrl(id, url);
      if (r.error) return mostrarToast(r.error, "destructive");
      listo();
    } catch {
      mostrarToast("No se pudo traer la imagen.", "destructive");
    } finally {
      setSubiendo(false);
    }
  }

  function listo() {
    mostrarToast(foto ? "Foto cambiada." : "Foto agregada.");
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    recibir.current = (dt: DataTransfer) => {
      const f = [...dt.files].find((x) => x.type.startsWith("image/"));
      if (f) return void subirArchivo(f);
      const url = urlArrastrada(dt);
      if (url) void subirDesdeUrl(url);
      else mostrarToast("No encontré una imagen en lo que soltaste.", "destructive");
    };
  });

  // Arrastrar y pegar en toda la ficha mientras está abierta.
  useEffect(() => {
    if (!puedeEscribir) return;
    let dentro = 0;
    const entra = (e: DragEvent) => {
      if (!pareceImagen(e.dataTransfer)) return;
      e.preventDefault();
      dentro++;
      setArrastrando(true);
    };
    const sobre = (e: DragEvent) => {
      if (pareceImagen(e.dataTransfer)) e.preventDefault();
    };
    const sale = () => {
      dentro = Math.max(0, dentro - 1);
      if (dentro === 0) setArrastrando(false);
    };
    const suelta = (e: DragEvent) => {
      dentro = 0;
      setArrastrando(false);
      if (!pareceImagen(e.dataTransfer)) return;
      e.preventDefault();
      recibir.current(e.dataTransfer!);
    };
    const pega = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      recibir.current(e.clipboardData!);
    };
    document.addEventListener("dragenter", entra);
    document.addEventListener("dragover", sobre);
    document.addEventListener("dragleave", sale);
    document.addEventListener("drop", suelta);
    document.addEventListener("paste", pega);
    return () => {
      document.removeEventListener("dragenter", entra);
      document.removeEventListener("dragover", sobre);
      document.removeEventListener("dragleave", sale);
      document.removeEventListener("drop", suelta);
      document.removeEventListener("paste", pega);
    };
  }, [puedeEscribir]);

  async function quitar() {
    if (!confirm("¿Quitar la foto del producto?")) return;
    const r = await guardarFotoProducto(id, null);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast("Foto quitada.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {foto ? (
        <button
          type="button"
          onClick={() => setAmpliada(true)}
          aria-label={`Ver la foto de ${nombre} más grande`}
          className={`overflow-hidden rounded-md border border-border ${anilloFoco}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt={nombre} className={`h-20 w-20 object-cover ${ocupado ? "opacity-50" : ""}`} />
        </button>
      ) : (
        <button
          type="button"
          disabled={!puedeEscribir || ocupado}
          onClick={() => archivo.current?.click()}
          aria-label={puedeEscribir ? "Subir la foto del producto" : "Sin foto"}
          className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-control text-center text-[10px] leading-tight text-muted-foreground enabled:hover:border-primario enabled:hover:text-primario ${anilloFoco}`}
        >
          <AdjuntoIcon className="h-5 w-5" aria-hidden="true" />
          {puedeEscribir && (ocupado ? "Subiendo…" : "Arrastra o pega")}
        </button>
      )}
      {puedeEscribir && (
        <span className="flex gap-2 text-xs">
          <input
            ref={archivo}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void subirArchivo(f);
            }}
            aria-label={`Foto de ${nombre}`}
            tabIndex={-1}
          />
          <button
            type="button"
            disabled={ocupado}
            onClick={() => archivo.current?.click()}
            className={`rounded font-medium text-primario hover:underline disabled:opacity-50 ${anilloFoco}`}
          >
            {subiendo ? "Subiendo…" : foto ? "Cambiar" : "Subir foto"}
          </button>
          {foto && !ocupado && (
            <button type="button" onClick={quitar} className={`rounded text-muted-foreground hover:text-destructive ${anilloFoco}`}>
              Quitar
            </button>
          )}
        </span>
      )}
      {ampliada && foto && <VisorImagen src={foto} alt={nombre} onClose={() => setAmpliada(false)} />}
      {arrastrando &&
        createPortal(
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primario bg-card px-10 py-8 text-center shadow-xl">
              <AdjuntoIcon className="h-8 w-8 text-primario" />
              <p className="m-0 text-base font-semibold">Suelta la imagen</p>
              <p className="m-0 text-sm text-muted-foreground">Será la foto de {nombre}</p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
