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
import type { DatosShopify } from "@/lib/landings/shopify";
import { CerrarIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { analizarReferencia, eliminarLanding, enviarAShopify, generarImagenLanding, publicarEnShopify, guardarImagenLanding, guardarLanding, prepararSubidaImagenLanding, quitarImagenLanding } from "../actions";
import { BajarIcon, BolsaIcon, ChispaIcon, ClonarIcon, DesdeCeroIcon, OjoIcon, OjoTachadoIcon, RepetirIcon, SiguienteIcon, SubirArchivoIcon, SubirIcon } from "./iconos-landing";
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
  /** El producto en Shopify, si ya se envió. */
  shopify: DatosShopify | null;
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
/** Frases que Meta suele rechazar en anuncios (promesas de salud o de resultados): se avisan en el paso Textos. */
const PROMESAS = /\b(curar?|cura|sanar?|adelgaz\w*|bajar? de peso|quema grasa|insomnio|dormir mejor|garantizad\w*|100 ?% efectiv\w*|resultados? inmediatos?|m[eé]dic\w*)\b/i;
/** Botón chico (en tarjetas y filas). */
const CHICO = "!px-2.5 !py-1 gap-1.5 text-xs";

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

/** Quién hace cada cosa: Claude escribe, Gemini crea las imágenes y Shopify publica. */
function Quien({ de }: { de: "claude" | "gemini" | "shopify" }) {
  const estilo = { claude: "bg-warning-soft text-warning", gemini: "bg-azul-soft text-azul", shopify: "bg-success-soft text-success" }[de];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-wide ${estilo}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {{ claude: "Claude", gemini: "Gemini", shopify: "Shopify" }[de]}
    </span>
  );
}

/** Un botón de algo que todavía no está conectado (Gemini, Claude, Shopify): se ve, se enfoca y dice por qué no actúa. */
function BotonPendiente({ children, motivo }: { children: string; motivo: string }) {
  return (
    <Tooltip texto={motivo}>
      <button type="button" aria-disabled="true" aria-label={`${children} (${motivo.toLowerCase()})`} className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground opacity-60">
        <ChispaIcon className="h-3.5 w-3.5" />
        {children}
      </button>
    </Tooltip>
  );
}

