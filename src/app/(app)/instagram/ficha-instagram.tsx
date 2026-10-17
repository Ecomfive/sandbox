"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha, formatearFechaHora } from "@/lib/formato";
import { urlAnunciosDePagina, urlBibliotecaAnuncios, urlBusquedaTikTok, urlTopAdsTikTok } from "@/lib/instagram/biblioteca";
import { CerrarIcon, CheckIcon, PapeleraIcon, EnlaceIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, iconoDeRed, PersonaIcon } from "@/lib/nav-icons";
import { actualizarCaptura, eliminarCaptura, leerEnlaceDeCaptura, obtenerHistorialCaptura, quitarEnvioDeCaptura, urlVideoCaptura } from "./actions";
import { MarcadorBiblioteca } from "./marcador-biblioteca";
import { UnirCaptura } from "./unir-captura";
import { colorEstadoInstagram, colorFormatoInstagram, colorPlataforma, etiquetaPlataforma, ESTADOS_INSTAGRAM, etiquetaEstadoInstagram, etiquetaFormatoInstagram, formatoDeCaptura, numeroInstagram, quienEnvio, type FilaInstagram } from "./def-instagram";

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

/** Un enlace que sale de la plataforma: pequeño, con el aviso de que abre otra pestaña para quien usa lector de pantalla. */
function EnlaceExterno({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-6 items-center gap-1.5 text-sm text-primario hover:underline ${anilloFoco}`}>
      <EnlaceIcon className="h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

/** El perfil de la cuenta en su red; si la cuenta salió de la Biblioteca es el usuario de la página de Facebook, aunque la captura sea de Instagram. */
function perfilDe(fila: FilaInstagram): { href: string; texto: string } | null {
  const usuario = fila.autorUsuario?.trim().replace(/^@/, "");
  if (!usuario) return null;
  const u = encodeURIComponent(usuario);
  if (fila.plataforma === "tiktok") return { href: `https://www.tiktok.com/@${u}`, texto: `Abrir la cuenta @${usuario}` };
  if (fila.plataforma === "facebook" || fila.cuentaDeBiblioteca) return { href: `https://www.facebook.com/${u}`, texto: "Abrir la página de Facebook" };
  return { href: `https://www.instagram.com/${u}/`, texto: "Abrir el perfil de Instagram" };
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
] as const;
// Vistas y compartidos: solo los dan TikTok y Facebook, así que solo se muestran en sus capturas.
const CIFRAS_EXTRA = [
  ["view_count", "Vistas", "vistas"],
  ["share_count", "Compartidos", "compartidos"],
] as const;
// Guardados: solo lo muestra TikTok.
const CIFRAS_TIKTOK = [["save_count", "Guardados", "guardados"]] as const;
const PASOS_LEER_ENLACE = ["Abriendo la página", "Leyendo el texto y las cifras", "Buscando el archivo", "Guardando lo leído"];
const megas = (bytes: number | null) => (bytes === null ? "" : ` · ${(bytes / 1_048_576).toLocaleString("es-CR", { maximumFractionDigits: 1 })} MB`);

/** El video de la captura, con su enlace firmado (el bucket es privado); sin video dice por qué, si se sabe. */
function VideoCaptura({ fila }: { fila: FilaInstagram }) {
  const [estado, setEstado] = useState<{ id: string; url?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!fila.tieneArchivo) return;
    let vigente = true;
    urlVideoCaptura(fila.id)
      .then((r) => vigente && setEstado({ id: fila.id, ...("url" in r ? { url: r.url } : { error: r.error }) }))
      .catch(() => vigente && setEstado({ id: fila.id, error: "No se pudo abrir el video." }));
    return () => {
      vigente = false;
    };
  }, [fila.id, fila.tieneArchivo]);

  const actual = estado?.id === fila.id ? estado : null;
  if (!fila.tieneArchivo) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
        <p className="m-0">{fila.videoError ? `Sin archivo: ${fila.videoError}` : "Esta captura no trae ni video ni imagen."}</p>
        {fila.enlace && (
          <a href={fila.enlace} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted ${anilloFoco}`}>
            <EnlaceIcon className="h-4 w-4" />
            {`Ver en ${etiquetaPlataforma(fila.plataforma)}`}
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
  if (!actual?.url) return <p className="m-0 rounded-lg border border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">{fila.archivoTipo === "imagen" ? "Cargando la imagen…" : "Cargando el video…"}</p>;
  if (fila.archivoTipo === "imagen") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={actual.url} alt={`Imagen de ${numeroInstagram(fila.numero)}`} className="max-h-[30rem] w-full rounded-lg border border-border bg-muted object-contain" />;
  }
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
  otras,
  orden,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  fila: FilaInstagram | undefined;
  /** Todas las capturas de la lista, para elegir con cuál unir esta. */
  otras: FilaInstagram[];
  orden: string[];
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [leyendo, setLeyendo] = useState(false);
  // Al volver la respuesta la barra se completa un instante antes de quitarse.
  const [leyendoTerminado, setLeyendoTerminado] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [modificadoId, setModificadoId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();
  const raiz = useRef<HTMLFormElement>(null);
  // Lo que muestran los campos del formulario (no controlados: solo toman su valor al montarse). Cuando cambia en el servidor (al volver a leer el enlace o al
  // guardar), el formulario se monta de nuevo con lo nuevo: si no, mostraba las cifras viejas y un «Guardar cambios» las habría puesto encima de las nuevas.
  const firma = fila ? [fila.megusta, fila.comentarios, fila.vistas, fila.compartidos, fila.guardados, fila.fechaPublicacion, fila.autorUsuario, fila.nombrePagina, fila.enlace, fila.anuncios, fila.paginaDestino, fila.notas, fila.estado, fila.leidoEn, fila.bibliotecaLeidoEn].join("|") : "";
  // Lo que se editó sin guardar pertenece a esa captura con esos datos: si los datos cambian, ya no cuenta.
  const modificado = !!fila && modificadoId === `${fila.id}|${firma}`;

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

  /** Vuelve a leer la página pública del enlace y completa el archivo, las cifras, la cuenta y el nombre de la página. */
  async function leerEnlace() {
    if (!fila || leyendo) return;
    setLeyendo(true);
    const r: { error?: string; archivo?: boolean; faltaArchivo?: string } = await leerEnlaceDeCaptura(fila.id).catch(() => ({ error: "No se pudo leer el enlace." }));
    if (!r.error) {
      setLeyendoTerminado(true);
      await new Promise((x) => setTimeout(x, 450));
    }
    setLeyendo(false);
    setLeyendoTerminado(false);
    if (r.error) mostrarToast(r.error, "destructive");
    else {
      // Si la red no entregó el archivo se dice aquí (y queda en la ficha), en vez de dar por completada una captura que sigue sin él.
      mostrarToast(r.archivo ? "Archivo y datos completados" : r.faltaArchivo ? `Datos completados. Sin archivo: ${r.faltaArchivo}` : "Datos completados");
      setVersion((v) => v + 1);
      setVersionHistorial((v) => v + 1);
      router.refresh();
    }
  }

  /** Borra la captura (con su archivo) tras confirmar: no se puede deshacer. */
  async function eliminar() {
    if (!fila || eliminando || guardando) return;
    if (!confirm(`¿Eliminar la captura ${numeroInstagram(fila.numero)}? Se borra con su archivo y no se puede deshacer.`)) return;
    setEliminando(true);
    const r: { error?: string } = await eliminarCaptura(fila.id).catch(() => ({ error: "No se pudo eliminar la captura." }));
    setEliminando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast(`${numeroInstagram(fila.numero)} eliminada`);
    setModificadoId(null);
    alCerrar();
    router.refresh();
  }

  /** Quita un envío fusionado de la lista de «Compartida N veces». */
  async function quitarEnvio(mensajeId: string, quien: string) {
    if (!fila || guardando) return;
    if (!confirm(`¿Quitar el envío de ${quien} de la lista? Los datos que haya completado se quedan.`)) return;
    const r: { error?: string } = await quitarEnvioDeCaptura(fila.id, mensajeId).catch(() => ({ error: "No se pudo quitar el envío." }));
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast("Envío quitado");
    setVersionHistorial((v) => v + 1);
    router.refresh();
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
  // Los anuncios de la página se buscan por su nombre en la Biblioteca; si no se conoce, por el usuario de Facebook de la cuenta.
  const perfilDeLaCuenta = fila ? perfilDe(fila) : null;
  const usuarioDeFacebook = fila && (fila.plataforma === "facebook" || fila.cuentaDeBiblioteca) ? fila.autorUsuario : null;
  const urlPaginaEnBiblioteca = fila ? urlAnunciosDePagina(fila.bibliotecaPagina ?? fila.nombrePagina ?? usuarioDeFacebook) : null;

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
            <span className="text-lg font-semibold">{`Captura de ${etiquetaPlataforma(fila.plataforma)}`}</span>
            {fila.plataforma !== "instagram" && <Badge color={colorPlataforma(fila.plataforma)}>{etiquetaPlataforma(fila.plataforma)}</Badge>}
            <Badge color={colorFormatoInstagram(formatoDeCaptura(fila))}>{etiquetaFormatoInstagram(formatoDeCaptura(fila))}</Badge>
            <Badge color={colorEstadoInstagram(fila.estado)}>{etiquetaEstadoInstagram(fila.estado)}</Badge>
            {fila.repetidaDe !== null && <Badge tone="warning">{`Repetida de ${numeroInstagram(fila.repetidaDe)}`}</Badge>}
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
            key={`${fila.id}-${version}-${firma}`}
            onSubmit={guardar}
            onChange={() => setModificadoId(`${fila.id}|${firma}`)}
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
              <Seccion icono={iconoDeRed(fila.plataforma)} titulo={fila.archivoTipo === "imagen" ? "Imagen" : "Video"}>
                <VideoCaptura fila={fila} />
                {leyendo && <ProgresoEstimado pasos={PASOS_LEER_ENLACE} estimadoMs={8000} terminado={leyendoTerminado} etiqueta="Leyendo el enlace de la captura" />}
                {puedeEscribir && (fila.enlace || !fila.tieneArchivo) && (
                  <button type="button" onClick={() => void leerEnlace()} disabled={leyendo || guardando} className={`self-start text-sm text-primario hover:underline disabled:opacity-60 ${anilloFoco}`}>
                    {leyendo ? "Leyendo..." : fila.enlace ? (fila.tieneArchivo ? "Volver a leer el enlace" : "Completar desde el enlace") : "Reintentar el archivo"}
                  </button>
                )}
                {fila.tieneArchivo && fila.videoBytes !== null && <p className="m-0 text-xs text-muted-foreground">{megas(fila.videoBytes).slice(3)}</p>}
              </Seccion>

              <Seccion icono={PersonaIcon} titulo="Quién lo compartió">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Dato etiqueta={fila.envios.length > 0 ? `Compartida ${fila.envios.length + 1} veces` : "Enviado por"}>
                    {fila.envios.length === 0 ? (
                      quienEnvio(fila)
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {[{ mensajeId: null as string | null, quien: quienEnvio(fila), en: fila.recibidoEn }, ...fila.envios].map((e, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-x-2">
                            <span>
                              {e.quien} · <span className="text-muted-foreground">{formatearFechaHora(e.en)}</span>
                            </span>
                            {puedeEscribir && e.mensajeId && (
                              <button type="button" onClick={() => void quitarEnvio(e.mensajeId as string, e.quien)} aria-label={`Quitar el envío de ${e.quien}`} className={`text-xs text-muted-foreground hover:text-destructive hover:underline ${anilloFoco}`}>
                                Quitar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Dato>
                  {fila.envios.length === 0 && <Dato etiqueta="Recibido">{formatearFechaHora(fila.recibidoEn)}</Dato>}
                  <Dato etiqueta="Mensaje que escribió">{fila.textoMensaje ?? "—"}</Dato>
                </dl>
              </Seccion>

              <Seccion icono={EnlaceIcon} titulo={`Lo que trajo ${etiquetaPlataforma(fila.plataforma)}`}>
                <dl className="flex flex-col gap-3">
                  <Dato etiqueta="Copy">
                    <span className="whitespace-pre-wrap">{fila.titulo ?? "—"}</span>
                  </Dato>
                  <Dato etiqueta={`Enlace de ${etiquetaPlataforma(fila.plataforma)}`}>
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
                  <Campo etiqueta={`Enlace de ${etiquetaPlataforma(fila.plataforma)}`} id="campo-enlace-instagram" className="col-span-2 sm:col-span-3">
                    <input id="campo-enlace-instagram" type="url" name="enlace" maxLength={2000} defaultValue={fila.enlace ?? ""} placeholder={fila.plataforma === "tiktok" ? "Ej: https://www.tiktok.com/@cuenta/video/1234567890" : fila.plataforma === "facebook" ? "Ej: https://www.facebook.com/reel/1234567890" : "Ej: https://www.instagram.com/reel/ABC123/"} className={fieldClass} />
                  </Campo>
                  <Campo etiqueta="Nombre de la página" id="campo-nombre-instagram" className="col-span-2 sm:col-span-3">
                    <input id="campo-nombre-instagram" type="text" name="nombre_pagina" maxLength={120} defaultValue={fila.nombrePagina ?? ""} placeholder="Ej: Mundo Digital" className={fieldClass} />
                  </Campo>
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
                {fila.plataforma !== "instagram" &&
                  [...CIFRAS_EXTRA, ...(fila.plataforma === "tiktok" ? CIFRAS_TIKTOK : [])].map(([nombre, etiqueta, valor]) => (
                    <Campo key={nombre} etiqueta={etiqueta} id={`campo-${nombre}-instagram`}>
                      <input id={`campo-${nombre}-instagram`} type="number" inputMode="numeric" min="0" step="1" name={nombre} defaultValue={fila[valor] ?? ""} placeholder="Ej: 1200" className={`${fieldClass} tabular-nums`} />
                    </Campo>
                  ))}
                </fieldset>
                {fila.fuenteCifras === "vista_previa" && <p className="m-0 text-xs text-muted-foreground">{`Leído de la vista pública de ${etiquetaPlataforma(fila.plataforma)}`}{fila.leidoEn ? ` el ${formatearFechaHora(fila.leidoEn)}` : ""} · dato no oficial</p>}
                {fila.fuenteCifras === "manual" && <p className="m-0 text-xs text-muted-foreground">Corregido a mano</p>}
              </Seccion>

              {fila.plataforma === "tiktok" ? (
                <Seccion icono={iconoDeRed("tiktok")} titulo="Anuncio en TikTok">
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {urlBusquedaTikTok(fila.titulo) && (
                      <li>
                        <EnlaceExterno href={urlBusquedaTikTok(fila.titulo) as string}>Buscar el copy en TikTok</EnlaceExterno>
                      </li>
                    )}
                    {perfilDeLaCuenta && (
                      <li>
                        <EnlaceExterno href={perfilDeLaCuenta.href}>{perfilDeLaCuenta.texto}</EnlaceExterno>
                      </li>
                    )}
                    <li>
                      <EnlaceExterno href={urlTopAdsTikTok(codigoPais)}>Top Ads de TikTok</EnlaceExterno>
                    </li>
                  </ul>
                </Seccion>
              ) : (
              <Seccion icono={iconoDeRed(fila.plataforma)} titulo="Biblioteca de anuncios">
                <fieldset disabled={!puedeEscribir || guardando} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
                  <Campo etiqueta="Anuncios con el mismo copy" id="campo-anuncios-instagram">
                    <input id="campo-anuncios-instagram" type="number" inputMode="numeric" min="0" step="1" name="anuncios_mismo_copy" defaultValue={fila.anuncios ?? ""} placeholder="Ej: 4" className={`${fieldClass} tabular-nums`} />
                  </Campo>
                </fieldset>
                {fila.bibliotecaLeidoEn && (
                  <p className="m-0 text-xs text-muted-foreground">
                    Última lectura: {fila.bibliotecaActivos ?? 0} {fila.bibliotecaActivos === 1 ? "activo" : "activos"} · {fila.bibliotecaInactivos ?? 0} {fila.bibliotecaInactivos === 1 ? "inactivo" : "inactivos"}
                    {fila.bibliotecaDesde ? ` · circula desde el ${formatearFecha(fila.bibliotecaDesde)}` : ""} · {formatearFechaHora(fila.bibliotecaLeidoEn)}
                  </p>
                )}
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {urlBibliotecaAnuncios(fila.titulo) && (
                    <li>
                      <EnlaceExterno href={urlBibliotecaAnuncios(fila.titulo) as string}>Buscar el anuncio en la Biblioteca de anuncios</EnlaceExterno>
                    </li>
                  )}
                  {urlPaginaEnBiblioteca && (
                    <li>
                      <EnlaceExterno href={urlPaginaEnBiblioteca}>Ver los anuncios de la página</EnlaceExterno>
                    </li>
                  )}
                  {perfilDeLaCuenta && (
                    <li>
                      <EnlaceExterno href={perfilDeLaCuenta.href}>{perfilDeLaCuenta.texto}</EnlaceExterno>
                    </li>
                  )}
                </ul>
                {puedeEscribir && <MarcadorBiblioteca />}
              </Seccion>
              )}

              {fila.datosMeta && (
                <Seccion icono={iconoDeRed(fila.plataforma)} titulo={fila.plataforma === "instagram" ? "Datos de Meta" : `Datos de ${etiquetaPlataforma(fila.plataforma)}`}>
                  <details className="group">
                    <summary className={`cursor-pointer text-sm text-primario hover:underline ${anilloFoco}`}>Ver el aviso y la consulta</summary>
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
                    {fila.paginaDestino && (
                      <a href={fila.paginaDestino} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 self-start text-sm text-primario hover:underline ${anilloFoco}`}>
                        <EnlaceIcon className="h-4 w-4" />
                        Abrir la página de destino
                      </a>
                    )}
                  </Campo>
                  <Campo etiqueta="Notas" id="campo-notas-instagram">
                    <textarea id="campo-notas-instagram" name="notas" rows={3} maxLength={4000} defaultValue={fila.notas ?? ""} className={fieldClass} />
                  </Campo>
                </fieldset>
              </Seccion>
            </div>
          </form>
          {puedeEscribir && otras.length > 1 && (
            <div className="border-t border-border p-5">
              <UnirCaptura key={fila.id} fila={fila} otras={otras} alUnir={() => { alCerrar(); router.refresh(); }} />
            </div>
          )}
          {puedeEscribir && (
            <div className="border-t border-border p-5">
              <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={() => void eliminar()} disabled={eliminando || guardando}>
                {eliminando ? "Eliminando..." : "Eliminar captura"}
              </BotonAccion>
            </div>
          )}
          <div className="border-t border-border p-5">
            <HistorialGenerico id={fila.id} codigoPais={codigoPais} version={versionHistorial} obtener={obtenerHistorialCaptura} />
          </div>
        </div>
      )}
    </Ventana>
  );
}
