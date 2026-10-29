"use client";

/* eslint-disable @next/next/no-img-element -- las vistas de GIF y stickers son direcciones de GIPHY o firmadas del almacén; no pasan por el optimizador de imágenes */
import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { supabase } from "@/lib/supabase/client";
import { GRUPOS_EMOJIS } from "@/lib/whatsapp/emojis";
import type { GifVista } from "@/lib/whatsapp/giphy";
import { borrarSticker, buscarGifs, crearSticker, enviarGif, enviarSticker, enviarStickerGiphy, listarStickers, prepararSticker, type StickerEquipo } from "./expresiones-actions";

type Pestana = "emojis" | "gif" | "stickers";
type OrigenSticker = "equipo" | "giphy";

const botonPestana = (activa: boolean) =>
  `flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold ${activa ? "bg-[var(--wa-acento)] text-[var(--wa-acento-texto)]" : "text-[var(--wa-sec)] hover:bg-[var(--wa-hover)]"} ${anilloFoco}`;
const celda = `flex items-center justify-center overflow-hidden rounded-md bg-[var(--wa-fondo)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;

/**
 * Emojis, GIF y stickers (29 oct 2026), como el cajón de WhatsApp: un botón con carita junto al cuadro de texto abre una bandeja con tres pestañas. Los emojis se escriben en el
 * mensaje; un GIF o un sticker se manda al tocarlo. Los GIF y los stickers de GIPHY necesitan la clave `GIPHY_API_KEY` en el servidor; los stickers del equipo, no.
 */
export function Expresiones({
  conversacionId,
  deshabilitado,
  alEmoji,
  alEnviado,
  alError,
}: {
  conversacionId: string;
  deshabilitado: boolean;
  alEmoji: (emoji: string) => void;
  alEnviado: () => void;
  alError: (mensaje: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("emojis");
  const [grupo, setGrupo] = useState(GRUPOS_EMOJIS[0].id);
  const [origen, setOrigen] = useState<OrigenSticker>("equipo");
  const [consulta, setConsulta] = useState("");
  const [gifs, setGifs] = useState<GifVista[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [propios, setPropios] = useState<StickerEquipo[] | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedido = useRef(0);

  // Escape o un clic fuera cierran la bandeja y el foco vuelve al botón.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAbierto(false);
      boton.current?.focus();
    };
    const alPulsar = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alPulsar);
    };
  }, [abierto]);

  async function cargarGifs(texto: string, clase: "gif" | "sticker") {
    const mio = ++pedido.current;
    setCargando(true);
    setAviso(null);
    const r = await buscarGifs(texto, clase).catch(() => ({ error: "No se pudo buscar. Inténtalo de nuevo." }) as { error: string; sinClave?: true });
    if (mio !== pedido.current) return;
    setCargando(false);
    if ("error" in r) {
      setGifs([]);
      setAviso(r.error);
      return;
    }
    setGifs(r.gifs);
    if (r.gifs.length === 0) setAviso("No hay resultados. Prueba con otra palabra.");
  }

  async function cargarPropios() {
    const r = await listarStickers().catch(() => ({ error: "No se pudo abrir la lista." }) as { error: string });
    if ("error" in r) return setAviso(r.error);
    setPropios(r.stickers);
    setAviso(r.falta ? "Falta correr la migración 0180 (stickers del equipo)." : null);
  }

  function elegirPestana(p: Pestana) {
    setPestana(p);
    setAviso(null);
    setConsulta("");
    if (p === "gif") {
      setGifs(null);
      void cargarGifs("", "gif");
    }
    if (p === "stickers") {
      if (origen === "equipo") {
        if (!propios) void cargarPropios();
      } else {
        setGifs(null);
        void cargarGifs("", "sticker");
      }
    }
  }

  function elegirOrigen(o: OrigenSticker) {
    setOrigen(o);
    setAviso(null);
    setConsulta("");
    if (o === "equipo") {
      if (!propios) void cargarPropios();
    } else {
      setGifs(null);
      void cargarGifs("", "sticker");
    }
  }

  function alEscribir(texto: string) {
    setConsulta(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void cargarGifs(texto, pestana === "gif" ? "gif" : "sticker"), 400);
  }

  function abrir() {
    if (abierto) return setAbierto(false);
    setAbierto(true);
  }

  /** Manda lo tocado (un GIF o un sticker) y cierra la bandeja si salió bien. */
  async function mandar(clave: string, hacer: () => Promise<{ ok: true } | { error: string }>) {
    if (enviando) return;
    setEnviando(clave);
    const r = await hacer().catch(() => ({ error: "No se pudo mandar. Inténtalo de nuevo." }));
    setEnviando(null);
    if ("error" in r) return alError(r.error);
    setAbierto(false);
    alEnviado();
  }

  async function subirSticker(archivo: File) {
    setSubiendo(true);
    setAviso(null);
    try {
      const permiso = await prepararSticker(archivo.size).catch(() => ({ error: "No se pudo preparar la subida." }));
      if ("error" in permiso) return setAviso(permiso.error);
      const { error } = await supabase.storage.from("whatsapp-importados").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type || undefined });
      if (error) return setAviso("No se pudo subir la imagen. Revisa tu conexión e inténtalo de nuevo.");
      const r = await crearSticker(permiso.ruta, archivo.name).catch(() => ({ error: "No se pudo crear el sticker." }));
      if ("error" in r) return setAviso(r.error);
      setPropios((l) => [r.sticker, ...(l ?? [])]);
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(s: StickerEquipo) {
    const r = await borrarSticker(s.id).catch(() => ({ error: "No se pudo quitar." }));
    if ("error" in r) return setAviso(r.error);
    setPropios((l) => (l ?? []).filter((x) => x.id !== s.id));
  }

  const emojis = GRUPOS_EMOJIS.find((g) => g.id === grupo) ?? GRUPOS_EMOJIS[0];

  return (
    <div ref={raiz} className="flex-none">
      <button
        ref={boton}
        type="button"
        disabled={deshabilitado}
        onClick={abrir}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label="Emojis, GIF y stickers"
        title="Emojis, GIF y stickers"
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-full hover:bg-[var(--wa-hover)] disabled:opacity-50 ${abierto ? "bg-[var(--wa-hover)] text-[var(--wa-texto)]" : "text-[var(--wa-sec)]"} ${anilloFoco}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14a4.5 4.5 0 0 0 7 0" />
          <path d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      {abierto && (
        <div role="dialog" aria-label="Emojis, GIF y stickers" className="absolute bottom-full left-3 z-30 mb-1 flex h-[22rem] w-[min(22rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-[var(--wa-borde)] bg-[var(--wa-panel)] shadow-lg">
          <div role="tablist" aria-label="Qué mandar" className="flex gap-1 border-b border-[var(--wa-borde)] p-2">
            {(
              [
                ["emojis", "Emojis"],
                ["gif", "GIF"],
                ["stickers", "Stickers"],
              ] as const
            ).map(([id, etiqueta]) => (
              <button key={id} type="button" role="tab" aria-selected={pestana === id} onClick={() => elegirPestana(id)} className={botonPestana(pestana === id)}>
                {etiqueta}
              </button>
            ))}
          </div>

          {pestana === "emojis" && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <p className="m-0 px-1 pb-1 text-[12px] font-semibold text-[var(--wa-sec)]">{emojis.etiqueta}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {emojis.emojis.map((e, i) => (
                    <button key={`${e}-${i}`} type="button" onClick={() => alEmoji(e)} aria-label={e} className={`${celda} h-9 text-[22px] leading-none`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex border-t border-[var(--wa-borde)] p-1">
                {GRUPOS_EMOJIS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={g.id === grupo}
                    aria-label={g.etiqueta}
                    title={g.etiqueta}
                    onClick={() => setGrupo(g.id)}
                    className={`flex h-9 flex-1 items-center justify-center rounded-md text-[18px] ${g.id === grupo ? "bg-[var(--wa-hover)]" : "opacity-70 hover:opacity-100"} ${anilloFoco}`}
                  >
                    {g.icono}
                  </button>
                ))}
              </div>
            </>
          )}

          {pestana === "stickers" && (
            <div role="group" aria-label="De dónde" className="flex gap-1 px-2 pt-2">
              <button type="button" aria-pressed={origen === "equipo"} onClick={() => elegirOrigen("equipo")} className={botonPestana(origen === "equipo")}>
                Del equipo
              </button>
              <button type="button" aria-pressed={origen === "giphy"} onClick={() => elegirOrigen("giphy")} className={botonPestana(origen === "giphy")}>
                GIPHY
              </button>
            </div>
          )}

          {(pestana === "gif" || (pestana === "stickers" && origen === "giphy")) && (
            <>
              <label className="flex px-2 pt-2">
                <span className="sr-only">{pestana === "gif" ? "Buscar un GIF" : "Buscar un sticker"}</span>
                <input
                  ref={entrada}
                  type="search"
                  value={consulta}
                  onChange={(e) => alEscribir(e.target.value)}
                  placeholder={pestana === "gif" ? "Buscar GIF" : "Buscar stickers"}
                  className={`h-9 w-full rounded-lg border-0 bg-[var(--wa-fondo)] px-3 text-[14px] text-[var(--wa-texto)] outline-none placeholder:text-[var(--wa-sec)] focus-visible:ring-2 focus-visible:ring-[var(--wa-acento)]`}
                />
              </label>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {cargando && <p className="m-0 p-2 text-[13px] text-[var(--wa-sec)]">Buscando…</p>}
                {!cargando && aviso && <p className="m-0 p-2 text-[13px] text-[var(--wa-sec)]">{aviso}</p>}
                <div className="grid grid-cols-3 gap-1">
                  {(gifs ?? []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      disabled={enviando !== null}
                      onClick={() => void mandar(g.id, () => (pestana === "gif" ? enviarGif(conversacionId, g.id) : enviarStickerGiphy(conversacionId, g.id)))}
                      aria-label={g.titulo ? `Mandar: ${g.titulo}` : pestana === "gif" ? "Mandar este GIF" : "Mandar este sticker"}
                      className={`${celda} aspect-square ${enviando === g.id ? "animate-pulse" : ""}`}
                    >
                      <img src={g.vista} alt="" loading="lazy" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
              <p className="m-0 border-t border-[var(--wa-borde)] px-3 py-1 text-[11px] text-[var(--wa-sec)]">Con tecnología de GIPHY</p>
            </>
          )}

          {pestana === "stickers" && origen === "equipo" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <input
                ref={entrada}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                tabIndex={-1}
                aria-label="Elegir la imagen del sticker"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void subirSticker(f);
                }}
              />
              <div className="grid grid-cols-4 gap-1">
                <button type="button" disabled={subiendo} onClick={() => entrada.current?.click()} aria-label="Agregar un sticker desde una imagen" title="Agregar un sticker" className={`${celda} aspect-square flex-col text-[var(--wa-sec)]`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="text-[11px]">{subiendo ? "Subiendo…" : "Agregar"}</span>
                </button>
                {(propios ?? []).map((s) => (
                  <div key={s.id} className="group relative aspect-square">
                    <button
                      type="button"
                      disabled={enviando !== null}
                      onClick={() => void mandar(s.id, () => enviarSticker(conversacionId, s.id))}
                      aria-label={`Mandar el sticker ${s.nombre}`}
                      className={`${celda} h-full w-full ${enviando === s.id ? "animate-pulse" : ""}`}
                    >
                      {s.vista ? <img src={s.vista} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="text-[11px]">{s.nombre}</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => void quitar(s)}
                      aria-label={`Quitar el sticker ${s.nombre} de la lista`}
                      title="Quitar de la lista"
                      className={`absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-sec)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${anilloFoco}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              {aviso && <p className="m-0 p-2 text-[13px] text-[var(--wa-sec)]">{aviso}</p>}
              {propios && propios.length === 0 && !aviso && <p className="m-0 p-2 text-[13px] text-[var(--wa-sec)]">Todavía no hay stickers del equipo. Agrega uno desde una imagen.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