function Campo({ etiqueta, children, ancho = "" }: { etiqueta: ReactNode; children: ReactNode; ancho?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${ancho}`}>
      <span aria-hidden="true" className={labelClass}>
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

/** Un grupo dentro de un paso, con su subtítulo pequeño en mayúsculas. */
function Bloque({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h4>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** El título de cada paso y una línea que explica qué se hace en él. */
function TituloPaso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-bold tracking-tight">{titulo}</h3>
      <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Un punto de una lista de pasos: hecho (verde con ✓), en curso (gira) o pendiente (vacío). */
function Punto({ estado }: { estado: "ok" | "curso" | "pendiente" | "falta" }) {
  if (estado === "ok")
    return (
      <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} className="h-3 w-3">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  if (estado === "curso") return <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-primario border-t-transparent" />;
  return <span aria-hidden="true" className={`h-5 w-5 shrink-0 rounded-full border-2 ${estado === "falta" ? "border-warning" : "border-border"}`} />;
}

/** El editor de una landing: los cinco pasos a la izquierda y la vista previa a la derecha, que cambia al escribir. */
export function EditorLanding({
  landing,
  origen,
  ofertas,
  puedeEscribir,
  gemini,
  tiendaShopify,
}: {
  landing: LandingEditor;
  origen: string | null;
  ofertas: OfertaVista[];
  puedeEscribir: boolean;
  /** Hay clave de Gemini: los botones de generar funcionan. */
  gemini: boolean;
  /** La tienda de Shopify conectada (oferfy.myshopify.com) o `null` si no hay conexión. */
  tiendaShopify: string | null;
}) {
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
  // Los espacios que Gemini está generando ahora (puede haber varios a la vez).
  const [generando, setGenerando] = useState<EspacioImagen[]>([]);
  // «Generar las que faltan»: cuántas iban en la tanda y cuántas ya salieron (se ve sobre la vista previa).
  const [cola, setCola] = useState<{ total: number; hechas: number } | null>(null);
  const [shopify, setShopify] = useState(landing.shopify);
  const [enviando, iniciarEnvio] = useTransition();
  const [confirmarPublicar, setConfirmarPublicar] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [guardando, iniciarGuardar] = useTransition();
  const [leyendo, iniciarLeer] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);
  const destinoSubida = useRef<string>("portada");

  const cambiado = useMemo(() => JSON.stringify(e) !== JSON.stringify(guardado), [e, guardado]);
  const c = e.contenido;
  const setC = (cambio: Partial<ContenidoLanding>) => setE((x) => ({ ...x, contenido: { ...x.contenido, ...cambio } }));
  const bloqueado = !puedeEscribir;
  const enCola = cola !== null;

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

  /** Genera la imagen de un espacio con Gemini. Devuelve si salió bien (para la cola de «Generar las que faltan»). */
  async function generar(clave: EspacioImagen): Promise<boolean> {
    const instruccion = e.instrucciones[clave];
    setGenerando((g) => [...g, clave]);
    try {
      const r = await generarImagenLanding(landing.id, clave, instruccion);
      if (r.error || !r.ruta) {
        mostrarToast(r.error ?? "No se pudo generar la imagen.", "destructive");
        return false;
      }
      setImagenes((x) => ({ ...x, [clave]: { ruta: r.ruta!, instruccion, url: r.url ?? null } }));
      // La instrucción usada ya quedó guardada junto a la imagen.
      setGuardado((g) => ({ ...g, instrucciones: { ...g.instrucciones, [clave]: instruccion } }));
      return true;
    } catch {
      mostrarToast("No se pudo generar la imagen.", "destructive");
      return false;
    } finally {
      setGenerando((g) => g.filter((x) => x !== clave));
    }
  }

  /** Genera, una tras otra, las imágenes que faltan (la portada primero: sirve de referencia a las demás si no hay fotos del proveedor). */
  async function generarFaltantes() {
    const pendientes = ESPACIOS_IMAGEN.filter((esp) => !imagenes[esp.clave].ruta);
    setCola({ total: pendientes.length, hechas: 0 });
    let hechas = 0;
    for (const esp of pendientes) {
      if (!(await generar(esp.clave))) break;
      hechas++;
      setCola((x) => (x ? { ...x, hechas } : x));
    }
    setCola(null);
    if (hechas) mostrarToast(`${hechas} ${hechas === 1 ? "imagen generada" : "imágenes generadas"} con Gemini`);
  }

  function aShopify() {
    iniciarEnvio(async () => {
      const r = await enviarAShopify(landing.id);
      if (r.shopify) setShopify(r.shopify);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(shopify ? "Producto actualizado en Shopify" : "Borrador creado en Shopify");
      router.refresh();
    });
  }

  function publicar() {
    iniciarEnvio(async () => {
      const r = await publicarEnShopify(landing.id);
      setConfirmarPublicar(false);
      if (r.error) return mostrarToast(r.error, "destructive");
      if (r.shopify) setShopify(r.shopify);
      setEstado("publicada");
      mostrarToast("Publicada en la tienda");
      router.refresh();
    });
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
  const faltanImagenes = ESPACIOS_IMAGEN.filter((x) => !imagenes[x.clave].ruta).length;
  const clonar = e.modo === "clonar";

  // --- Pasos ------------------------------------------------------------------------------------------------------

  const pasoProducto = (
    <div>
      <TituloPaso titulo={clonar ? "Clonar una landing" : "Datos del producto"}>
        {clonar
          ? "Se toma una landing que ya vende como modelo y se rehace con tu producto, tus fotos y tus precios."
          : "Con estos datos se escriben los textos y Gemini crea las imágenes a partir de las fotos del proveedor."}
      </TituloPaso>
      <div className="flex flex-col gap-6">
        {clonar && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/60 p-3.5">
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Landing de referencia</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">Pega el enlace de una landing que funcione. Se copia la estructura y el orden de las secciones; los textos y las fotos se crean nuevos para tu producto.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Landing de referencia" type="url" value={e.referenciaUrl} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, referenciaUrl: ev.target.value }))} placeholder="Ej: https://tienda.com/products/lampara" className={`${fieldClass} min-w-0 flex-1 basis-56 font-mono text-xs`} />
              {puedeEscribir && (
                <Button type="button" variant="secondary" className="gap-1.5" disabled={leyendo || !e.referenciaUrl.trim()} onClick={leerReferencia}>
                  <ChispaIcon className="h-4 w-4" />
                  {leyendo ? "Leyendo…" : referencia ? "Volver a leer" : "Analizar"}
                </Button>
              )}
            </div>
            {referencia && (
              <div className="flex flex-col gap-3">
                {referencia.titulo && <p className="text-sm font-medium">{referencia.titulo}</p>}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Títulos, en orden ({referencia.encabezados.length})</p>
                    <ol className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                      {referencia.encabezados.map((h, i) => (
                        <li key={i} className={`flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm ${h.nivel === 1 ? "font-semibold" : h.nivel === 3 ? "ml-4 text-muted-foreground" : ""}`}>
                          <span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="min-w-0">{h.texto}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Imágenes ({referencia.imagenes.length}) · {referencia.botonesCompra} {referencia.botonesCompra === 1 ? "botón" : "botones"} de compra
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {referencia.imagenes.slice(0, 12).map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer noopener" className="block aspect-square overflow-hidden rounded-lg border border-border bg-muted">
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

        <Bloque titulo="Producto">
          {origen && <p className="-mt-1 text-xs text-muted-foreground tabular-nums">De Selección: {origen}</p>}
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
            <Campo etiqueta={`Precio de venta (${landing.moneda})`}>
              <input aria-label={`Precio de venta (${landing.moneda})`} type="number" min={0} step="0.01" value={e.precio} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, precio: ev.target.value }))} placeholder="Ej: 39.90" className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={`Precio tachado (${landing.moneda})`}>
              <input aria-label={`Precio tachado (${landing.moneda})`} type="number" min={0} step="0.01" value={e.precioTachado} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, precioTachado: ev.target.value }))} placeholder="Ej: 69.90" className={`${fieldClass} tabular-nums`} />
            </Campo>
          </div>
        </Bloque>

        <Bloque titulo={`Fotos del proveedor (${fotos.length} de ${MAX_FOTOS_PROVEEDOR})`}>
          <p className="-mt-1.5 text-xs text-muted-foreground">Gemini las usa de referencia para no cambiar el producto.</p>
          <div className="flex flex-wrap gap-2.5">
            {fotos.map((foto, i) => (
              <div key={foto.ruta} className="group relative h-[78px] w-[78px] overflow-hidden rounded-[9px] border border-border bg-white">
                {foto.url && <img src={foto.url} alt={`Foto del proveedor ${i + 1}`} className="h-full w-full object-cover" />}
                {puedeEscribir && (
                  <button type="button" onClick={() => quitar("proveedor", foto.ruta)} aria-label={`Quitar la foto del proveedor ${i + 1}`} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded bg-foreground/80 text-background opacity-0 focus:opacity-100 group-hover:opacity-100">
                    <CerrarIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {puedeEscribir && fotos.length < MAX_FOTOS_PROVEEDOR && (
              <button
                type="button"
                disabled={!!subiendo}
                onClick={() => elegirArchivo("proveedor")}
                className="grid h-[78px] w-[78px] place-items-center rounded-[9px] border border-dashed border-border-control bg-muted/50 p-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:border-primario hover:text-primario disabled:opacity-50"
              >
                {subiendo === "proveedor" ? "Subiendo…" : "+ Subir fotos"}
              </button>
            )}
            {!puedeEscribir && !fotos.length && <p className="text-sm text-muted-foreground">Sin fotos todavía.</p>}
          </div>
        </Bloque>

        <Campo
          etiqueta={
            <>
              Notas para la IA <span className="font-normal text-muted-foreground">· opcional</span>
            </>
          }
        >
          <textarea aria-label="Notas para la IA" rows={3} value={e.notasIa} disabled={bloqueado} onChange={(ev) => setE((x) => ({ ...x, notasIa: ev.target.value }))} placeholder="Ej: público mujeres de 25 a 45; sin promesas médicas; mencionar pago contra entrega" className={fieldClass} />
        </Campo>

        {puedeEscribir && gemini && faltanImagenes > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="gap-2"
              disabled={enCola || generando.length > 0}
              onClick={() => {
                setPaso(1);
                void generarFaltantes();
              }}
            >
              <ChispaIcon className="h-4 w-4" />
              {clonar ? "Clonar y generar imágenes" : "Generar imágenes con Gemini"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {faltanImagenes} {faltanImagenes === 1 ? "imagen" : "imágenes"} · aprox. 30 segundos cada una
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const pasoImagenes = (
    <div>
      <TituloPaso titulo="Imágenes">Generadas con Gemini a partir de las fotos del proveedor. Puedes cambiar la instrucción y volver a generar solo la que no te guste, o subir una tuya.</TituloPaso>
      {puedeEscribir && gemini && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5">
          <p className="text-xs text-muted-foreground">
            {fotos.length ? `Usa ${Math.min(fotos.length, 4)} ${fotos.length === 1 ? "foto" : "fotos"} del proveedor de referencia.` : imagenes.portada.ruta ? "Usa la portada de referencia." : "Sin fotos del proveedor: Gemini no sabe cómo es el producto."}
          </p>
          <Button type="button" className="gap-2 !py-1.5" disabled={enCola || !faltanImagenes || generando.length > 0} onClick={() => void generarFaltantes()}>
            <ChispaIcon className="h-4 w-4" />
            {enCola ? "Generando…" : faltanImagenes ? `Generar las que faltan (${faltanImagenes})` : "No falta ninguna"}
          </Button>
        </div>
      )}
      <div className="grid gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {ESPACIOS_IMAGEN.map((esp) => {
          const img = imagenes[esp.clave];
          const ocupado = subiendo === esp.clave || generando.includes(esp.clave);
          return (
            <article key={esp.clave} className="flex flex-col overflow-hidden rounded-xl border border-border bg-background">
              <div className="relative aspect-square bg-zinc-900">
                {img.url ? (
                  <img src={img.url} alt={esp.etiqueta} className={`h-full w-full object-cover transition-opacity ${ocupado ? "opacity-25" : ""}`} />
                ) : (
                  <div className="grid h-full place-items-center bg-muted text-xs text-muted-foreground">{ocupado ? "" : "Sin imagen"}</div>
                )}
                {ocupado && (
                  <div role="status" className="absolute inset-0 grid place-items-center">
                    <span className="flex items-center gap-2 rounded-md bg-zinc-900/85 px-3 py-1.5 font-mono text-xs text-white">
                      <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {subiendo === esp.clave ? "Subiendo…" : "Generando…"}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">{esp.etiqueta}</h4>
                  <Quien de="gemini" />
                </div>
                <textarea
                  aria-label={`Instrucción para la imagen ${esp.etiqueta}`}
                  rows={3}
                  value={e.instrucciones[esp.clave]}
                  disabled={bloqueado}
                  onChange={(ev) => setE((x) => ({ ...x, instrucciones: { ...x.instrucciones, [esp.clave]: ev.target.value } }))}
                  className={`${fieldClass} text-xs`}
                />
                {puedeEscribir && (
                  <div className="flex flex-wrap gap-1.5">
                    {gemini ? (
                      <Button type="button" variant="secondary" className={CHICO} disabled={ocupado} onClick={() => void generar(esp.clave)}>
                        {img.ruta ? <RepetirIcon className="h-3.5 w-3.5" /> : <ChispaIcon className="h-3.5 w-3.5" />}
                        {generando.includes(esp.clave) ? "Generando…" : img.ruta ? "Regenerar" : "Generar"}
                      </Button>
                    ) : (
                      <BotonPendiente motivo="Falta conectar Gemini">Generar</BotonPendiente>
                    )}
                    <Button type="button" variant="secondary" className={CHICO} disabled={!!subiendo} onClick={() => elegirArchivo(esp.clave)}>
                      <SubirArchivoIcon className="h-3.5 w-3.5" />
                      {img.ruta ? "Cambiar" : "Subir"}
                    </Button>
                    {img.ruta && (
                      <Button type="button" variant="ghost" className="text-xs" disabled={!!subiendo} onClick={() => quitar(esp.clave, img.ruta!)}>
                        Quitar
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  const filaDoble = <T,>(lista: T[], max: number, vacio: T, clave: keyof ContenidoLanding, render: (item: T, i: number, cambiar: (v: Partial<T>) => void) => ReactNode, nombre: string) => (
    <div className="flex flex-col gap-2">
      {lista.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">{render(item, i, (v) => setC({ [clave]: lista.map((x, j) => (j === i ? { ...x, ...v } : x)) } as Partial<ContenidoLanding>))}</div>
          {puedeEscribir && (
            <Tooltip texto={`Quitar ${nombre}`}>
              <button type="button" aria-label={`Quitar ${nombre} ${i + 1}`} onClick={() => setC({ [clave]: lista.filter((_, j) => j !== i) } as Partial<ContenidoLanding>)} className="mt-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <CerrarIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </div>
      ))}
      {puedeEscribir && lista.length < max && (
        <button type="button" onClick={() => setC({ [clave]: [...lista, vacio] } as Partial<ContenidoLanding>)} className="w-fit text-xs font-medium text-primario underline-offset-2 hover:underline">
          + Agregar {nombre}
        </button>
      )}
    </div>
  );

  const promesa = PROMESAS.exec(`${c.titular} ${c.subtitulo} ${c.beneficios.map((b) => `${b.titulo} ${b.detalle}`).join(" ")}`);
  const pasoTextos = (
    <div>
      <TituloPaso titulo="Textos">Lo que cambies aquí se ve al instante en la vista previa.</TituloPaso>
      <div className="flex flex-col gap-6">
        {promesa ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
            <b className="shrink-0 text-warning">Revisar</b>
            <span>«{promesa[0]}» suena a promesa de salud o de resultados y Meta puede rechazar el anuncio. Mejor describe lo que hace el producto.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg bg-success-soft px-3 py-2.5 text-sm">
            <b className="shrink-0 text-success">OK</b>
            <span>Sin promesas médicas ni frases que suelan rechazarse en anuncios.</span>
          </div>
        )}
        <Bloque titulo="Portada" accion={puedeEscribir && <BotonPendiente motivo="Falta conectar Claude">Escribir con Claude</BotonPendiente>}>
          <Campo etiqueta="Franja de arriba">
            <input aria-label="Franja de arriba" value={c.anuncio} disabled={bloqueado} onChange={(ev) => setC({ anuncio: ev.target.value })} placeholder="Ej: Envío gratis · Pagas al recibir" className={fieldClass} />
          </Campo>
          <Campo
            etiqueta={
              <span className="flex items-center justify-between gap-2">
                Titular <Quien de="claude" />
              </span>
            }
          >
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
    </div>
  );

  const botonIcono = "grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-35";
  const pasoSecciones = (
    <div>
      <TituloPaso titulo="Secciones">Ordena u oculta bloques. Cada landing usa la misma estructura, así todas se ven bien en la tienda.</TituloPaso>
      <ol className="flex flex-col gap-1.5">
        {c.secciones.map((s, i) => (
          <li key={s.clave} className={`flex items-center gap-2.5 rounded-[9px] border border-border bg-background px-2.5 py-2 ${s.visible ? "" : "opacity-50"}`}>
            <span className="w-5 font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex-1 text-sm font-medium">{etiquetaSeccion(s.clave)}</span>
            {s.clave === "ofertas" && <span className="text-xs text-muted-foreground">{ofertas.length} de Creación de ofertas</span>}
            {puedeEscribir && (
              <>
                <Tooltip texto="Subir bloque">
                  <button type="button" aria-label={`Subir ${etiquetaSeccion(s.clave)}`} disabled={i === 0} onClick={() => mover(i, -1)} className={botonIcono}>
                    <SubirIcon className="h-[15px] w-[15px]" />
                  </button>
                </Tooltip>
                <Tooltip texto="Bajar bloque">
                  <button type="button" aria-label={`Bajar ${etiquetaSeccion(s.clave)}`} disabled={i === c.secciones.length - 1} onClick={() => mover(i, 1)} className={botonIcono}>
                    <BajarIcon className="h-[15px] w-[15px]" />
                  </button>
                </Tooltip>
                <Tooltip texto={s.visible ? "Ocultar" : "Mostrar"}>
                  <button
                    type="button"
                    aria-pressed={s.visible}
                    aria-label={`${etiquetaSeccion(s.clave)}: ${s.visible ? "visible, pulsar para ocultar" : "oculto, pulsar para mostrar"}`}
                    onClick={() => setC({ secciones: c.secciones.map((x, j) => (j === i ? { ...x, visible: !x.visible } : x)) })}
                    className={botonIcono}
                  >
                    {s.visible ? <OjoIcon className="h-[15px] w-[15px]" /> : <OjoTachadoIcon className="h-[15px] w-[15px]" />}
                  </button>
                </Tooltip>
              </>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 border-l-[3px] border-border py-1 pl-2.5 text-xs text-muted-foreground">En Shopify, la landing va como la descripción del producto.</p>
    </div>
  );

  const listo = !faltantes.length && !cambiado;
  const pasosShopify: { texto: ReactNode; estado: "ok" | "curso" | "pendiente" | "falta" }[] = [
    { texto: faltantes.length ? `Completar lo que falta (${faltantes.length})` : cambiado ? "Guardar los cambios" : "Revisar que no falte nada", estado: listo ? "ok" : "falta" },
    {
      texto: (
        <>
          Crear el producto como borrador <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">{aNumero(e.precio) === null ? "sin precio" : f.format(aNumero(e.precio)!)}</code>
          {ofertas.filter((o) => o.precio !== null).length > 1 && <span className="text-muted-foreground"> · {ofertas.filter((o) => o.precio !== null).length} ofertas como variantes</span>}
        </>
      ),
      estado: shopify ? "ok" : enviando && !confirmarPublicar ? "curso" : "pendiente",
    },
    { texto: "Subir las imágenes a la tienda", estado: shopify ? "ok" : enviando && !confirmarPublicar ? "curso" : "pendiente" },
    { texto: "Publicar en la tienda", estado: estado === "publicada" ? "ok" : enviando && confirmarPublicar ? "curso" : "pendiente" },
  ];
  const pasoPublicar = (
    <div>
      <TituloPaso titulo="Publicar en Shopify">Primero se crea como borrador para revisarlo en la tienda. Cuando esté bien, se publica.</TituloPaso>
      <div className="flex flex-col gap-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className={labelClass}>Tienda</dt>
            <dd className="min-w-0 break-all rounded-md border border-border bg-muted/60 px-3 py-2 text-sm">{tiendaShopify ?? "Sin conectar"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={labelClass}>Producto</dt>
            <dd className="min-w-0 truncate rounded-md border border-border bg-muted/60 px-3 py-2 text-sm">{e.nombre || "—"}</dd>
          </div>
        </dl>

        {faltantes.length > 0 && (
          <Bloque titulo={`Falta para publicar (${faltantes.length})`}>
            <ul className="flex flex-col gap-2">
              {faltantes.map((x) => (
                <li key={x} className="flex items-center gap-2.5 text-sm">
                  <Punto estado="falta" />
                  {x}
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        <ul className="flex flex-col gap-2">
          {pasosShopify.map((p, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <Punto estado={p.estado} />
              <span className="min-w-0 flex-1">{p.texto}</span>
              <Quien de="shopify" />
            </li>
          ))}
        </ul>

        {puedeEscribir &&
          (tiendaShopify ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button type="button" variant={shopify ? "secondary" : "primary"} className="gap-2" disabled={enviando || cambiado || faltantes.length > 0} onClick={aShopify}>
                  <BolsaIcon className="h-4 w-4" />
                  {enviando && !confirmarPublicar ? "Enviando a Shopify…" : shopify ? "Actualizar en Shopify" : "Crear borrador en Shopify"}
                </Button>
                {shopify && estado !== "publicada" && !confirmarPublicar && (
                  <Button type="button" disabled={enviando || cambiado} onClick={() => setConfirmarPublicar(true)}>
                    Publicar en la tienda
                  </Button>
                )}
                {shopify?.url && estado !== "publicada" && (
                  <a href={shopify.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-primario underline-offset-2 hover:underline">
                    Ver borrador<span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </a>
                )}
              </div>
              {cambiado && <p className="text-sm text-muted-foreground">Guarda los cambios antes de enviarla a Shopify.</p>}
              {enviando && !confirmarPublicar && <p role="status" className="text-sm text-muted-foreground">Shopify está copiando las imágenes; tarda hasta un minuto.</p>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <BotonPendiente motivo="Falta conectar Shopify">Crear borrador en Shopify</BotonPendiente>
            </div>
          ))}

        {confirmarPublicar && (
          <div className="flex flex-col gap-2.5 rounded-[10px] border border-warning bg-warning-soft px-3.5 py-3">
            <p className="text-sm">
              <b>¿Publicar en la tienda?</b> Quedará visible para los clientes de {tiendaShopify}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={enviando} onClick={publicar}>
                {enviando ? "Publicando…" : "Sí, publicar"}
              </Button>
              <Button type="button" variant="secondary" disabled={enviando} onClick={() => setConfirmarPublicar(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {shopify && (
          <div className={`flex flex-col gap-2 rounded-[10px] border p-3.5 ${estado === "publicada" ? "border-success bg-success-soft" : "border-border bg-muted/60"}`}>
            <b className="text-sm">{estado === "publicada" ? "Publicada" : "Borrador en Shopify"}</b>
            {shopify.url && <div className="break-all rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs">{shopify.url}</div>}
            <p className="text-xs text-muted-foreground">
              Enviada el{" "}
              {new Date(shopify.publicadoEn ?? shopify.sincronizadoEn).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}
              {" · "}
              <a href={shopify.adminUrl} target="_blank" rel="noreferrer noopener" className="font-medium text-primario underline-offset-2 hover:underline">
                Abrir en el admin de Shopify<span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
              {estado === "publicada" && shopify.url && (
                <>
                  {" · "}
                  <a href={shopify.url} target="_blank" rel="noreferrer noopener" className="font-medium text-primario underline-offset-2 hover:underline">
                    Ver en la tienda<span className="sr-only"> (se abre en una pestaña nueva)</span>
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const contenidoPaso = [pasoProducto, pasoImagenes, pasoTextos, pasoSecciones, pasoPublicar][paso];
  const estadoVista = cambiado
    ? { color: "bg-warning", texto: "Cambios sin guardar" }
    : estado === "publicada"
      ? { color: "bg-success", texto: "Publicada en la tienda" }
      : shopify
        ? { color: "bg-azul", texto: "Borrador en Shopify" }
        : { color: "bg-warning", texto: "Borrador · sin publicar" };

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

      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground tabular-nums">
            Generador de landings / <span className="font-medium text-foreground">{numeroLanding(landing.numero)}</span>
          </p>
          <h2 className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2.5 text-[26px] font-bold leading-tight tracking-tight">
            <span className="min-w-0 truncate">{e.nombre || "Sin nombre"}</span>
            <Badge tone={TONO_ESTADO[estado] ?? "neutral"}>{etiquetaEstadoLanding(estado)}</Badge>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Cómo se arma la landing" className="flex w-full rounded-[10px] border border-border bg-muted p-[3px] sm:inline-flex sm:w-auto">
            {(
              [
                ["cero", "Crear desde cero", "Desde cero", DesdeCeroIcon],
                ["clonar", "Clonar una landing", "Clonar", ClonarIcon],
              ] as const
            ).map(([v, t, corto, Icono]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={e.modo === v}
                disabled={bloqueado}
                onClick={() => {
                  setE((x) => ({ ...x, modo: v }));
                  setPaso(0);
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none sm:px-3.5 ${e.modo === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icono className={`h-4 w-4 ${e.modo === v ? "text-primario" : ""}`} />
                <span className="sm:hidden">{corto}</span>
                <span className="hidden sm:inline">{t}</span>
              </button>
            ))}
          </div>
          {puedeEscribir &&
            (cambiado ? (
              <>
                <Button type="button" variant="secondary" disabled={guardando} onClick={() => setE(guardado)}>
                  Descartar
                </Button>
                <Button type="button" disabled={guardando} onClick={guardar}>
                  {guardando ? "Guardando…" : "Guardar cambios"}
                </Button>
              </>
            ) : confirmarEliminar ? (
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
      </div>

      <div role="tablist" aria-label="Pasos de la landing" className="flex gap-1.5 overflow-x-auto pb-1">
        {PASOS.map((p, i) => {
          const activo = paso === i;
          const hecho = !activo && (i < paso || (i === 4 && !!shopify));
          return (
            <button
              key={p}
              type="button"
              role="tab"
              id={`paso-${i}`}
              aria-selected={activo}
              aria-controls="panel-paso"
              onClick={() => setPaso(i)}
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border bg-card py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-colors ${activo ? "border-primario text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`grid h-[22px] w-[22px] place-items-center rounded-full font-mono text-[11px] tabular-nums ${activo ? "bg-primario text-white" : hecho ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
              {p}
            </button>
          );
        })}
      </div>

      <div className={`grid items-start gap-[18px] ${escritorio ? "xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)_410px]"}`}>
        <section id="panel-paso" role="tabpanel" aria-labelledby={`paso-${paso}`} className="min-w-0 rounded-[14px] border border-border bg-card p-5">
          {contenidoPaso}
          {paso < PASOS.length - 1 && (
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button type="button" variant="secondary" className="gap-2" onClick={() => setPaso(paso + 1)}>
                Siguiente: {PASOS[paso + 1]}
                <SiguienteIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>

        <section aria-label="Vista previa" className="flex min-w-0 flex-col gap-2.5 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div role="radiogroup" aria-label="Tamaño de la vista previa" className="inline-flex rounded-[10px] border border-border bg-muted p-[3px]">
              {(
                [
                  [false, "Móvil"],
                  [true, "Escritorio"],
                ] as const
              ).map(([v, t]) => (
                <button key={t} type="button" role="radio" aria-checked={escritorio === v} onClick={() => setEscritorio(v)} className={`rounded-[7px] px-2.5 py-1 text-xs font-medium ${escritorio === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${estadoVista.color}`} />
              {estadoVista.texto}
            </span>
          </div>
          <div
            className={`relative mx-auto w-full overflow-hidden border-zinc-900 bg-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.35)] ${escritorio ? "rounded-xl border-t-[30px]" : "max-w-[375px] rounded-[34px] border-[9px]"}`}
          >
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
            {cola && (
              <div role="status" className="absolute inset-0 z-10 grid place-items-center bg-[rgb(10_14_30/0.82)] p-5 text-[#eef1ff]">
                <div className="grid w-full max-w-[320px] gap-3">
                  <h3 className="text-lg font-bold">Generando imágenes…</h3>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                    <i className="block h-full rounded-full bg-[image:var(--neon)] transition-[width] duration-300" style={{ width: `${Math.round(((cola.hechas + 0.4) / Math.max(cola.total, 1)) * 100)}%` }} />
                  </div>
                  <ul className="grid gap-1.5 font-mono text-xs">
                    {ESPACIOS_IMAGEN.map((esp) => {
                      const ahora = generando.includes(esp.clave);
                      const lista = !!imagenes[esp.clave].ruta;
                      return (
                        <li key={esp.clave} className={`flex items-baseline gap-2 ${ahora ? "opacity-100" : lista ? "opacity-85" : "opacity-55"}`}>
                          <span className="shrink-0 rounded-full bg-[#1d3566] px-1.5 py-px text-[10px] text-[#c9dbff]">Gemini</span>
                          {esp.etiqueta}
                          {ahora ? " · ahora" : lista ? " · lista" : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
