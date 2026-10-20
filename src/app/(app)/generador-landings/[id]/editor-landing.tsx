"use client";

/* eslint-disable @next/next/no-img-element -- enlaces firmados de Storage e imágenes de la landing de referencia */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ANGULOS,
  ESPACIOS_IMAGEN,
  etiquetaEstadoLanding,
  etiquetaSeccion,
  faltantesLanding,
  MAX_BENEFICIOS,
  MAX_COMPARATIVA,
  MAX_FOTOS_PROVEEDOR,
  MAX_PREGUNTAS,
  MAX_RESENAS,
  numeroLanding,
  type ContenidoLanding,
  type EspacioImagen,
  type LecturaReferencia,
} from "@/lib/landings/landing";
import { CerrarIcon, FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { analizarReferencia, eliminarLanding, guardarImagenLanding, guardarLanding, prepararSubidaImagenLanding, quitarImagenLanding } from "../actions";
import { formatoPrecio, VistaLanding, type OfertaVista } from "./vista-landing";

interface ImagenEditor {
  ruta: string | null;
  instruccion: string;
  url: string | null;
}

export interface LandingEditor {
  id: string;
  numero: number;
  nombre: string;
  modo: "cero" | "clonar";
  referenciaUrl: string;
  referencia: LecturaReferencia | null;
  angulo: string;
  notasIa: string;
  moneda: string;
  precio: number | null;
  precioTachado: number | null;
  estado: string;
  contenido: ContenidoLanding;
  imagenes: Record<EspacioImagen, ImagenEditor>;
  fotosProveedor: { ruta: string; url: string | null }[];
}

/** Lo que se guarda con «Guardar cambios» (las imágenes se guardan solas al subirlas). */
interface Editable {
  nombre: string;
  modo: "cero" | "clonar";
  referenciaUrl: string;
  angulo: string;
  notasIa: string;
  precio: string;
  precioTachado: string;
  contenido: ContenidoLanding;
  instrucciones: Record<EspacioImagen, string>;
}

const PASOS = ["Producto", "Imágenes", "Textos", "Secciones", "Publicar"] as const;
const MAX_BYTES = 10 * 1024 * 1024;
const TONO_ESTADO: Record<string, Tone> = { borrador: "neutral", lista: "success", publicada: "info" };

function editableDe(l: LandingEditor): Editable {
  return {
    nombre: l.nombre,
    modo: l.modo,
    referenciaUrl: l.referenciaUrl,
    angulo: l.angulo,
    notasIa: l.notasIa,
    precio: l.precio === null ? "" : String(l.precio),
    precioTachado: l.precioTachado === null ? "" : String(l.precioTachado),
    contenido: l.contenido,
    instrucciones: Object.fromEntries(ESPACIOS_IMAGEN.map((e) => [e.clave, l.imagenes[e.clave].instruccion])) as Record<EspacioImagen, string>,
  };
}

const aNumero = (t: string) => (t.trim() === "" ? null : Number(t));

/** Un botón de algo que todavía no está conectado (Gemini, Claude, Shopify): se ve, se enfoca y dice por qué no actúa. */
function BotonPendiente({ children, motivo }: { children: string; motivo: string }) {
  return (
    <Tooltip texto={motivo}>
      <button type="button" aria-disabled="true" aria-label={`${children} (${motivo.toLowerCase()})`} className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-60">
        {children}
      </button>
    </Tooltip>
  );
}

function Campo({ etiqueta, children, ancho = "" }: { etiqueta: string; children: ReactNode; ancho?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${ancho}`}>
      <span aria-hidden="true" className={labelClass}>
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

function Bloque({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** El editor de una landing: los cinco pasos a la izquierda y la vista previa a la derecha, que cambia al escribir. */
export function EditorLanding({ landing, origen, ofertas, puedeEscribir }: { landing: LandingEditor; origen: string | null; ofertas: OfertaVista[]; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [paso, setPaso] = useState(0);
  const [escritorio, setEscritorio] = useState(false);
  const [guardado, setGuardado] = useState<Editable>(() => editableDe(landing));
  const [e, setE] = useState<Editable>(() => editableDe(landing));
  const [estado, setEstado] = useState(landing.estado);
  const [imagenes, setImagenes] = useState(landing.imagenes);
  const [fotos, setFotos] = useState(landing.fotosProveedor);
  const [referencia, setReferencia] = useState(landing.referencia);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [guardando, iniciarGuardar] = useTransition();
  const [leyendo, iniciarLeer] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);
  const destinoSubida = useRef<string>("portada");

  const cambiado = useMemo(() => JSON.stringify(e) !== JSON.stringify(guardado), [e, guardado]);
  const c = e.contenido;
  const setC = (cambio: Partial<ContenidoLanding>) => setE((x) => ({ ...x, contenido: { ...x.contenido, ...cambio } }));
  const bloqueado = !puedeEscribir;

  // Con cambios sin guardar, el navegador pregunta antes de cerrar o recargar la pestaña.
  useEffect(() => {
    if (!cambiado) return;
    const avisar = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambiado]);

  const faltantes = faltantesLanding({
    nombre: e.nombre,
    precio: aNumero(e.precio),
    contenido: c,
    imagenes: Object.fromEntries(ESPACIOS_IMAGEN.map((x) => [x.clave, { ruta: imagenes[x.clave].ruta, instruccion: "" }])) as Record<EspacioImagen, { ruta: string | null; instruccion: string }>,
  });

  function guardar() {
    iniciarGuardar(async () => {
      const r = await guardarLanding(landing.id, {
        nombre: e.nombre,
        modo: e.modo,
        referenciaUrl: e.referenciaUrl,
        angulo: e.angulo,
        notasIa: e.notasIa,
        precio: aNumero(e.precio),
        precioTachado: aNumero(e.precioTachado),
        contenido: e.contenido,
        instrucciones: e.instrucciones,
      });
      if (r.error) return mostrarToast(r.error, "destructive");
      setGuardado(e);
      if (r.estado) setEstado(r.estado);
      mostrarToast(r.estado === "lista" && estado !== "lista" ? "Landing guardada y lista para publicar" : "Landing guardada");
      router.refresh();
    });
  }

  function elegirArchivo(destino: string) {
    destinoSubida.current = destino;
    archivo.current?.click();
  }

  async function subir(f: File, destino: string) {
    if (!f.type.startsWith("image/")) return mostrarToast("Eso no es una imagen (JPG, PNG, WebP o GIF).", "destructive");
    if (f.size > MAX_BYTES) return mostrarToast("La imagen pesa más de 10 MB.", "destructive");
    setSubiendo(destino);
    try {
      const permiso = await prepararSubidaImagenLanding(landing.id, f.name || "imagen");
      if ("error" in permiso) return mostrarToast(permiso.error, "destructive");
      const { error } = await supabase.storage.from("landings").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type });
      if (error) return mostrarToast("No se pudo subir la imagen.", "destructive");
      const r = await guardarImagenLanding(landing.id, destino, permiso.ruta);
      if (r.error) return mostrarToast(r.error, "destructive");
      if (destino === "proveedor") setFotos((x) => [...x, { ruta: permiso.ruta, url: r.url ?? null }]);
      else setImagenes((x) => ({ ...x, [destino]: { ...x[destino as EspacioImagen], ruta: permiso.ruta, url: r.url ?? null } }));
      mostrarToast("Imagen guardada");
    } catch {
      mostrarToast("No se pudo subir la imagen.", "destructive");
    } finally {
      setSubiendo(null);
    }
  }

  async function quitar(destino: string, ruta: string) {
    const r = await quitarImagenLanding(landing.id, destino, ruta);
    if (r.error) return mostrarToast(r.error, "destructive");
    if (destino === "proveedor") setFotos((x) => x.filter((f) => f.ruta !== ruta));
    else setImagenes((x) => ({ ...x, [destino]: { ...x[destino as EspacioImagen], ruta: null, url: null } }));
  }

  function leerReferencia() {
    iniciarLeer(async () => {
      const r = await analizarReferencia(landing.id, e.referenciaUrl);
      if (r.error || !r.lectura) return mostrarToast(r.error ?? "No se pudo leer la landing.", "destructive");
      setReferencia(r.lectura);
      setGuardado((g) => ({ ...g, referenciaUrl: e.referenciaUrl.trim(), modo: "clonar" }));
      mostrarToast(`Leída: ${r.lectura.encabezados.length} títulos y ${r.lectura.imagenes.length} imágenes`);
    });
  }

  function mover(i: number, d: number) {
    const s = [...c.secciones];
    [s[i], s[i + d]] = [s[i + d], s[i]];
    setC({ secciones: s });
  }

  const vistaImagenes = Object.fromEntries(ESPACIOS_IMAGEN.map((x) => [x.clave, imagenes[x.clave].url])) as Record<EspacioImagen, string | null>;
  const f = formatoPrecio(landing.moneda);

  // --- Pasos ------------------------------------------------------------------------------------------------------

  const pasoProducto = (
    <div className="flex flex-col gap-5">
      <Bloque titulo="Cómo se arma">
        <div role="radiogroup" aria-label="Cómo se arma la landing" className="inline-flex w-fit rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              ["cero", "Desde cero"],
              ["clonar", "Clonar una landing"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={e.modo === v}
              disabled={bloqueado}
              onClick={() => setE((x) => ({ ...x, modo: v }))}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${e.modo === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {e.modo === "clonar" && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <Campo etiqueta="Landing de referencia" ancho="flex-1 basis-64">
                <input aria-label="Landing de referencia" type="url" value={e.referenciaUrl} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, referenciaUrl: ev.target.value }))} placeholder="Ej: https://tienda.com/products/lampara" className={`${fieldClass} font-mono text-xs`} />
              </Campo>
              {puedeEscribir && (
                <Button type="button" variant="secondary" disabled={leyendo || !e.referenciaUrl.trim()} onClick={leerReferencia}>
                  {leyendo ? "Leyendo…" : referencia ? "Volver a leer" : "Leer landing"}
                </Button>
              )}
            </div>
            {referencia && (
              <div className="flex flex-col gap-3">
                {referencia.titulo && <p className="text-sm font-medium">{referencia.titulo}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Títulos, en orden ({referencia.encabezados.length})</p>
                    <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                      {referencia.encabezados.map((h, i) => (
                        <li key={i} className={h.nivel === 1 ? "font-semibold" : h.nivel === 3 ? "pl-6 text-muted-foreground" : "pl-3"}>
                          {h.texto}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Imágenes ({referencia.imagenes.length}) · {referencia.botonesCompra} {referencia.botonesCompra === 1 ? "botón" : "botones"} de compra
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {referencia.imagenes.slice(0, 12).map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer noopener" className="block aspect-square overflow-hidden rounded border border-border bg-muted">
                          <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Bloque>

      <Bloque titulo="Producto">
        {origen && <p className="text-xs text-muted-foreground tabular-nums">De Selección: {origen}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre del producto">
            <input aria-label="Nombre del producto" value={e.nombre} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, nombre: ev.target.value }))} placeholder="Ej: Lámpara Luna 3D" className={fieldClass} />
          </Campo>
          <Campo etiqueta="Ángulo de venta">
            <select aria-label="Ángulo de venta" value={e.angulo} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, angulo: ev.target.value }))} className={fieldClass}>
              {ANGULOS.map((a) => (
                <option key={a.valor} value={a.valor}>
                  {a.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta={`Precio (${landing.moneda})`}>
            <input aria-label={`Precio (${landing.moneda})`} type="number" min={0} step="0.01" value={e.precio} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, precio: ev.target.value }))} placeholder="Ej: 39.90" className={`${fieldClass} tabular-nums`} />
          </Campo>
          <Campo etiqueta={`Precio tachado (${landing.moneda})`}>
            <input aria-label={`Precio tachado (${landing.moneda})`} type="number" min={0} step="0.01" value={e.precioTachado} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, precioTachado: ev.target.value }))} placeholder="Ej: 69.90" className={`${fieldClass} tabular-nums`} />
          </Campo>
        </div>
        <Campo etiqueta="Notas para la IA">
          <textarea aria-label="Notas para la IA" rows={3} value={e.notasIa} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, notasIa: ev.target.value }))} placeholder="Ej: público mujeres de 25 a 45; sin promesas médicas; mencionar pago contra entrega" className={fieldClass} />
        </Campo>
      </Bloque>

      <Bloque
        titulo={`Fotos del proveedor (${fotos.length} de ${MAX_FOTOS_PROVEEDOR})`}
        accion={
          puedeEscribir &&
          fotos.length < MAX_FOTOS_PROVEEDOR && (
            <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={!!subiendo} onClick={() => elegirArchivo("proveedor")}>
              {subiendo === "proveedor" ? "Subiendo…" : "Subir foto"}
            </Button>
          )
        }
      >
        {fotos.length ? (
          <div className="flex flex-wrap gap-2">
            {fotos.map((foto, i) => (
              <div key={foto.ruta} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                {foto.url && <img src={foto.url} alt={`Foto del proveedor ${i + 1}`} className="h-full w-full object-cover" />}
                {puedeEscribir && (
                  <button type="button" onClick={() => quitar("proveedor", foto.ruta)} aria-label={`Quitar la foto del proveedor ${i + 1}`} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded bg-foreground/80 text-background opacity-0 focus:opacity-100 group-hover:opacity-100">
                    <CerrarIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin fotos todavía.</p>
        )}
      </Bloque>
    </div>
  );

  const pasoImagenes = (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ESPACIOS_IMAGEN.map((esp) => {
        const img = imagenes[esp.clave];
        return (
          <article key={esp.clave} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-square bg-muted">
              {img.url ? (
                <img src={img.url} alt={esp.etiqueta} className={`h-full w-full object-cover ${subiendo === esp.clave ? "opacity-40" : ""}`} />
              ) : (
                <div className="grid h-full place-items-center text-xs text-muted-foreground">{subiendo === esp.clave ? "Subiendo…" : "Sin imagen"}</div>
              )}
            </div>
            <div className="flex flex-col gap-2 p-3">
              <h3 className="text-sm font-semibold">{esp.etiqueta}</h3>
              <Campo etiqueta="Instrucción para la imagen">
                <textarea aria-label="Instrucción para la imagen"
                  rows={3}
                  value={e.instrucciones[esp.clave]}
                  disabled={bloqueado}
                  onChange={(ev) => setE((x) => ({ ...x, instrucciones: { ...x.instrucciones, [esp.clave]: ev.target.value } }))}
                  className={`${fieldClass} text-xs`}
                />
              </Campo>
              {puedeEscribir && (
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={!!subiendo} onClick={() => elegirArchivo(esp.clave)}>
                    {img.ruta ? "Cambiar" : "Subir imagen"}
                  </Button>
                  {img.ruta && (
                    <Button type="button" variant="ghost" className="text-xs" disabled={!!subiendo} onClick={() => quitar(esp.clave, img.ruta!)}>
                      Quitar
                    </Button>
                  )}
                  <BotonPendiente motivo="Falta conectar Gemini">Generar con Gemini</BotonPendiente>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  const filaDoble = <T,>(lista: T[], max: number, vacio: T, clave: keyof ContenidoLanding, render: (item: T, i: number, cambiar: (v: Partial<T>) => void) => ReactNode, nombre: string) => (
    <div className="flex flex-col gap-2">
      {lista.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">{render(item, i, (v) => setC({ [clave]: lista.map((x, j) => (j === i ? { ...x, ...v } : x)) } as Partial<ContenidoLanding>))}</div>
          {puedeEscribir && (
            <Tooltip texto={`Quitar ${nombre}`}>
              <button type="button" aria-label={`Quitar ${nombre} ${i + 1}`} onClick={() => setC({ [clave]: lista.filter((_, j) => j !== i) } as Partial<ContenidoLanding>)} className="mt-1 grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <CerrarIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </div>
      ))}
      {puedeEscribir && lista.length < max && (
        <button type="button" onClick={() => setC({ [clave]: [...lista, vacio] } as Partial<ContenidoLanding>)} className="w-fit text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          + Agregar {nombre}
        </button>
      )}
    </div>
  );

  const pasoTextos = (
    <div className="flex flex-col gap-5">
      <Bloque titulo="Portada" accion={puedeEscribir && <BotonPendiente motivo="Falta conectar Claude">Escribir con Claude</BotonPendiente>}>
        <Campo etiqueta="Franja de arriba">
          <input aria-label="Franja de arriba" value={c.anuncio} disabled={bloqueado} onChange={(ev) => setC({ anuncio: ev.target.value })} placeholder="Ej: Envío gratis · Pagas al recibir" className={fieldClass} />
        </Campo>
        <Campo etiqueta="Titular">
          <input aria-label="Titular" value={c.titular} disabled={bloqueado} onChange={(ev) => setC({ titular: ev.target.value })} placeholder="Ej: El regalo que ilumina su noche" className={fieldClass} />
        </Campo>
        <Campo etiqueta="Subtítulo">
          <textarea aria-label="Subtítulo" rows={3} value={c.subtitulo} disabled={bloqueado} onChange={(ev) => setC({ subtitulo: ev.target.value })} placeholder="Ej: Una luna con relieve real para su mesa de noche: 16 colores y batería recargable." className={fieldClass} />
        </Campo>
        <Campo etiqueta="Texto del botón">
          <input aria-label="Texto del botón" value={c.boton} disabled={bloqueado} onChange={(ev) => setC({ boton: ev.target.value })} placeholder="Ej: Comprar ahora" className={fieldClass} />
        </Campo>
      </Bloque>
      <Bloque titulo="Beneficios">
        {filaDoble(c.beneficios, MAX_BENEFICIOS, { titulo: "", detalle: "" }, "beneficios", (b, i, cambiar) => (
          <>
            <input aria-label={`Beneficio ${i + 1}`} value={b.titulo} disabled={bloqueado} onChange={(ev) => cambiar({ titulo: ev.target.value })} placeholder="Ej: Sin cables" className={fieldClass} />
            <input aria-label={`Detalle del beneficio ${i + 1}`} value={b.detalle} disabled={bloqueado} onChange={(ev) => cambiar({ detalle: ev.target.value })} placeholder="Ej: Batería recargable por USB, hasta 8 horas." className={fieldClass} />
          </>
        ), "beneficio")}
      </Bloque>
      <Bloque titulo="Comparativa">
        {filaDoble(c.comparativa, MAX_COMPARATIVA, { texto: "" }, "comparativa", (fila, i, cambiar) => (
          <input aria-label={`Ventaja ${i + 1}`} value={fila.texto} disabled={bloqueado} onChange={(ev) => cambiar({ texto: ev.target.value })} placeholder="Ej: Batería recargable" className={`${fieldClass} sm:col-span-2`} />
        ), "ventaja")}
      </Bloque>
      <Bloque titulo="Preguntas frecuentes">
        {filaDoble(c.preguntas, MAX_PREGUNTAS, { pregunta: "", respuesta: "" }, "preguntas", (p, i, cambiar) => (
          <>
            <input aria-label={`Pregunta ${i + 1}`} value={p.pregunta} disabled={bloqueado} onChange={(ev) => cambiar({ pregunta: ev.target.value })} placeholder="Ej: ¿Qué incluye?" className={fieldClass} />
            <input aria-label={`Respuesta ${i + 1}`} value={p.respuesta} disabled={bloqueado} onChange={(ev) => cambiar({ respuesta: ev.target.value })} placeholder="Ej: La lámpara, su base, el control y el cable USB." className={fieldClass} />
          </>
        ), "pregunta")}
      </Bloque>
      <Bloque titulo="Reseñas de clientes reales">
        {filaDoble(c.resenas, MAX_RESENAS, { texto: "", nombre: "", ciudad: "" }, "resenas", (r, i, cambiar) => (
          <>
            <input aria-label={`Reseña ${i + 1}`} value={r.texto} disabled={bloqueado} onChange={(ev) => cambiar({ texto: ev.target.value })} placeholder="Ej: Llegó en 3 días y bien empacado." className={`${fieldClass} sm:col-span-2`} />
            <input aria-label={`Nombre de quien escribió la reseña ${i + 1}`} value={r.nombre} disabled={bloqueado} onChange={(ev) => cambiar({ nombre: ev.target.value })} placeholder="Ej: Mariana G." className={fieldClass} />
            <input aria-label={`Ciudad de la reseña ${i + 1}`} value={r.ciudad} disabled={bloqueado} onChange={(ev) => cambiar({ ciudad: ev.target.value })} placeholder="Ej: Ciudad de Panamá" className={fieldClass} />
          </>
        ), "reseña")}
      </Bloque>
      <Bloque titulo="Garantía">
        <textarea rows={2} aria-label="Texto de la garantía" value={c.garantia} disabled={bloqueado} onChange={(ev) => setC({ garantia: ev.target.value })} placeholder="Ej: Si llega con algún defecto, te enviamos otro sin costo." className={fieldClass} />
      </Bloque>
    </div>
  );

  const pasoSecciones = (
    <ol className="flex flex-col gap-1.5">
      {c.secciones.map((s, i) => (
        <li key={s.clave} className={`flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 ${s.visible ? "" : "opacity-55"}`}>
          <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex-1 text-sm font-medium">{etiquetaSeccion(s.clave)}</span>
          {s.clave === "ofertas" && <span className="text-xs text-muted-foreground">{ofertas.length} de Creación de ofertas</span>}
          {puedeEscribir && (
            <>
              <Tooltip texto="Subir bloque">
                <button type="button" aria-label={`Subir ${etiquetaSeccion(s.clave)}`} disabled={i === 0} onClick={() => mover(i, -1)} className="grid h-8 w-8 place-items-center rounded border border-border hover:bg-muted disabled:opacity-30">
                  <FlechaArribaIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip texto="Bajar bloque">
                <button type="button" aria-label={`Bajar ${etiquetaSeccion(s.clave)}`} disabled={i === c.secciones.length - 1} onClick={() => mover(i, 1)} className="grid h-8 w-8 place-items-center rounded border border-border hover:bg-muted disabled:opacity-30">
                  <FlechaAbajoIcon aria-hidden="true" className="h-4 w-4" />
                </button>
              </Tooltip>
              <button
                type="button"
                aria-pressed={s.visible}
                aria-label={`${etiquetaSeccion(s.clave)}: ${s.visible ? "visible, pulsar para ocultar" : "oculto, pulsar para mostrar"}`}
                onClick={() => setC({ secciones: c.secciones.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)) })}
                className="h-8 w-20 rounded border border-border text-xs font-medium hover:bg-muted"
              >
                {s.visible ? "Visible" : "Oculto"}
              </button>
            </>
          )}
        </li>
      ))}
    </ol>
  );

  const pasoPublicar = (
    <div className="flex flex-col gap-5">
      <Bloque titulo={faltantes.length ? `Falta para publicar (${faltantes.length})` : "Lista para publicar"}>
        {faltantes.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {faltantes.map((x) => (
              <li key={x} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
                {x}
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-success" />
            Tiene titular, precio, portada y todo lo de los bloques visibles.
          </p>
        )}
        {cambiado && <p className="text-sm text-muted-foreground">Guarda los cambios para que el estado se actualice.</p>}
      </Bloque>
      <Bloque titulo="Shopify">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tienda</dt>
          <dd>Sin conectar</dd>
          <dt className="text-muted-foreground">Producto</dt>
          <dd className="tabular-nums">
            {e.nombre || "—"} · {aNumero(e.precio) === null ? "sin precio" : f.format(aNumero(e.precio)!)}
          </dd>
        </dl>
        {puedeEscribir && (
          <div className="flex flex-wrap gap-2">
            <BotonPendiente motivo="Falta conectar Shopify">Crear borrador en Shopify</BotonPendiente>
          </div>
        )}
      </Bloque>
    </div>
  );

  const contenidoPaso = [pasoProducto, pasoImagenes, pasoTextos, pasoSecciones, pasoPublicar][paso];

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={archivo}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        hidden
        aria-label="Elegir imagen"
        onChange={(ev) => {
          const archivoElegido = ev.target.files?.[0];
          ev.target.value = "";
          if (archivoElegido) void subir(archivoElegido, destinoSubida.current);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">{numeroLanding(landing.numero)}</span>
          <h2 className="truncate text-lg font-semibold">{e.nombre || "Sin nombre"}</h2>
          <Badge tone={TONO_ESTADO[estado] ?? "neutral"}>{etiquetaEstadoLanding(estado)}</Badge>
          <Badge tone="neutral">{e.modo === "clonar" ? "Clonada" : "Desde cero"}</Badge>
        </div>
        {puedeEscribir && (
          <div className="flex flex-wrap items-center gap-2">
            {cambiado && (
              <>
                <Button type="button" variant="secondary" disabled={guardando} onClick={() => setE(guardado)}>
                  Descartar
                </Button>
                <Button type="button" disabled={guardando} onClick={guardar}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </Button>
              </>
            )}
            {!cambiado &&
              (confirmarEliminar ? (
                <span className="flex items-center gap-2 text-sm">
                  ¿Eliminar la landing y sus imágenes?
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const r = await eliminarLanding(landing.id);
                      if (r.error) return mostrarToast(r.error, "destructive");
                      mostrarToast("Landing eliminada");
                      router.push("/generador-landings");
                    }}
                  >
                    Eliminar
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmarEliminar(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setConfirmarEliminar(true)}>
                  Eliminar
                </Button>
              ))}
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Pasos de la landing" className="flex gap-1.5 overflow-x-auto pb-1">
        {PASOS.map((p, i) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`paso-${i}`}
            aria-selected={paso === i}
            aria-controls="panel-paso"
            onClick={() => setPaso(i)}
            className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium ${paso === i ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs tabular-nums ${paso === i ? "bg-foreground text-background" : "bg-muted"}`}>{i + 1}</span>
            {p}
          </button>
        ))}
      </div>

      <div className={`grid items-start gap-6 ${escritorio ? "xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_400px]"}`}>
        <section id="panel-paso" role="tabpanel" aria-labelledby={`paso-${paso}`} className="min-w-0 rounded-xl border border-border bg-card p-5">
          {contenidoPaso}
        </section>

        <section aria-label="Vista previa" className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <div role="radiogroup" aria-label="Tamaño de la vista previa" className="inline-flex rounded-lg border border-border bg-muted p-0.5">
              {(
                [
                  [false, "Móvil"],
                  [true, "Escritorio"],
                ] as const
              ).map(([v, t]) => (
                <button key={t} type="button" role="radio" aria-checked={escritorio === v} onClick={() => setEscritorio(v)} className={`rounded-md px-3 py-1 text-xs font-medium ${escritorio === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{cambiado ? "Con cambios sin guardar" : "Guardada"}</span>
          </div>
          <div className={`mx-auto w-full overflow-hidden border-foreground bg-white ${escritorio ? "rounded-xl border-t-[26px]" : "max-w-[375px] rounded-[30px] border-[9px]"}`}>
            <div className={`overflow-y-auto overflow-x-hidden ${escritorio ? "h-[min(760px,80vh)]" : "h-[min(720px,78vh)]"}`}>
              <VistaLanding
                nombre={e.nombre || "Producto"}
                moneda={landing.moneda}
                precio={aNumero(e.precio)}
                precioTachado={aNumero(e.precioTachado)}
                contenido={c}
                imagenes={vistaImagenes}
                ofertas={ofertas}
                escritorio={escritorio}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
