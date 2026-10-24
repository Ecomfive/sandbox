"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useEffect, useRef, useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { AdjuntoIcon, EtiquetaIcon, InventarioIcon, ListaIcon, ProductoIcon } from "@/lib/nav-icons";
import { MAX_FOTOS_CREAR, MIN_DESCRIPCION_CREAR, MIN_FOTOS_CREAR, MIN_STOCK_CREAR, PESO_MAXIMO_G, type DatosCrearDropi, type OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { descripcionAHtml, medirDescripcion } from "@/lib/publicaciones/descripcion-dropi";
import { supabase } from "@/lib/supabase/client";
import { prepararSubidaFotoBorrador } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const PREFIJO_PUBLICO = "/storage/v1/object/public/wms-productos/";

interface FotoSubida {
  ruta: string;
  url: string;
}

/** La ruta de Storage de una foto a partir de su dirección pública (las guardadas en los datos para Dropi son direcciones). */
function rutaDe(url: string): string {
  const i = url.indexOf(PREFIJO_PUBLICO);
  return i >= 0 ? url.slice(i + PREFIJO_PUBLICO.length) : url;
}

/** El HTML de una descripción guardada, otra vez como texto con párrafos y viñetas para editarlo. */
function htmlATexto(html: string): string {
  return html
    .replace(/<li>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|ul|h\d)>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Todo lo que Dropi pide para publicar un producto nuevo (leído de su pantalla «Crear producto», 24 oct 2026): peso en gramos, largo, ancho y
 * alto en cm, categoría, descripción de 200 caracteres como mínimo, una bodega con 100 unidades o más y 3 fotos como mínimo (producto público).
 * Los campos viajan con el formulario como `dd_*`; las categorías y las fotos, como listas en JSON. Se usa en «Agregar» y en la ficha de una
 * publicación «Sin publicar».
 */
export function CamposDatosDropi({
  opciones,
  inicial,
  faltante = null,
  invalido = () => undefined,
  idBase = "dd",
}: {
  opciones: OpcionesCrear;
  inicial: DatosCrearDropi | null;
  faltante?: string | null;
  invalido?: (id: string) => true | undefined;
  idBase?: string;
}) {
  const { mostrarToast } = useToast();
  const [categorias, setCategorias] = useState<string[]>(inicial?.categorias ?? []);
  const [otraCategoria, setOtraCategoria] = useState("");
  const [fotos, setFotos] = useState<FotoSubida[]>((inicial?.fotos ?? []).map((f) => ({ ruta: rutaDe(f.url), url: f.url })));
  const [subiendo, setSubiendo] = useState(false);
  const [descripcion, setDescripcion] = useState(inicial ? htmlATexto(inicial.descripcion) : "");
  const campoDescripcion = useRef<HTMLTextAreaElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const medida = medirDescripcion(descripcionAHtml(descripcion));
  const todasLasCategorias = [...new Set([...opciones.categorias, ...categorias])];
  const bodega = inicial?.bodegas[0] ?? null;

  // La descripción no llega al mínimo: el navegador no deja crear (mismo mecanismo que un campo obligatorio vacío).
  useEffect(() => {
    campoDescripcion.current?.setCustomValidity(medida.cumple ? "" : `La descripción necesita al menos ${MIN_DESCRIPCION_CREAR} caracteres.`);
  }, [medida.cumple]);

  const alternar = (c: string) => setCategorias((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c].slice(0, 5)));
  function agregarCategoria() {
    const c = otraCategoria.trim().slice(0, 60);
    if (c && !categorias.includes(c)) setCategorias((a) => [...a, c].slice(0, 5));
    setOtraCategoria("");
  }

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    try {
      for (const f of [...archivos]) {
        if (fotos.length + 1 > MAX_FOTOS_CREAR) {
          mostrarToast(`Hasta ${MAX_FOTOS_CREAR} fotos.`, "destructive");
          break;
        }
        if (!TIPOS_FOTO.includes(f.type)) {
          mostrarToast(`«${f.name}» no es una imagen JPG, PNG o WebP.`, "destructive");
          continue;
        }
        if (f.size > MAX_BYTES) {
          mostrarToast(`«${f.name}» pesa más de 10 MB, que es lo que admite Dropi.`, "destructive");
          continue;
        }
        const permiso = await prepararSubidaFotoBorrador(f.name);
        if ("error" in permiso) {
          mostrarToast(permiso.error, "destructive");
          continue;
        }
        const { error } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type });
        if (error) {
          mostrarToast(`No se pudo subir «${f.name}».`, "destructive");
          continue;
        }
        setFotos((a) => [...a, { ruta: permiso.ruta, url: permiso.url }]);
      }
    } finally {
      setSubiendo(false);
      if (selector.current) selector.current.value = "";
    }
  }

  const id = (n: string) => `${idBase}-${n}`;
  return (
    <>
      <Seccion icono={ProductoIcon} titulo="Peso y medidas">
        <Campo etiqueta="Peso (g)" id={id("peso")} obligatorio faltante={faltante}>
          <input id={id("peso")} name="dd_peso" type="number" required min={0.001} max={PESO_MAXIMO_G} step="any" defaultValue={inicial?.peso ?? ""} aria-invalid={invalido(id("peso"))} placeholder="Ej: 120" className={`${fieldClass} w-full tabular-nums`} />
        </Campo>
        <div className="grid grid-cols-3 gap-3">
          <Campo etiqueta="Largo (cm)" id={id("largo")} obligatorio faltante={faltante}>
            <input id={id("largo")} name="dd_largo" type="number" required min={0.001} step="any" defaultValue={inicial?.largo ?? ""} aria-invalid={invalido(id("largo"))} placeholder="Ej: 8" className={`${fieldClass} w-full tabular-nums`} />
          </Campo>
          <Campo etiqueta="Ancho (cm)" id={id("ancho")} obligatorio faltante={faltante}>
            <input id={id("ancho")} name="dd_ancho" type="number" required min={0.001} step="any" defaultValue={inicial?.ancho ?? ""} aria-invalid={invalido(id("ancho"))} placeholder="Ej: 8" className={`${fieldClass} w-full tabular-nums`} />
          </Campo>
          <Campo etiqueta="Alto (cm)" id={id("alto")} obligatorio faltante={faltante}>
            <input id={id("alto")} name="dd_alto" type="number" required min={0.001} step="any" defaultValue={inicial?.alto ?? ""} aria-invalid={invalido(id("alto"))} placeholder="Ej: 12" className={`${fieldClass} w-full tabular-nums`} />
          </Campo>
        </div>
      </Seccion>

      <Seccion icono={EtiquetaIcon} titulo="Categoría">
        <input type="hidden" name="dd_categorias" value={JSON.stringify(categorias)} />
        <Campo etiqueta="Categorías de Dropi" id={id("categorias")} obligatorio faltante={faltante}>
          <div id={id("categorias-grupo")} tabIndex={-1} className="flex flex-wrap gap-1.5 outline-none">
            {todasLasCategorias.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={categorias.includes(c)}
                onClick={() => alternar(c)}
                className={`min-h-8 rounded-full border px-3 text-xs font-medium ${anilloFoco} ${categorias.includes(c) ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}
              >
                {c}
              </button>
            ))}
          </div>
          {/* Campo que el navegador valida: vacío mientras no haya una categoría (los botones de arriba no son campos). */}
          <input id={id("categorias")} data-destino={id("categorias-grupo")} required value={categorias.join(",")} onChange={() => {}} tabIndex={-1} aria-label="Categorías elegidas" aria-invalid={invalido(id("categorias"))} className="sr-only" />
        </Campo>
        <div className="flex gap-2">
          <input
            value={otraCategoria}
            onChange={(e) => setOtraCategoria(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarCategoria();
              }
            }}
            aria-label="Otra categoría de Dropi"
            placeholder="Otra categoría. Ej: Mascotas"
            maxLength={60}
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <button type="button" onClick={agregarCategoria} disabled={!otraCategoria.trim()} className={`inline-flex min-h-10 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`}>
            Agregar
          </button>
        </div>
      </Seccion>

      <Seccion icono={ListaIcon} titulo="Descripción">
        <Campo etiqueta="Descripción para Dropi" id={id("descripcion")} obligatorio faltante={faltante} mensaje={`Necesita al menos ${MIN_DESCRIPCION_CREAR} caracteres`}>
          <textarea
            id={id("descripcion")}
            ref={campoDescripcion}
            name="dd_descripcion"
            required
            rows={8}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            aria-invalid={invalido(id("descripcion"))}
            placeholder="Qué es, para qué sirve, cómo se usa y qué trae. Deja una línea en blanco entre párrafos y empieza con «- » cada punto de una lista."
            className={`${fieldClass} w-full resize-y`}
          />
        </Campo>
        <p className={`m-0 text-xs tabular-nums ${medida.cumple ? "text-success" : "text-warning"}`}>
          {medida.largo.toLocaleString("es-PA")} caracteres · mínimo {MIN_DESCRIPCION_CREAR}
        </p>
      </Seccion>

      <Seccion icono={InventarioIcon} titulo="Stock inicial">
        {opciones.bodegas.length === 0 ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            Todavía no se leyeron las bodegas de ECOMFIVE en Dropi: lee «Mis productos» de Dropi primero.
          </p>
        ) : null}
        <Campo etiqueta="Bodega de ECOMFIVE" id={id("bodega")} obligatorio faltante={faltante}>
          <select id={id("bodega")} name="dd_bodega" required defaultValue={bodega?.id ?? opciones.bodegas[0]?.id ?? ""} aria-invalid={invalido(id("bodega"))} className={`${fieldClass} w-full`}>
            {opciones.bodegas.length === 0 && <option value="">Sin bodegas leídas</option>}
            {opciones.bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Unidades" id={id("unidades")} obligatorio faltante={faltante} mensaje={`Dropi pide ${MIN_STOCK_CREAR} o más`}>
          <input id={id("unidades")} name="dd_unidades" type="number" required min={MIN_STOCK_CREAR} step={1} defaultValue={bodega?.unidades ?? MIN_STOCK_CREAR} aria-invalid={invalido(id("unidades"))} className={`${fieldClass} w-full tabular-nums`} />
        </Campo>
      </Seccion>

      <Seccion icono={AdjuntoIcon} titulo="Fotos">
        <input type="hidden" name="dd_fotos" value={JSON.stringify(fotos.map((f) => f.ruta))} />
        <Campo etiqueta={`Fotos del producto (mínimo ${MIN_FOTOS_CREAR})`} id={id("fotos")} obligatorio faltante={faltante} mensaje={`Sube al menos ${MIN_FOTOS_CREAR} fotos`}>
          <div id={id("fotos-grupo")} tabIndex={-1} className="flex flex-col gap-2 outline-none">
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {fotos.map((f, i) => (
                <li key={f.ruta} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                  <img src={f.url} alt={`Foto ${i + 1}${i === 0 ? " (principal)" : ""}`} loading="lazy" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute top-1 left-1 rounded-full bg-card/90 px-2 py-0.5 text-[11px] font-medium">Principal</span>}
                  <button type="button" onClick={() => setFotos((a) => a.filter((x) => x.ruta !== f.ruta))} aria-label={`Quitar la foto ${i + 1}`} className={`absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-sm font-semibold shadow-sm hover:bg-card ${anilloFoco}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <input ref={selector} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden id={id("fotos-archivo")} onChange={(e) => subir(e.target.files)} />
              <button type="button" disabled={subiendo || fotos.length >= MAX_FOTOS_CREAR} onClick={() => selector.current?.click()} className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`}>
                <AdjuntoIcon aria-hidden="true" className="h-4 w-4" />
                {subiendo ? "Subiendo…" : fotos.length ? "Agregar más fotos" : "Subir fotos"}
              </button>
            </div>
          </div>
          {/* Campo que el navegador valida: con menos de tres fotos no es válido (tres rutas separadas por comas). */}
          <input id={id("fotos")} data-destino={id("fotos-grupo")} required pattern="(?:[^,]+,){2,}[^,]+" value={fotos.map((f) => f.ruta).join(",")} onChange={() => {}} tabIndex={-1} aria-label="Fotos subidas" aria-invalid={invalido(id("fotos"))} className="sr-only" />
        </Campo>
      </Seccion>
    </>
  );
}
