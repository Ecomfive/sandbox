"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { comprimirImagen } from "@/app/(app)/publicaciones-dropi/reglas/comprimir-imagen";
import { CamaraIcon } from "@/lib/nav-icons";
import { buscarPorImagen, type RespuestaBusquedaImagen } from "@/lib/imagen/buscar-actions";
import { etiquetaAmbito, ETIQUETA_NIVEL, type Ambito } from "@/lib/imagen/buscar";

const TONO_VEREDICTO: Record<"mismo" | "parecido" | "distinto", Tone> = { mismo: "success", parecido: "warning", distinto: "neutral" };
const TEXTO_VEREDICTO = { mismo: "Es el mismo producto", parecido: "Parecido", distinto: "Distinto" } as const;

/**
 * «Buscar por imagen» (26 oct 2026): la ventana de la cámara del buscador de cada lista. Se pega (Ctrl+V), se arrastra o se sube una foto; el sistema la busca
 * en las partes que la persona puede abrir (la huella de la foto y, con la IA, una comparación de las fotos de los mejores candidatos). Si la lista que la abrió
 * puede filtrarse por imagen (`alFiltrar`), un botón deja en ella solo lo encontrado. La imagen se reduce en el navegador y no se guarda.
 */
export function VentanaBuscarImagen({
  abierta,
  alCerrar,
  ambitoPropio,
  alFiltrar,
}: {
  abierta: boolean;
  alCerrar: () => void;
  /** La parte del sistema de la lista que la abrió: sus coincidencias se pueden aplicar como filtro. */
  ambitoPropio?: Ambito;
  /** Recibe los ids encontrados en `ambitoPropio` (de más a menos parecido). */
  alFiltrar?: (ids: string[]) => void;
}) {
  const [imagen, setImagen] = useState<string | null>(null);
  const [conIA, setConIA] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaBusquedaImagen | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  // Cada búsqueda lleva un número: si llega la respuesta de una anterior, se ignora.
  const turno = useRef(0);

  const buscar = useCallback(async (dataUrl: string, ia: boolean) => {
    const mio = ++turno.current;
    setBuscando(true);
    setError(null);
    setRespuesta(null);
    const r = await buscarPorImagen(dataUrl, { conIA: ia }).catch(() => ({ error: "No se pudo buscar. Inténtalo de nuevo." }));
    if (mio !== turno.current) return;
    setBuscando(false);
    if ("error" in r) setError(r.error);
    else setRespuesta(r);
  }, []);

  const recibir = useCallback(
    async (archivo: File | null | undefined) => {
      if (!archivo) return;
      setError(null);
      try {
        const dataUrl = await comprimirImagen(archivo);
        setImagen(dataUrl);
        void buscar(dataUrl, conIA);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo leer la imagen.");
      }
    },
    [buscar, conIA],
  );

  // Pegar una captura o una foto copiada desde cualquier parte de la ventana abierta.
  useEffect(() => {
    if (!abierta) return;
    function alPegar(e: ClipboardEvent) {
      const archivo = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (archivo) {
        e.preventDefault();
        void recibir(archivo);
      }
    }
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [abierta, recibir]);

  const propias = respuesta && ambitoPropio ? respuesta.coincidencias.filter((c) => c.ambito === ambitoPropio && c.veredicto !== "distinto") : [];

  return (
    <Ventana abierto={abierta} alCerrar={alCerrar} titulo="Buscar por imagen" ancho="md">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            void recibir(e.dataTransfer.files?.[0]);
          }}
          className={`flex min-h-32 items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 ${arrastrando ? "border-foreground bg-accent" : "border-border-control bg-card"}`}
        >
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt="La foto buscada" className="h-24 w-24 shrink-0 rounded-md border border-border bg-white object-contain" />
          ) : (
            <CamaraIcon aria-hidden="true" className="h-8 w-8 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <p className="m-0 font-medium">{imagen ? "Otra foto: pégala, arrástrala o súbela" : "Pega una foto (Ctrl+V), arrástrala aquí o súbela"}</p>
            <button type="button" onClick={() => entrada.current?.click()} className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              Elegir una foto
            </button>
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Elegir una foto para buscar"
              className="sr-only"
              onChange={(e) => {
                void recibir(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={conIA}
            onChange={(e) => {
              setConIA(e.target.checked);
              if (imagen) void buscar(imagen, e.target.checked);
            }}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Confirmar con IA <span className="text-muted-foreground">(reconoce el mismo producto aunque la foto sea distinta)</span>
          </span>
        </label>

        {buscando && (
          <p role="status" className="m-0 text-muted-foreground">
            Buscando{conIA ? " y comparando las fotos con IA" : ""}…
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        )}
        {respuesta && (
          <div className="flex flex-col gap-3">
            {respuesta.descripcion && (
              <p className="m-0 text-muted-foreground">
                La IA ve: <span className="font-medium text-foreground">{respuesta.descripcion}</span>
              </p>
            )}
            {respuesta.aviso && <p className="m-0 text-warning">{respuesta.aviso}</p>}
            {respuesta.coincidencias.length === 0 ? (
              <p className="m-0 font-medium">No se encontró nada parecido en {respuesta.ambitos.map(etiquetaAmbito).join(", ")}.</p>
            ) : (
              <>
                {alFiltrar && ambitoPropio && (
                  <button
                    type="button"
                    disabled={propias.length === 0}
                    onClick={() => {
                      alFiltrar(propias.map((c) => c.id));
                      alCerrar();
                    }}
                    className={`inline-flex min-h-10 w-fit items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}
                  >
                    {propias.length ? `Filtrar esta lista (${propias.length})` : "Nada para filtrar en esta lista"}
                  </button>
                )}
                <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
                  {respuesta.coincidencias.map((c) => (
                    <li key={`${c.ambito}:${c.id}`}>
                      <Link href={c.href} className={`flex items-start gap-3 px-3 py-2.5 hover:bg-muted ${anilloFoco} ${c.veredicto === "distinto" ? "opacity-60" : ""}`}>
                        {c.foto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.foto} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-md border border-border bg-white object-contain" />
                        ) : (
                          <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate font-medium">{c.nombre}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{etiquetaAmbito(c.ambito)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{c.detalle}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {c.veredicto ? <Badge tone={TONO_VEREDICTO[c.veredicto]}>{TEXTO_VEREDICTO[c.veredicto]}</Badge> : null}
                            {c.nivel ? <Badge tone={c.nivel === "misma" ? "success" : "neutral"}>{ETIQUETA_NIVEL[c.nivel]}</Badge> : <Badge tone="neutral">Por el nombre</Badge>}
                          </span>
                          {c.motivo && <span className="text-xs text-muted-foreground">{c.motivo}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Ventana>
  );
}
