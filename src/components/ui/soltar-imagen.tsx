"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AdjuntoIcon } from "@/lib/nav-icons";

// Soltar o pegar una imagen (del escritorio o de otra página de internet) en una ficha: lo usan la foto del producto y la
// foto real de una compra.

/** La dirección de la imagen que se arrastró desde otra página (la lista de enlaces, el `<img>` del HTML o el texto). */
export function urlArrastrada(dt: DataTransfer): string | null {
  const html = dt.getData("text/html");
  const deHtml = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src") : null;
  const lista = dt
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((l) => l && !l.startsWith("#"));
  const texto = dt.getData("text/plain").trim();
  return deHtml || lista || (/^(https?:|data:image\/)/.test(texto) ? texto : null) || null;
}

/** Si lo que se arrastra puede ser una imagen (un archivo o un enlace de otra página; un texto seleccionado no cuenta). */
export const pareceImagen = (dt: DataTransfer | null) => !!dt && (dt.types.includes("Files") || dt.types.includes("text/uri-list"));

/** Lo que trae lo soltado o pegado: un archivo de imagen, o la dirección de una imagen de internet. */
export type Soltado = { archivo: File } | { url: string } | null;

export async function leerSoltado(dt: DataTransfer): Promise<Soltado> {
  const f = [...dt.files].find((x) => x.type.startsWith("image/"));
  if (f) return { archivo: f };
  const url = urlArrastrada(dt);
  if (!url) return null;
  if (url.startsWith("data:image/")) {
    const blob = await (await fetch(url)).blob();
    return { archivo: new File([blob], "imagen", { type: blob.type }) };
  }
  return { url };
}

/**
 * Mientras `activo`, soltar una imagen en cualquier parte de la página o pegarla (Ctrl+V) la entrega a `alRecibir`. Un
 * soltar que ya atendió otro elemento (el campo de comentario, que también recibe archivos) no se toma. Devuelve si se está
 * arrastrando algo encima, para mostrar el aviso.
 */
export function useSoltarImagen(activo: boolean, alRecibir: (dt: DataTransfer) => void): boolean {
  const [arrastrando, setArrastrando] = useState(false);
  const recibir = useRef(alRecibir);
  useEffect(() => {
    recibir.current = alRecibir;
  });
  useEffect(() => {
    if (!activo) return;
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
      if (e.defaultPrevented || !pareceImagen(e.dataTransfer)) return;
      e.preventDefault();
      recibir.current(e.dataTransfer!);
    };
    const pega = (e: ClipboardEvent) => {
      if (e.defaultPrevented || ![...(e.clipboardData?.files ?? [])].some((x) => x.type.startsWith("image/"))) return;
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
  }, [activo]);
  return arrastrando;
}

/** El aviso grande «Suelta la imagen» mientras se arrastra encima. */
export function AvisoSoltar({ visible, detalle }: { visible: boolean; detalle: string }) {
  if (!visible) return null;
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primario bg-card px-10 py-8 text-center shadow-xl">
        <AdjuntoIcon className="h-8 w-8 text-primario" />
        <p className="m-0 text-base font-semibold">Suelta la imagen</p>
        <p className="m-0 text-sm text-muted-foreground">{detalle}</p>
      </div>
    </div>,
    document.body,
  );
}
