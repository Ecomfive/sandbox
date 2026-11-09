"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Lo que expone `BarcodeDetector` del navegador (Chrome y Edge en Android y escritorio; Safari no lo tiene). */
interface Detector {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type ConstructorDetector = new (opciones?: { formats?: string[] }) => Detector;

const FORMATOS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "qr_code", "itf", "codabar"];

/**
 * Mejora 56: escanea con la cámara el código de barras o QR de una guía o una etiqueta y devuelve lo leído (para buscar la
 * orden). Usa el lector del navegador; si no lo tiene, lo dice y se escribe a mano.
 */
export function EscanearCodigo({ alLeer }: { alLeer: (texto: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const soportado = typeof window !== "undefined" && "BarcodeDetector" in window;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-sm hover:bg-muted"
        aria-label="Escanear código de la guía"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 9v6M10 9v6M13 9v6M16 9v6" />
        </svg>
        Escanear
      </button>
      {abierto &&
        createPortal(
          <Lector
            soportado={soportado}
            alLeer={(t) => {
              setAbierto(false);
              alLeer(t);
            }}
            alCerrar={() => setAbierto(false)}
          />,
          document.body,
        )}
    </>
  );
}

function Lector({ soportado, alLeer, alCerrar }: { soportado: boolean; alLeer: (t: string) => void; alCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(soportado ? null : "Este navegador no puede leer códigos. Usá Chrome en el celular o escribí la guía.");

  useEffect(() => {
    if (!soportado) return;
    let vivo = true;
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    const Ctor = (window as unknown as { BarcodeDetector: ConstructorDetector }).BarcodeDetector;
    const detector = new Ctor({ formats: FORMATOS });
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        if (!vivo) return s.getTracks().forEach((t) => t.stop());
        flujo = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        const mirar = async () => {
          if (!vivo || !video.current) return;
          try {
            const r = await detector.detect(video.current);
            const texto = r.find((x) => x.rawValue?.trim())?.rawValue.trim();
            if (texto) return alLeer(texto.slice(0, 120));
          } catch {
            /* un cuadro que no se pudo leer: se sigue con el próximo */
          }
          cuadro = requestAnimationFrame(mirar);
        };
        cuadro = requestAnimationFrame(mirar);
      })
      .catch(() => setError("No se pudo abrir la cámara. Revisá el permiso del navegador."));
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", tecla);
    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
      window.removeEventListener("keydown", tecla);
    };
  }, [soportado, alLeer, alCerrar]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Escanear código" className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onClick={alCerrar}>
      <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium">Apuntá la cámara al código de la guía o de la etiqueta</p>
        {error ? <p role="alert" className="text-sm">{error}</p> : <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-lg bg-black object-cover" />}
        <button type="button" onClick={alCerrar} className="self-end rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
          Cerrar
        </button>
      </div>
    </div>
  );
}
