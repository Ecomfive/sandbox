"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { CerrarIcon, CheckIcon, EnlaceIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, InstagramIcon, PersonaIcon } from "@/lib/nav-icons";
import { actualizarCaptura, obtenerHistorialCaptura, urlVideoCaptura } from "./actions";
import { colorEstadoInstagram, colorTipoInstagram, ESTADOS_INSTAGRAM, etiquetaEstadoInstagram, etiquetaTipoInstagram, numeroInstagram, quienEnvio, type FilaInstagram } from "./def-instagram";

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 break-words text-sm">{children}</dd>
    </div>
  );
}

// Las cifras que se completan a mano: el nombre del campo en la base (`metricas`), su etiqueta y de dónde se lee.
const CIFRAS = [
  ["like_count", "Me gusta", "megusta"],
  ["comments_count", "Comentarios", "comentarios"],
  ["view_count", "Vistas", "vistas"],
  ["share_count", "Compartidos", "compartidos"],
] as const;
const megas = (bytes: number | null) => (bytes === null ? "" : ` · ${(bytes / 1_048_576).toLocaleString("es-CR", { maximumFractionDigits: 1 })} MB`);

/** El video de la captura, con su enlace firmado (el bucket es privado); sin video dice por qué, si se sabe. */
function VideoCaptura({ fila }: { fila: FilaInstagram }) {
  const [estado, setEstado] = useState<{ id: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!fila.tieneVideo) return;
    let vigente = true;
    urlVideoCaptura(fila.id)
      .then((r) => vigente && setEstado({ id: fila.id, ...("url" in r ? { url: r.url } : { error: r.error }) }))
      .catch(() => vigente && setEstado({ id: fila.id, error: "No se pudo abrir el video." }));
    return () => {
      vigente = false;
    };
  }, [fila.id, fila.tieneVideo]);

  const actual = estado?.id === fila.id ? estado : null;
  if (!fila.tieneVideo) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
        <p className="m-0">{fila.videoError ? `Sin video: ${fila.videoError}` : "Esta captura no trae el archivo de video."}</p>
        {fila.enlace && (
          <a href={fila.enlace} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted ${anilloFoco}`}>
            <EnlaceIcon className="h-4 w-4" />
            Ver en Instagram
          </a>
        )}
      </div>
    );
  }
  if (actual?.error) {
    return (
      <p role="alert" className="m-0 rounded-lg border border-border bg-muted px-3 py-6 text-center text-sm text-destructive">
        {actual.error}
      </p>
    );
  }
  if (!actual?.url) return <p className="m-0 rounded-lg border border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">Cargando el video…</p>;
  return (
    <video key={actual.url} src={actual.url} controls playsInline preload="metadata" aria-label={`Video de ${numeroInstagram(fila.numero)}`} className="max-h-[30rem] w-full rounded-lg bg-black" />
  );
}

/**
 * La ficha de una captura de Instagram: el panel a la derecha que se abre al pulsarla (como `FichaSeleccion`). Arriba, el
 * video; luego lo que trajo Meta (quién lo envió, el copy, el enlace, las métricas) que no se edita; y lo que se completa a
 * mano (estado, página de destino y notas), con «Guardar cambios» solo si hay cambios. La actividad va al final.
 */
export function FichaInstagram({
  fila,
  orden,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  fila: FilaInstagram | undefined;
  orden: string[];
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [modificadoId, setModificadoId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();
  const raiz = useRef<HTMLFormElement>(null);
  const modificado = !!fila && modificadoId === fila.id;

  const puedeDescartar = () => !modificado || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  function cerrar() {
    if (guardando || !puedeDescartar()) return;
    setModificadoId(null);
    setError(null);
    alCerrar();
  }
  function irA(id: string) {
    if (guardando || !puedeDescartar()) return;
    setModificadoId(null);
    setError(null);
    alIr(id);
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const r = await actualizarCaptura(datos);
        if (r?.error) setError(r.error);
        else {
          setModificadoId(null);
          setVersionHistorial((v) => v + 1);
          mostrarToast("Cambios guardados");
        }
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  const indice = fila ? orden.indexOf(fila.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  return (
    <Ventana
      abierto={!!fila}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        fila && (
          <>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">{numeroInstagram(fila.numero)}</span>
            <span className="text-lg font-semibold">Captura de Instagram</span>
            <Badge color={colorTipoInstagram(fila.tipo)}>{etiquetaTipoInstagram(fila.tipo)}</Badge>
            <Badge color={colorEstadoInstagram(fila.estado)}>{etiquetaEstadoInstagram(fila.estado)}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Captura anterior" icono={FlechaArribaIcon} activo={!!anterior && !guardando} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Captura siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !guardando} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {fila && (
        <div className="flex flex-1 flex-col">
          <form
            ref={raiz}
            key={`${fila.id}-${version}`}
            onSubmit={guardar}
            onChange={() => setModificadoId(fila.id)}
            aria-busy={guardando}
            className="flex flex-1 flex-col"
          >
            <input type="hidden" name="id" value={fila.id} />
            {puedeEscribir && (modificado || error) && (
              <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
                {modificado && (
                  <div className="flex flex-wrap gap-2">
                    <BotonAccion type="submit" tono="oscuro" icono={CheckIcon} disabled={guardando}>
                      {guardando ? "Guardando..." : "Guardar cambios"}
                    </BotonAccion>
                    <BotonAccion
                      icono={CerrarIcon}
                      disabled={guardando}
                      onClick={() => {
                        setModificadoId(null);
                        setError(null);
                        setVersion((v) => v + 1);
                      }}
                    >
                      Cancelar
                    </BotonAccion>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-1 flex-col divide-y divide-border p-5">
              <Seccion icono={InstagramIcon} titulo="Video">
                <VideoCaptura fila={fila} />
                {fila.tieneVideo && fila.videoBytes !== null && <p className="m-0 text-xs text-muted-foreground">{megas(fila.videoBytes).slice(3)}</p>}
              </Seccion>

              <Seccion icono={PersonaIcon} titulo="Quién lo compartió">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Dato etiqueta="Enviado por">{quienEnvio(fila)}</Dato>
                  <Dato etiqueta="Recibido">{formatearFechaHora(fila.recibidoEn)}</Dato>
                  <Dato etiqueta="Mensaje que escribió">{fila.textoMensaje ?? "—"}</Dato>
                </dl>
              </Seccion>

              <Seccion icono={EnlaceIcon} titulo="Lo que trajo Instagram">
                <dl className="flex flex-col gap-3">
                  <Dato etiqueta="Copy">
                    <span className="whitespace-pre-wrap">{fila.titulo ?? "—"}</span>
                  </Dato>
                  <Dato etiqueta="Enlace de Instagram">
                    {fila.enlace ? (
                      <a href={fila.enlace} target="_blank" rel="noopener noreferrer" className={`break-all text-primario hover:underline ${anilloFoco}`}>
                        {fila.enlace}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Dato>
                </dl>
              </Seccion>

              <Seccion icono={EstadoIcon} titulo="Cifras de la publicación">
                <fieldset disabled={!puedeEscribir || guardando} className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0 sm:grid-cols-3">
                  <Campo etiqueta="Cuenta del video" id="campo-autor-instagram" className="col-span-2 sm:col-span-3">
                    <input id="campo-autor-instagram" type="text" name="autor_usuario" maxLength={100} defaultValue={fila.autorUsuario ?? ""} placeholder="Ej: tienda.ejemplo" className={fieldClass} />
                  </Campo>
                  <Campo etiqueta="Fecha de publicación" id="campo-fecha-instagram" className="col-span-2 sm:col-span-3">
                    <input id="campo-fecha-instagram" type="date" name="fecha_publicacion" defaultValue={fila.fechaPublicacion ?? ""} className={fieldClass} />
                  </Campo>
                  {CIFRAS.map(([nombre, etiqueta, valor]) => (
                    <Campo key={nombre} etiqueta={etiqueta} id={`campo-${nombre}-instagram`}>
                      <input id={`campo-${nombre}-instagram`} type="number" inputMode="numeric" min="0" step="1" name={nombre} defaultValue={fila[valor] ?? ""} placeholder="Ej: 1200" className={`${fieldClass} tabular-nums`} />
                    </Campo>
                  ))}
                </fieldset>
                {fila.fuenteCifras === "vista_previa" && <p className="m-0 text-xs text-muted-foreground">Leído de la vista pública de Instagram{fila.leidoEn ? ` el ${formatearFechaHora(fila.leidoEn)}` : ""} · dato no oficial</p>}
                {fila.fuenteCifras === "manual" && <p className="m-0 text-xs text-muted-foreground">Corregido a mano</p>}
              </Seccion>

              {fila.datosMeta && (
                <Seccion icono={InstagramIcon} titulo="Datos de Meta">
                  <details className="group">
                    <summary className={`cursor-pointer text-sm text-primario hover:underline ${anilloFoco}`}>Ver el aviso y la consulta a Instagram</summary>
                    <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-muted p-3 text-xs">{fila.datosMeta}</pre>
                  </details>
                </Seccion>
              )}

              <Seccion icono={EstadoIcon} titulo="Para decidir">
                <fieldset disabled={!puedeEscribir || guardando} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                  <Campo etiqueta="Estado" id="campo-estado-instagram">
                    <select id="campo-estado-instagram" name="estado" defaultValue={fila.estado} className={fieldClass}>
                      {ESTADOS_INSTAGRAM.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.etiqueta}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta="Página de destino" id="campo-pagina-instagram">
                    <input id="campo-pagina-instagram" type="url" name="pagina_destino" defaultValue={fila.paginaDestino ?? ""} placeholder="Ej: https://tienda.com/producto" className={fieldClass} />
                  </Campo>
                  <Campo etiqueta="Notas" id="campo-notas-instagram">
                    <textarea id="campo-notas-instagram" name="notas" rows={3} maxLength={4000} defaultValue={fila.notas ?? ""} className={fieldClass} />
                  </Campo>
                </fieldset>
              </Seccion>
            </div>
          </form>
          <div className="border-t border-border p-5">
            <HistorialGenerico id={fila.id} codigoPais={codigoPais} version={versionHistorial} obtener={obtenerHistorialCaptura} />
          </div>
        </div>
      )}
    </Ventana>
  );
}
