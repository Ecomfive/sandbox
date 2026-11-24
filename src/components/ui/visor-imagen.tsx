"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";

/** Gira una imagen (los grados son múltiplos de 90) y devuelve el archivo nuevo: PNG, o JPEG si el original lo era. null si el navegador no pudo. */
async function girarImagen(blob: Blob, grados: number): Promise<{ blob: Blob; tipo: "jpeg" | "png" } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const impar = grados % 180 !== 0;
    const lienzo = document.createElement("canvas");
    lienzo.width = impar ? bitmap.height : bitmap.width;
    lienzo.height = impar ? bitmap.width : bitmap.height;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    ctx.translate(lienzo.width / 2, lienzo.height / 2);
    ctx.rotate((grados * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const tipo = blob.type === "image/jpeg" ? "jpeg" : "png";
    const salida = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, `image/${tipo}`, 0.92));
    return salida ? { blob: salida, tipo } : null;
  } catch {
    return null;
  }
}

function Boton({ etiqueta, onClick, children, className = "" }: { etiqueta: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={etiqueta} title={etiqueta} onClick={onClick} className={`flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 ${anilloFoco} ${className}`}>
      {children}
    </button>
  );
}

const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/**
 * Visor de una imagen a tamaño grande, para cuando una miniatura (foto de producto, etc.) se ve demasiado
 * pequeña para distinguirla bien. Se abre con `src`; con `src` nulo no renderiza nada. Escape o clic afuera
 * cierran, igual que `Ventana`, pero este es más simple (sin foco atrapado) porque solo muestra una imagen,
 * no un formulario.
 *
 * Se puede **girar** (botones o la tecla R; la descarga sale ya girada) y, con `navegacion` (24 nov 2026, pedido de Dinora
 * para las fotos de las notas de un producto), pasar a la imagen anterior o siguiente con las flechas de la pantalla o las del teclado.
 */
