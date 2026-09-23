"use client";

import { useState, type MutableRefObject } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { AdjuntoIcon, AlertaIcon, EnlaceIcon, InventarioIcon, MasIcon, PapeleraIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import {
  CATEGORIAS_DROPI,
  ETIQUETA_PUBLICACION,
  ETIQUETA_TIPO_DROPI,
  GARANTIAS,
  MIN_DESCRIPCION,
  MIN_IMAGENES,
  MIN_STOCK_PUBLICO,
  PUBLICACIONES,
  TIPOS_DROPI,
  cumpleStockPublico,
  sincronizarVariaciones,
  textoPlano,
  type Bodega,
  type ClaveGarantia,
  type ProductoDropiDatos,
  type Publicacion,
  type TipoDropi,
} from "@/lib/wms/producto-dropi";
import type { MedioDatos } from "@/lib/wms/producto";
import { BloqueMultimedia } from "../wms-productos/bloques-producto";
import { CampoChips, CampoNumero, CampoTexto, Casilla } from "../wms-productos/campos-producto";
import { EditorDescripcion } from "../wms-productos/editor-descripcion";
import { crearBodegaWms } from "./actions";

export interface PropsSeccion {
  d: ProductoDropiDatos;
  set: (cambios: Partial<ProductoDropiDatos>) => void;
  /** Se marca cuando la persona ya intentó guardar: los campos que faltan se señalan. */
  intento: boolean;
}

const MB = 1024 * 1024;

// ─── General ───────────────────────────────────────────────────────────────────────────────────────────────────

export function SeccionGeneral({ d, set, intento }: PropsSeccion) {
  const falta = (ok: boolean) => intento && !ok;

  function cambiarTipo(tipo: TipoDropi) {
    if (tipo === d.tipo) return;
    const mensaje =
      tipo === "variable"
        ? "¿Convertir a producto variable? Deberás configurar manualmente las nuevas variantes del producto."
        : "¿Convertir a producto simple? Se pierden las variaciones de este producto.";
    if (!confirm(mensaje)) return;
    set(tipo === "variable" ? { tipo, stock: {}, atributos: [], variaciones: [] } : { tipo, atributos: [], variaciones: [] });
  }

  return (
    <Seccion icono={ProductoIcon} titulo="General">
      <div id="dropi-seccion-general" className="flex flex-col gap-3">
        <CampoTexto etiqueta="Nombre del producto" valor={d.nombre} alCambiar={(nombre) => set({ nombre })} requerido invalido={falta(!!d.nombre.trim())} maxLength={255} placeholder="Ej: Perfume Her Loss 50 ML" />
        <Casilla texto="Crear un nombre diferente para la guía de envío" marcada={d.usar_nombre_guia} alCambiar={(usar_nombre_guia) => set({ usar_nombre_guia })} />
        {d.usar_nombre_guia && (
          <CampoTexto etiqueta="Nombre para la guía de envío" valor={d.nombre_guia} alCambiar={(nombre_guia) => set({ nombre_guia })} requerido invalido={falta(!!d.nombre_guia.trim())} maxLength={255} />
        )}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className={`${labelClassSm} mb-1`}>Elige cómo quieres publicar tu producto</legend>
          {PUBLICACIONES.map((p: Publicacion) => (
            <label key={p} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="dropi-publicacion" checked={d.publicacion === p} onChange={() => set({ publicacion: p })} className="mt-1 h-4 w-4 accent-[var(--foreground)]" />
              <span>
                <span className="font-medium">{ETIQUETA_PUBLICACION[p]}</span>
                <span className="block text-xs text-muted-foreground">{p === "publico" ? "Disponible para todos los dropshippers en el catálogo." : "Solo tú podrás ver y vender este producto."}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <CampoNumero etiqueta="Peso" paso="0.001" valor={d.peso} alCambiar={(peso) => set({ peso })} sufijo={<span className="text-sm text-muted-foreground">g</span>} />
          <CampoNumero etiqueta="Longitud" valor={d.longitud} alCambiar={(longitud) => set({ longitud })} sufijo={<span className="text-sm text-muted-foreground">cm</span>} />
          <CampoNumero etiqueta="Ancho" valor={d.ancho} alCambiar={(ancho) => set({ ancho })} sufijo={<span className="text-sm text-muted-foreground">cm</span>} />
          <CampoNumero etiqueta="Alto" valor={d.alto} alCambiar={(alto) => set({ alto })} sufijo={<span className="text-sm text-muted-foreground">cm</span>} />
        </div>
        {falta([d.peso, d.longitud, d.ancho, d.alto].every((n) => Number(n) > 0)) && (
          <p role="alert" className="text-xs text-destructive">
            El peso y las medidas son obligatorios.
          </p>
        )}

        {d.tipo === "simple" && (
          <div className="grid grid-cols-2 gap-3">
            <CampoNumero etiqueta="Precio" prefijo="$" valor={d.precio} alCambiar={(precio) => set({ precio })} placeholder="0.00" />
            <CampoNumero etiqueta="Precio sugerido" prefijo="$" valor={d.precio_sugerido} alCambiar={(precio_sugerido) => set({ precio_sugerido })} placeholder="0.00" />
          </div>
        )}
        {d.tipo === "simple" && falta(Number(d.precio) > 0 && Number(d.precio_sugerido) > 0) && (
          <p role="alert" className="text-xs text-destructive">
            El precio y el precio sugerido son obligatorios.
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Tipo</span>
          <select value={d.tipo} onChange={(e) => cambiarTipo(e.target.value as TipoDropi)} className={`${fieldClass} w-full`}>
            {TIPOS_DROPI.map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_DROPI[t]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0" aria-invalid={falta(d.categorias.length > 0) || undefined}>
          <legend className={`${labelClassSm} mb-1`}>
            Categoría<span aria-hidden="true" className="text-destructive"> *</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {CATEGORIAS_DROPI.map((c) => (
              <Casilla key={c} texto={c} marcada={d.categorias.includes(c)} alCambiar={(on) => set({ categorias: on ? [...d.categorias, c] : d.categorias.filter((x) => x !== c) })} />
            ))}
          </div>
          {falta(d.categorias.length > 0) && (
            <p role="alert" className="text-xs text-destructive">
              La categoría es obligatoria.
            </p>
          )}
        </fieldset>

        <CampoTexto etiqueta="SKU (Opcional)" valor={d.sku} alCambiar={(sku) => set({ sku })} maxLength={120} placeholder="Ej: KIT-RIEGO-001" />
        <Casilla texto="Aprobado" marcada={d.aprobado} alCambiar={(aprobado) => set({ aprobado })} />

        <EditorDescripcion etiqueta="Descripción" valor={d.descripcion} alCambiar={(descripcion) => set({ descripcion })} invalido={falta(textoPlano(d.descripcion).length >= MIN_DESCRIPCION)} />
        <p className={`text-xs tabular-nums ${falta(textoPlano(d.descripcion).length >= MIN_DESCRIPCION) ? "text-destructive" : "text-muted-foreground"}`}>
          {textoPlano(d.descripcion).length} de {MIN_DESCRIPCION} caracteres como mínimo
        </p>
        <EditorDescripcion etiqueta="Descripción Dropi App (Opcional)" valor={d.descripcion_app} alCambiar={(descripcion_app) => set({ descripcion_app })} />
      </div>
    </Seccion>
  );
}

// ─── Stock / Variables y stock ─────────────────────────────────────────────────────────────────────────────────

export function SeccionStock({
  d,
  set,
  intento,
  bodegas,
  paisId,
  alAgregarBodega,
  puedeEscribir,
}: PropsSeccion & { bodegas: Bodega[]; paisId: string; alAgregarBodega: (b: Bodega) => void; puedeEscribir: boolean }) {
  const [nueva, setNueva] = useState("");
  const [errorBodega, setErrorBodega] = useState<string | null>(null);
  const variable = d.tipo === "variable";

  async function agregarBodega() {
    setErrorBodega(null);
    const r = await crearBodegaWms(paisId, nueva).catch(() => ({ error: "No se pudo crear la bodega." }));
    if ("error" in r) setErrorBodega(r.error);
    else {
      alAgregarBodega(r.bodega);
      setNueva("");
    }
  }

  function cambiarAtributos(atributos: ProductoDropiDatos["atributos"]) {
    set({ atributos, variaciones: sincronizarVariaciones(atributos, d.variaciones, d.precio, d.precio_sugerido) });
  }

  const noCumple = d.publicacion === "publico" && !cumpleStockPublico(d);

  return (
    <Seccion icono={InventarioIcon} titulo={variable ? "Variables y stock" : "Stock"}>
      <div id="dropi-seccion-stock" className="flex flex-col gap-3">
        {variable && (
          <>
            {d.atributos.map((a, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-end gap-2">
                  <CampoTexto className="flex-1" etiqueta={`Atributo ${i + 1}`} valor={a.nombre} alCambiar={(nombre) => cambiarAtributos(d.atributos.map((x, k) => (k === i ? { ...x, nombre } : x)))} placeholder="Ej: COLOR" maxLength={60} />
                  <Tooltip texto="Quitar atributo">
                    <button type="button" onClick={() => cambiarAtributos(d.atributos.filter((_, k) => k !== i))} aria-label={`Quitar el atributo ${a.nombre || i + 1}`} className={`mb-1 flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
                      <PapeleraIcon className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
                <CampoChips etiqueta={`Valores de ${a.nombre || `el atributo ${i + 1}`}`} valores={a.valores} alCambiar={(valores) => cambiarAtributos(d.atributos.map((x, k) => (k === i ? { ...x, valores } : x)))} placeholder="Ej: ROJO, NEGRO, VERDE" />
              </div>
            ))}
            {d.atributos.length < 5 && (
              <button type="button" onClick={() => cambiarAtributos([...d.atributos, { nombre: "", valores: [] }])} className={`inline-flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                <MasIcon className="h-4 w-4" />
                Agregar atributo
              </button>
            )}
            {d.variaciones.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm" style={{ minWidth: `${34 + bodegas.length * 8}rem` }}>
                  <thead>
                    <tr className="bg-muted text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">Variación</th>
                      <th scope="col" className="px-2 py-2 font-medium">SKU</th>
                      <th scope="col" className="px-2 py-2 font-medium">Precio</th>
                      <th scope="col" className="px-2 py-2 font-medium">Precio sugerido</th>
                      {bodegas.map((b) => (
                        <th key={b.id} scope="col" className="px-2 py-2 font-medium">Stock · {b.nombre}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.variaciones.map((v, i) => {
                      const nombre = Object.values(v.combinacion).join(" / ");
                      const cambiar = (c: Partial<typeof v>) => set({ variaciones: d.variaciones.map((x, k) => (k === i ? { ...x, ...c } : x)) });
                      return (
                        <tr key={nombre}>
                          <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{nombre}</th>
                          <td className="px-2 py-1.5"><input type="text" value={v.sku} onChange={(e) => cambiar({ sku: e.target.value })} aria-label={`SKU de ${nombre}`} maxLength={120} className={`${fieldClass} w-full min-w-24`} /></td>
                          <td className="px-2 py-1.5"><CampoNumero prefijo="$" valor={v.precio} alCambiar={(precio) => cambiar({ precio })} ariaLabel={`Precio de ${nombre}`} /></td>
                          <td className="px-2 py-1.5"><CampoNumero prefijo="$" valor={v.precio_sugerido} alCambiar={(precio_sugerido) => cambiar({ precio_sugerido })} ariaLabel={`Precio sugerido de ${nombre}`} /></td>
                          {bodegas.map((b) => (
                            <td key={b.id} className="px-2 py-1.5">
                              <CampoNumero entero valor={v.stock[b.id] ?? 0} alCambiar={(n) => cambiar({ stock: { ...v.stock, [b.id]: n ?? 0 } })} ariaLabel={`Stock de ${nombre} en ${b.nombre}`} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {!variable && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[20rem] text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Bodega</th>
                  <th scope="col" className="w-32 px-2 py-2 font-medium">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bodegas.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">{b.nombre}</th>
                    <td className="px-2 py-1.5">
                      <CampoNumero entero valor={d.stock[b.id] ?? 0} alCambiar={(n) => set({ stock: { ...d.stock, [b.id]: n ?? 0 } })} ariaLabel={`Stock en ${b.nombre}`} />
                    </td>
                  </tr>
                ))}
                {bodegas.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-muted-foreground">Todavía no hay bodegas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {noCumple && (
          <p role={intento ? "alert" : undefined} className={`text-xs ${intento ? "text-destructive" : "text-muted-foreground"}`}>
            Producto público: al menos una bodega debe tener un mínimo de {MIN_STOCK_PUBLICO} unidades.
          </p>
        )}

        {puedeEscribir && (
          <div className="flex items-end gap-2">
            <CampoTexto className="flex-1" etiqueta="Agregar bodega" valor={nueva} alCambiar={setNueva} placeholder="Ej: Bodega Costa Rica" maxLength={120} />
            <button type="button" onClick={agregarBodega} disabled={!nueva.trim()} className={`mb-px rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`}>
              Agregar
            </button>
          </div>
        )}
        {errorBodega && (
          <p role="alert" className="text-xs text-destructive">
            {errorBodega}
          </p>
        )}
      </div>
    </Seccion>
  );
}

// ─── Imágenes y videos ─────────────────────────────────────────────────────────────────────────────────────────

/** Los medios de la ficha viven en una sola lista; cada sección trabaja con los de su tipo y los devuelve juntos. */
function medioDe(tipo: MedioDatos["tipo"], medios: MedioDatos[], nuevos: MedioDatos[]): MedioDatos[] {
  return tipo === "imagen" ? [...nuevos, ...medios.filter((m) => m.tipo === "video")] : [...medios.filter((m) => m.tipo === "imagen"), ...nuevos];
}

export function SeccionImagenes({ d, set, intento, archivos, avisar }: PropsSeccion & { archivos: MutableRefObject<Map<string, File>>; avisar: (m: string) => void }) {
  const imagenes = d.medios.filter((m) => m.tipo === "imagen");
  const falta = intento && d.publicacion === "publico" && imagenes.length < MIN_IMAGENES;
  return (
    <Seccion icono={AdjuntoIcon} titulo="Imagen del producto">
      <div id="dropi-seccion-imagenes" className="flex flex-col gap-3">
        <BloqueMultimedia
          envolver={false}
          conAlt={false}
          aceptar="image/jpeg,image/png,image/gif,image/webp"
          etiquetaBoton="Agregar una imagen"
          ayudaArrastrar="JPG, JPEG, PNG, GIF, WEBP · hasta 10 MB"
          medios={imagenes}
          archivos={archivos}
          maxBytes={10 * MB}
          alRechazar={(n) => avisar(`«${n}» pesa más de 10 MB.`)}
          alCambiar={(nuevos) => set({ medios: medioDe("imagen", d.medios, nuevos) })}
        />
        <p className={`text-xs tabular-nums ${falta ? "text-destructive" : "text-muted-foreground"}`} role={falta ? "alert" : undefined}>
          {imagenes.length} de {MIN_IMAGENES} imágenes como mínimo
        </p>
      </div>
    </Seccion>
  );
}

export function SeccionVideos({ d, set, archivos, existe }: PropsSeccion & { archivos: MutableRefObject<Map<string, File>>; existe: boolean }) {
  return (
    <Seccion icono={AdjuntoIcon} titulo="Videos Dropi App">
      {existe ? (
        <BloqueMultimedia
          envolver={false}
          conAlt={false}
          aceptar="video/*"
          etiquetaBoton="Cargar videos"
          ayudaArrastrar="o arrastrar videos aquí"
          medios={d.medios.filter((m) => m.tipo === "video")}
          archivos={archivos}
          alCambiar={(nuevos) => set({ medios: medioDe("video", d.medios, nuevos) })}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Crea tu producto, luego podrás agregar videos editándolo.</p>
      )}
    </Seccion>
  );
}

// ─── Recursos adicionales ──────────────────────────────────────────────────────────────────────────────────────

export function SeccionRecursos({ d, set, existe }: PropsSeccion & { existe: boolean }) {
  return (
    <Seccion icono={EnlaceIcon} titulo="Recursos adicionales">
      {!existe ? (
        <p className="text-sm text-muted-foreground">Para crear recursos adicionales, guarda el producto primero.</p>
      ) : (
        <>
          {d.recursos.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end gap-2">
              <CampoTexto etiqueta={`Título del recurso ${i + 1}`} valor={r.titulo} alCambiar={(titulo) => set({ recursos: d.recursos.map((x, k) => (k === i ? { ...x, titulo } : x)) })} placeholder="Ej: Ficha técnica" maxLength={120} />
              <CampoTexto etiqueta={`Enlace del recurso ${i + 1}`} valor={r.url} alCambiar={(url) => set({ recursos: d.recursos.map((x, k) => (k === i ? { ...x, url } : x)) })} placeholder="https://" maxLength={500} />
              <Tooltip texto="Quitar recurso">
                <button type="button" onClick={() => set({ recursos: d.recursos.filter((_, k) => k !== i) })} aria-label={`Quitar el recurso ${r.titulo || i + 1}`} className={`mb-1 flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
                  <PapeleraIcon className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          ))}
          <button type="button" onClick={() => set({ recursos: [...d.recursos, { titulo: "", url: "" }] })} className={`inline-flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            <MasIcon className="h-4 w-4" />
            Agregar recurso
          </button>
        </>
      )}
    </Seccion>
  );
}

// ─── Productos privados ────────────────────────────────────────────────────────────────────────────────────────

export function SeccionPrivados({ d, set }: PropsSeccion) {
  return (
    <Seccion icono={PersonaIcon} titulo="Productos privados">
      {d.privados.map((p, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`dropi-privado-correo-${i}`}>Correo {i + 1}</label>
            <input id={`dropi-privado-correo-${i}`} type="email" value={p.correo} onChange={(e) => set({ privados: d.privados.map((x, k) => (k === i ? { ...x, correo: e.target.value } : x)) })} placeholder="Ej: dropshipper@correo.com" maxLength={200} className={`${fieldClass} w-full min-w-0`} />
          </div>
          <CampoNumero etiqueta={`Cantidad ${i + 1}`} entero valor={p.cantidad} alCambiar={(n) => set({ privados: d.privados.map((x, k) => (k === i ? { ...x, cantidad: n ?? 0 } : x)) })} />
          <Tooltip texto="Quitar correo">
            <button type="button" onClick={() => set({ privados: d.privados.filter((_, k) => k !== i) })} aria-label={`Quitar el correo ${p.correo || i + 1}`} className={`mb-1 flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
              <PapeleraIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      ))}
      <button type="button" onClick={() => set({ privados: [...d.privados, { correo: "", cantidad: 0 }] })} className={`inline-flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
        <MasIcon className="h-4 w-4" />
        Agregar correo
      </button>
    </Seccion>
  );
}

// ─── Garantías ─────────────────────────────────────────────────────────────────────────────────────────────────

export function SeccionGarantias({ d, set }: PropsSeccion) {
  function cambiar(clave: ClaveGarantia, c: Partial<ProductoDropiDatos["garantias"][ClaveGarantia]>) {
    set({ garantias: { ...d.garantias, [clave]: { ...d.garantias[clave], ...c } } });
  }
  return (
    <Seccion icono={AlertaIcon} titulo="Garantías por defecto">
      {GARANTIAS.map((g) => {
        const x = d.garantias[g.clave];
        return (
          <div key={g.clave} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Casilla texto={g.etiqueta} marcada={x.activa} alCambiar={(activa) => cambiar(g.clave, { activa })} />
            <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
              <CampoNumero etiqueta={`Días de ${g.etiqueta.toLowerCase()}`} entero valor={x.dias} alCambiar={(n) => cambiar(g.clave, { dias: n ?? 0 })} disabled={!x.activa} />
              <CampoTexto etiqueta={`Observaciones de ${g.etiqueta.toLowerCase()}`} valor={x.observaciones} alCambiar={(observaciones) => cambiar(g.clave, { observaciones })} disabled={!x.activa} maxLength={500} placeholder="Observaciones" />
            </div>
          </div>
        );
      })}
    </Seccion>
  );
}
