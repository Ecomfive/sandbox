"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { aMono, FRECUENCIA_VOZ, MAX_SEGUNDOS_VOZ, pcmAMp3 } from "@/lib/whatsapp/voz";

type Fase = "pidiendo" | "grabando" | "preparando" | "error";

const TIPOS_GRABABLES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const sinSuscripcion = () => () => {};
const puedeGrabarAhora = () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Decodifica el audio grabado (WebM o MP4) y lo vuelve un MP3 de una sola voz, el formato que WhatsApp acepta. */
async function grabacionAMp3(grabacion: Blob): Promise<File> {
  const contexto = new AudioContext({ sampleRate: FRECUENCIA_VOZ });
  try {
    const audio = await contexto.decodeAudioData(await grabacion.arrayBuffer());
    const canales = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const mp3 = await pcmAMp3(aMono(canales), audio.sampleRate);
    const ahora = new Date();
    const marca = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, "0")}${String(ahora.getDate()).padStart(2, "0")}-${String(ahora.getHours()).padStart(2, "0")}${String(ahora.getMinutes()).padStart(2, "0")}`;
    return new File([new Uint8Array(mp3)], `nota-de-voz-${marca}.mp3`, { type: "audio/mpeg" });
  } finally {
    void contexto.close();
  }
}

/**
 * «Grabar un audio» (29 oct 2026): un botón de micrófono junto al clip. Pide el micrófono, graba con una ventana que muestra el tiempo, y al detener convierte la grabación a MP3 en
 * el navegador (WhatsApp no acepta el WebM que graba Chrome) y se la pasa a «Mandar un archivo», donde se escucha antes de enviarla. Cancelar o cerrar suelta el micrófono.
 */
export function GrabarVoz({ deshabilitado, alGrabado }: { deshabilitado: boolean; alGrabado: (archivo: File) => void }) {
  const disponible = useSyncExternalStore(sinSuscripcion, puedeGrabarAhora, () => false);
  const [fase, setFase] = useState<Fase | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);

  const soltar = useCallback(() => {
    if (cronometro.current) clearInterval(cronometro.current);
    cronometro.current = null;
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  }, []);

  const cancelar = useCallback(() => {
    const g = grabadora.current;
    grabadora.current = null;
    if (g && g.state !== "inactive") {
      g.onstop = null;
      g.ondataavailable = null;
      g.stop();
    }
    soltar();
    trozos.current = [];
    setFase(null);
    setError(null);
  }, [soltar]);

  // Si el cuadro se desmonta (se cambia de chat) con el micrófono abierto, se suelta.
  useEffect(() => cancelar, [cancelar]);

  const detener = useCallback(() => {
    const g = grabadora.current;
    if (!g || g.state === "inactive") return;
    g.onstop = async () => {
      const tipo = g.mimeType || "audio/webm";
      const grabado = new Blob(trozos.current, { type: tipo });
      grabadora.current = null;
      soltar();
      trozos.current = [];
      setFase("preparando");
      try {
        alGrabado(await grabacionAMp3(grabado));
        setFase(null);
      } catch {
        setError("No se pudo preparar el audio. Inténtalo de nuevo.");
        setFase("error");
      }
    };
    g.stop();
  }, [alGrabado, soltar]);

  async function iniciar() {
    setError(null);
    setSegundos(0);
    setFase("pidiendo");
    let micro: MediaStream;
    try {
      micro = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("El navegador no dejó usar el micrófono. Permítelo con el candado de la barra de direcciones y vuelve a intentarlo.");
      setFase("error");
      return;
    }
    flujo.current = micro;
    trozos.current = [];
    const tipo = TIPOS_GRABABLES.find((t) => MediaRecorder.isTypeSupported(t));
    let g: MediaRecorder;
    try {
      g = new MediaRecorder(micro, tipo ? { mimeType: tipo } : undefined);
    } catch {
      soltar();
      setError("Este navegador no puede grabar audio.");
      setFase("error");
      return;
    }
    g.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.current.push(e.data);
    };
    grabadora.current = g;
    g.start(250);
    const inicio = Date.now();
    cronometro.current = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 250);
    setFase("grabando");
  }

  // Una nota de voz no pasa de MAX_SEGUNDOS_VOZ: al llegar, se detiene sola.
  useEffect(() => {
    if (fase === "grabando" && segundos >= MAX_SEGUNDOS_VOZ) detener();
  }, [fase, segundos, detener]);

  if (!disponible) return null;
  return (
    <>
      <button
        type="button"
        disabled={deshabilitado || fase !== null}
        onClick={() => void iniciar()}
        aria-label="Grabar un audio"
        title="Grabar un audio"
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco} mb-px`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      {fase && (
        <Ventana abierto alCerrar={fase === "preparando" ? () => undefined : cancelar} titulo="Grabar un audio" ancho="sm">
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            {fase === "pidiendo" && <p className="m-0 text-sm text-muted-foreground">Esperando el permiso del micrófono…</p>}
            {fase === "grabando" && (
              <>
                <div className="flex items-center gap-3" role="status" aria-live="off">
                  <span aria-hidden="true" className="h-3 w-3 rounded-full bg-destructive motion-safe:animate-pulse" />
                  <span className="text-3xl font-semibold tabular-nums">{reloj(segundos)}</span>
                </div>
                <p className="m-0 text-sm text-muted-foreground">Grabando. Cuando termines, pulsa «Detener»: podrás escucharlo antes de mandarlo.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={cancelar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                    Cancelar
                  </button>
                  <button type="button" onClick={detener} data-enfocar className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 ${anilloFoco}`}>
                    Detener
                  </button>
                </div>
              </>
            )}
            {fase === "preparando" && <p className="m-0 text-sm text-muted-foreground">Preparando el audio…</p>}
            {fase === "error" && (
              <>
                <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
                <button type="button" onClick={cancelar} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                  Cerrar
                </button>
              </>
            )}
          </div>
        </Ventana>
      )}
    </>
  );
}