export function VisorImagen({
  src,
  alt,
  onClose,
  pie,
  descargar,
  navegacion,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
  /** Un texto bajo la imagen (el pie de una foto de WhatsApp). */
  pie?: string | null;
  /** Con esto se ofrece «Descargar» bajo la imagen (el nombre con que se guarda). */
  descargar?: { href: string; nombre: string };
  /** Con varias imágenes: cuál es esta y cómo ir a las de al lado (da la vuelta al llegar al final). */
  navegacion?: { posicion: number; total: number; onAnterior: () => void; onSiguiente: () => void };
}) {
  const cerrarRef = useRef<HTMLButtonElement>(null);
  // El giro es de la imagen que se ve: al pasar a otra vuelve a empezar derecha.
  const [giro, setGiro] = useState({ src, grados: 0 });
  const grados = giro.src === src ? giro.grados : 0;
  const [bajando, setBajando] = useState(false);
  const girar = (delta: number) => setGiro({ src, grados: (((grados + delta) % 360) + 360) % 360 });
  const hayNavegacion = !!navegacion && navegacion.total > 1;

  // Los controladores de teclado leen siempre lo último sin volver a registrar el evento.
  const ultimo = useRef({ girar, navegacion: hayNavegacion ? navegacion : undefined });
  useEffect(() => {
    ultimo.current = { girar, navegacion: hayNavegacion ? navegacion : undefined };
  });

  useEffect(() => {
    if (!src) return;
    cerrarRef.current?.focus();
    // En `window` y en la fase de captura, y sin dejar que siga: así Escape cierra solo la foto y no también la ficha
    // (`Ventana`) que la abrió, que escucha Escape en `document`. Lo mismo con las flechas y la R.
    function alTeclear(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const u = ultimo.current;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft" && u.navegacion) {
        e.stopPropagation();
        e.preventDefault();
        u.navegacion.onAnterior();
      } else if (e.key === "ArrowRight" && u.navegacion) {
        e.stopPropagation();
        e.preventDefault();
        u.navegacion.onSiguiente();
      } else if (e.key.toLowerCase() === "r") {
        e.stopPropagation();
        u.girar(e.shiftKey ? -90 : 90);
      }
    }
    window.addEventListener("keydown", alTeclear, true);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear, true);
      document.body.style.overflow = overflowPrevio;
    };
  }, [src, onClose]);

  if (!src) return null;

  async function bajar() {
    if (!descargar || bajando) return;
    setBajando(true);
    try {
      const r = await fetch(descargar.href);
      if (!r.ok) throw new Error("No se pudo bajar");
      let blob = await r.blob();
      let nombre = descargar.nombre;
      if (grados !== 0) {
        const girada = await girarImagen(blob, grados);
        if (girada) {
          blob = girada.blob;
          const ext = girada.tipo === "jpeg" ? "jpg" : "png";
          nombre = /\.[A-Za-z0-9]{2,5}$/.test(nombre) ? nombre.replace(/\.[A-Za-z0-9]{2,5}$/, `.${ext}`) : `${nombre}.${ext}`;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      // Si el navegador no deja leer el archivo, se abre en otra pestaña para guardarlo desde ahí.
      window.open(descargar.href, "_blank", "noopener");
    } finally {
      setBajando(false);
    }
  }

  const impar = grados % 180 !== 0;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt || "Imagen ampliada"} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-6" onClick={onClose}>
      <button
        ref={cerrarRef}
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 ${anilloFoco}`}
      >
        <CerrarIcon className="h-5 w-5" />
      </button>

      {/* El escenario tiene un tamaño fijo para que girar la imagen no mueva los controles; un clic en lo vacío cierra. */}
      <div className="pointer-events-none relative h-[76vh] w-[90vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || ""}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `translate(-50%, -50%) rotate(${grados}deg)`,
            // Girada un cuarto de vuelta, lo que era ancho pasa a ser alto: los límites se cambian de eje para que siga cabiendo.
            maxWidth: impar ? "76vh" : "90vw",
            maxHeight: impar ? "90vw" : "76vh",
          }}
          className="pointer-events-auto absolute top-1/2 left-1/2 rounded-md object-contain shadow-2xl transition-transform duration-200 motion-reduce:transition-none"
        />
        {hayNavegacion && (
          <>
            <Boton etiqueta="Imagen anterior" onClick={navegacion!.onAnterior} className="pointer-events-auto absolute top-1/2 left-0 h-12 w-12 -translate-y-1/2 bg-black/45 hover:bg-black/65">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" {...trazo}>
                <path d="m15 5-7 7 7 7" />
              </svg>
            </Boton>
            <Boton etiqueta="Imagen siguiente" onClick={navegacion!.onSiguiente} className="pointer-events-auto absolute top-1/2 right-0 h-12 w-12 -translate-y-1/2 bg-black/45 hover:bg-black/65">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" {...trazo}>
                <path d="m9 5 7 7-7 7" />
              </svg>
            </Boton>
          </>
        )}
      </div>

      <div className="flex max-w-[90vw] flex-wrap items-center justify-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        {hayNavegacion && (
          <span className="px-2 tabular-nums" aria-live="polite">
            {navegacion!.posicion} de {navegacion!.total}
          </span>
        )}
        <Boton etiqueta="Girar a la izquierda (Mayús + R)" onClick={() => girar(-90)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" {...trazo}>
            <path d="M4 9V4m0 5h5M4.6 9a8 8 0 1 1-.6 4" />
          </svg>
        </Boton>
        <Boton etiqueta="Girar a la derecha (R)" onClick={() => girar(90)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" {...trazo}>
            <path d="M20 9V4m0 5h-5m4.4 0a8 8 0 1 0 .6 4" />
          </svg>
        </Boton>
        {descargar && (
          <button type="button" onClick={bajar} disabled={bajando} className={`flex h-10 flex-none items-center gap-2 rounded-full bg-white/15 px-3.5 font-medium hover:bg-white/25 disabled:opacity-60 ${anilloFoco}`}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" {...trazo}>
              <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" />
            </svg>
            {bajando ? "Bajando…" : "Descargar"}
          </button>
        )}
        {pie && <span className="min-w-0 max-w-[50vw] truncate px-2">{pie}</span>}
      </div>
    </div>,
    document.body,
  );
}
