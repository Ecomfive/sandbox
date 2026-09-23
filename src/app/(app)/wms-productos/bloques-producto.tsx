"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, FlechaArribaIcon, MasIcon, PapeleraIcon } from "@/lib/nav-icons";
import { formatearMoneda } from "@/lib/formato";
import {
  CATEGORIAS_SUGERIDAS,
  EMBALAJE_PREDETERMINADO,
  MAX_OPCIONES,
  MAX_SEO_DESCRIPCION,
  MAX_SEO_TITULO,
  UNIDADES_PESO,
  enExistencia,
  gananciaYMargen,
  slugificar,
  sincronizarVariantes,
  type MedioDatos,
  type ProductoDatos,
  type UnidadPeso,
  type VarianteDatos,
} from "@/lib/wms/producto";
import { CampoChips, CampoNumero, CampoTexto, Casilla, Interruptor, Tarjeta } from "./campos-producto";

export interface PropsBloque {
  d: ProductoDatos;
  set: (cambios: Partial<ProductoDatos>) => void;
  codigoPais: string;
}

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/${ruta}`;
const sucursalesDe = (d: ProductoDatos) => d.variantes[0]?.inventario.map((i) => i.sucursal) ?? [];
const conOpciones = (d: ProductoDatos) => d.opciones.length > 0;

function actualizarVariante(d: ProductoDatos, set: PropsBloque["set"], indice: number, cambios: Partial<VarianteDatos>) {
  set({ variantes: d.variantes.map((v, i) => (i === indice ? { ...v, ...cambios } : v)) });
}

// ─── Multimedia ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Imágenes y videos del producto, en el orden en que se ven (la primera es la portada). Los archivos recién elegidos
 * se guardan aparte (`archivos`) hasta que se guarda el producto; aquí solo se ve su vista previa.
 */
export function BloqueMultimedia({
  medios,
  alCambiar,
  archivos,
}: {
  medios: MedioDatos[];
  alCambiar: (m: MedioDatos[]) => void;
  archivos: MutableRefObject<Map<string, File>>;
}) {
  // Vista previa (URL local) de cada archivo recién elegido, por su `tempId`.
  const [previas, setPrevias] = useState<Record<string, string>>({});
  const previasVivas = useRef(previas);
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    previasVivas.current = previas;
  }, [previas]);
  useEffect(() => {
    return () => Object.values(previasVivas.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function agregar(lista: FileList | null) {
    if (!lista) return;
    const nuevos: MedioDatos[] = [];
    const urls: Record<string, string> = {};
    for (const archivo of Array.from(lista)) {
      const esVideo = archivo.type.startsWith("video/");
      if (!esVideo && !archivo.type.startsWith("image/")) continue;
      const tempId = crypto.randomUUID();
      archivos.current.set(tempId, archivo);
      urls[tempId] = URL.createObjectURL(archivo);
      nuevos.push({ tempId, nombre_archivo: archivo.name, tipo: esVideo ? "video" : "imagen", alt: "" });
    }
    if (nuevos.length > 0) {
      setPrevias((p) => ({ ...p, ...urls }));
      alCambiar([...medios, ...nuevos]);
    }
    if (entrada.current) entrada.current.value = "";
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= medios.length) return;
    const copia = [...medios];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    alCambiar(copia);
  }

  function quitar(i: number) {
    const m = medios[i];
    if (m.tempId) {
      archivos.current.delete(m.tempId);
      const temp = m.tempId;
      const url = previas[temp];
      if (url) URL.revokeObjectURL(url);
      setPrevias(({ [temp]: _quitada, ...resto }) => {
        void _quitada;
        return resto;
      });
    }
    alCambiar(medios.filter((_, k) => k !== i));
  }

  const origen = (m: MedioDatos) => (m.tempId ? previas[m.tempId] : m.ruta ? urlPublica(m.ruta) : undefined);

  return (
    <Tarjeta titulo="Multimedia">
      {medios.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {medios.map((m, i) => (
            <li key={m.id ?? m.tempId} className={`flex flex-col gap-1.5 ${i === 0 ? "col-span-2 row-span-1 sm:col-span-1" : ""}`}>
              <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                {m.tipo === "video" ? (
                  <video src={origen(m)} controls className="h-full w-full object-cover" aria-label={m.nombre_archivo || "Video del producto"} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={origen(m)} alt={m.alt || m.nombre_archivo} className="h-full w-full object-cover" />
                )}
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">Portada</span>
                )}
              </div>
              <input
                type="text"
                value={m.alt}
                onChange={(e) => alCambiar(medios.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))}
                aria-label={`Texto alternativo del archivo ${i + 1}`}
                placeholder="Texto alternativo"
                maxLength={512}
                className={`${fieldClassSm} w-full`}
              />
              <div className="flex items-center gap-1">
                <Tooltip texto="Mover antes">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Mover antes el archivo ${i + 1}`} className={`flex h-7 w-7 items-center justify-center hover:bg-muted disabled:opacity-30 ${anilloFoco}`}>
                    <FlechaArribaIcon className="h-4 w-4 -rotate-90" />
                  </button>
                </Tooltip>
                <Tooltip texto="Mover después">
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === medios.length - 1} aria-label={`Mover después el archivo ${i + 1}`} className={`flex h-7 w-7 items-center justify-center hover:bg-muted disabled:opacity-30 ${anilloFoco}`}>
                    <FlechaArribaIcon className="h-4 w-4 rotate-90" />
                  </button>
                </Tooltip>
                <span className="flex-1" />
                <Tooltip texto="Quitar archivo">
                  <button type="button" onClick={() => quitar(i)} aria-label={`Quitar el archivo ${i + 1}`} className={`flex h-7 w-7 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
                    <PapeleraIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          agregar(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 ${arrastrando ? "border-foreground bg-muted" : "border-border-control"}`}
      >
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className={`inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}
        >
          <MasIcon className="h-4 w-4" />
          Agregar archivos
        </button>
        <span className="text-xs text-muted-foreground">o arrastrar imágenes y videos aquí</span>
        <input ref={entrada} type="file" accept="image/*,video/*" multiple onChange={(e) => agregar(e.target.files)} aria-label="Elegir imágenes o videos" className="sr-only" />
      </div>
    </Tarjeta>
  );
}

// ─── Categoría ────────────────────────────────────────────────────────────────────────────────────────────────

export function BloqueCategoria({ d, set }: PropsBloque) {
  return (
    <Tarjeta>
      <CampoTexto etiqueta="Categoría" valor={d.categoria} alCambiar={(categoria) => set({ categoria })} lista="wms-categorias" placeholder="Ej: Casa y jardín > Jardinería" maxLength={200} />
      <datalist id="wms-categorias">
        {CATEGORIAS_SUGERIDAS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </Tarjeta>
  );
}

// ─── Precio ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Precio, precio de comparación, impuesto y costo del producto sin variantes (con variantes esto va en cada fila). */
export function BloquePrecio({ d, set, codigoPais }: PropsBloque) {
  const v = d.variantes[0];
  const cambiar = (c: Partial<VarianteDatos>) => actualizarVariante(d, set, 0, c);
  const resultado = gananciaYMargen(v.precio, v.costo);
  return (
    <Tarjeta titulo="Precio">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoNumero etiqueta="Precio" prefijo="$" valor={v.precio} alCambiar={(precio) => cambiar({ precio })} placeholder="0.00" />
        <CampoNumero etiqueta="Precio de comparación" prefijo="$" valor={v.precio_comparacion} alCambiar={(precio_comparacion) => cambiar({ precio_comparacion })} placeholder="0.00" />
      </div>
      <Casilla texto="Cobrar impuesto sobre este producto" marcada={d.cobrar_impuesto} alCambiar={(cobrar_impuesto) => set({ cobrar_impuesto })} />
      <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
        <CampoNumero etiqueta="Costo por artículo" prefijo="$" valor={v.costo} alCambiar={(costo) => cambiar({ costo })} placeholder="0.00" />
        <div className="flex flex-col gap-1">
          <span className={labelClassSm}>Ganancia</span>
          <span className="py-2 text-sm tabular-nums">{resultado ? formatearMoneda(resultado.ganancia, codigoPais) : "--"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelClassSm}>Margen</span>
          <span className="py-2 text-sm tabular-nums">{resultado?.margen != null ? `${resultado.margen.toFixed(2)} %` : "--"}</span>
        </div>
      </div>
    </Tarjeta>
  );
}

// ─── Inventario ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Inventario: seguimiento, sucursales, SKU, códigos de barras y «vender sin existencias». Sin variantes muestra la tabla
 * de cantidades (no disponible, comprometido, disponible y en existencia); con variantes las cantidades van en la
 * tabla de cada variante y aquí queda la gestión de sucursales.
 */
export function BloqueInventario({ d, set }: PropsBloque) {
  const [nueva, setNueva] = useState("");
  const sucursales = sucursalesDe(d);
  const simple = !conOpciones(d);
  const v = d.variantes[0];

  function agregarSucursal() {
    const nombre = nueva.trim();
    if (!nombre || sucursales.some((s) => s.toLowerCase() === nombre.toLowerCase())) return;
    set({ variantes: d.variantes.map((x) => ({ ...x, inventario: [...x.inventario, { sucursal: nombre, disponible: 0, comprometido: 0, no_disponible: 0 }] })) });
    setNueva("");
  }

  function quitarSucursal(nombre: string) {
    if (sucursales.length <= 1) return;
    set({ variantes: d.variantes.map((x) => ({ ...x, inventario: x.inventario.filter((i) => i.sucursal !== nombre) })) });
  }

  function cambiarCantidad(sucursal: string, campo: "disponible" | "comprometido" | "no_disponible", valor: number | null) {
    actualizarVariante(d, set, 0, { inventario: v.inventario.map((i) => (i.sucursal === sucursal ? { ...i, [campo]: valor ?? 0 } : i)) });
  }

  return (
    <Tarjeta titulo="Inventario">
      <Casilla texto="Inventario con seguimiento" marcada={d.seguimiento_inventario} alCambiar={(seguimiento_inventario) => set({ seguimiento_inventario })} />

      {d.seguimiento_inventario && simple && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="bg-muted text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Sucursales</th>
                <th scope="col" className="px-3 py-2 font-medium">No disponible</th>
                <th scope="col" className="px-3 py-2 font-medium">Comprometido</th>
                <th scope="col" className="px-3 py-2 font-medium">Disponible</th>
                <th scope="col" className="px-3 py-2 font-medium">En existencia</th>
                <th scope="col" className="w-10 px-1 py-2"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {v.inventario.map((i) => (
                <tr key={i.sucursal}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">{i.sucursal}</th>
                  <td className="px-2 py-1.5"><CampoNumero entero valor={i.no_disponible} alCambiar={(x) => cambiarCantidad(i.sucursal, "no_disponible", x)} ariaLabel={`No disponible en ${i.sucursal}`} /></td>
                  <td className="px-2 py-1.5"><CampoNumero entero valor={i.comprometido} alCambiar={(x) => cambiarCantidad(i.sucursal, "comprometido", x)} ariaLabel={`Comprometido en ${i.sucursal}`} /></td>
                  <td className="px-2 py-1.5"><CampoNumero entero min={-999999} valor={i.disponible} alCambiar={(x) => cambiarCantidad(i.sucursal, "disponible", x)} ariaLabel={`Disponible en ${i.sucursal}`} /></td>
                  <td className="px-3 py-2 tabular-nums">{enExistencia(i)}</td>
                  <td className="px-1 py-1.5">
                    {sucursales.length > 1 && (
                      <Tooltip texto="Quitar sucursal">
                        <button type="button" onClick={() => quitarSucursal(i.sucursal)} aria-label={`Quitar la sucursal ${i.sucursal}`} className={`flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-destructive ${anilloFoco}`}>
                          <CerrarIcon className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.seguimiento_inventario && !simple && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Sucursales">
          {sucursales.map((s) => (
            <li key={s} className="flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-1 text-xs">
              {s}
              {sucursales.length > 1 && (
                <button type="button" onClick={() => quitarSucursal(s)} aria-label={`Quitar la sucursal ${s}`} className={`flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground ${anilloFoco}`}>
                  <CerrarIcon className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {d.seguimiento_inventario && (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className={labelClassSm}>Agregar sucursal</span>
            <input
              type="text"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarSucursal();
                }
              }}
              placeholder="Ej: Bodega Panamá"
              maxLength={80}
              className={`${fieldClass} w-full min-w-0`}
            />
          </label>
          <button type="button" onClick={agregarSucursal} disabled={!nueva.trim()} className={`rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`}>
            Agregar
          </button>
        </div>
      )}

      {simple && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <CampoTexto etiqueta="SKU (código de referencia)" valor={v.sku} alCambiar={(sku) => actualizarVariante(d, set, 0, { sku })} placeholder="Ej: KIT-RIEGO-001" maxLength={120} />
          <CampoTexto etiqueta="Código de barras (ISBN, UPC, GTIN…)" valor={v.codigo_barras} alCambiar={(codigo_barras) => actualizarVariante(d, set, 0, { codigo_barras })} placeholder="Ej: 7501031311309" maxLength={60} />
        </div>
      )}
      <Casilla texto="Vender sin existencias" marcada={d.vender_sin_existencias} alCambiar={(vender_sin_existencias) => set({ vender_sin_existencias })} />
    </Tarjeta>
  );
}

// ─── Envío ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function BloqueEnvio({ d, set }: PropsBloque) {
  const v = d.variantes[0];
  const simple = !conOpciones(d);
  return (
    <Tarjeta
      titulo="Envío"
      accion={
        <span className="flex items-center gap-2 text-sm">
          Producto físico
          <Interruptor etiqueta="Producto físico" activo={d.es_fisico} alCambiar={(es_fisico) => set({ es_fisico })} />
        </span>
      }
    >
      {d.es_fisico && (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <CampoTexto etiqueta="Embalaje" valor={d.embalaje} alCambiar={(embalaje) => set({ embalaje })} lista="wms-embalajes" placeholder={EMBALAJE_PREDETERMINADO} maxLength={120} />
            <datalist id="wms-embalajes">
              {[EMBALAJE_PREDETERMINADO, "Caja pequeña", "Caja mediana", "Caja grande", "Sobre acolchado", "Bolsa"].map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
            {simple && (
              <CampoNumero
                etiqueta="Peso del producto"
                paso="0.001"
                valor={v.peso}
                alCambiar={(peso) => actualizarVariante(d, set, 0, { peso })}
                placeholder="0.0"
                sufijo={
                  <select
                    aria-label="Unidad de peso"
                    value={v.unidad_peso}
                    onChange={(e) => actualizarVariante(d, set, 0, { unidad_peso: e.target.value as UnidadPeso })}
                    className={`${fieldClass} w-16 shrink-0`}
                  >
                    {UNIDADES_PESO.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                }
              />
            )}
          </div>
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <CampoTexto etiqueta="País o región de origen" valor={d.pais_origen} alCambiar={(pais_origen) => set({ pais_origen })} placeholder="Ej: China" maxLength={80} />
            <CampoTexto etiqueta="Código del Sistema Armonizado (SA)" valor={d.codigo_sa} alCambiar={(codigo_sa) => set({ codigo_sa })} placeholder="Ej: 8424.89" maxLength={20} />
          </div>
        </>
      )}
    </Tarjeta>
  );
}

// ─── Variantes ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Opciones (talla, color…) y la tabla de variantes que sale de combinarlas; cada fila lleva su precio, costo, SKU, peso y cantidades. */
export function BloqueVariantes({ d, set, codigoPais }: PropsBloque) {
  const sucursales = sucursalesDe(d);

  function cambiarOpciones(opciones: ProductoDatos["opciones"]) {
    set({ opciones, variantes: sincronizarVariantes(opciones, d.variantes, sucursales) });
  }

  const opcionVacia = { nombre: "", valores: [] as string[] };

  return (
    <Tarjeta titulo="Variantes">
      {d.opciones.map((o, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex items-end gap-2">
            <CampoTexto
              className="flex-1"
              etiqueta={`Nombre de la opción ${i + 1}`}
              valor={o.nombre}
              alCambiar={(nombre) => cambiarOpciones(d.opciones.map((x, k) => (k === i ? { ...x, nombre } : x)))}
              placeholder={["Ej: Talla", "Ej: Color", "Ej: Material"][i]}
              maxLength={60}
            />
            <Tooltip texto="Quitar opción">
              <button type="button" onClick={() => cambiarOpciones(d.opciones.filter((_, k) => k !== i))} aria-label={`Quitar la opción ${o.nombre || i + 1}`} className={`mb-1 flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
                <PapeleraIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
          <CampoChips
            etiqueta={`Valores de ${o.nombre || `la opción ${i + 1}`}`}
            valores={o.valores}
            alCambiar={(valores) => cambiarOpciones(d.opciones.map((x, k) => (k === i ? { ...x, valores } : x)))}
            placeholder="Escribir un valor y pulsar Enter"
          />
        </div>
      ))}

      {d.opciones.length < MAX_OPCIONES && (
        <button
          type="button"
          onClick={() => set({ opciones: [...d.opciones, opcionVacia] })}
          className={`inline-flex items-center gap-1.5 self-start rounded-md px-1 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}
        >
          <MasIcon className="h-4 w-4" />
          {d.opciones.length === 0 ? "Agregar opciones como talla o color" : "Agregar otra opción"}
        </button>
      )}

      {conOpciones(d) && (
        <>
          <Casilla texto="Cobrar impuesto sobre este producto" marcada={d.cobrar_impuesto} alCambiar={(cobrar_impuesto) => set({ cobrar_impuesto })} />
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm" style={{ minWidth: `${44 + sucursales.length * 8}rem` }}>
              <thead>
                <tr className="bg-muted text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">Variante</th>
                  <th scope="col" className="px-2 py-2 font-medium">Precio</th>
                  <th scope="col" className="px-2 py-2 font-medium">Comparación</th>
                  <th scope="col" className="px-2 py-2 font-medium">Costo</th>
                  <th scope="col" className="px-2 py-2 font-medium">SKU</th>
                  <th scope="col" className="px-2 py-2 font-medium">Código de barras</th>
                  <th scope="col" className="px-2 py-2 font-medium">Peso</th>
                  {d.seguimiento_inventario &&
                    sucursales.map((s) => (
                      <th key={s} scope="col" className="px-2 py-2 font-medium">Disponible · {s}</th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.variantes.map((v, i) => {
                  const nombre = Object.values(v.opciones).join(" / ");
                  return (
                    <tr key={v.id ?? nombre}>
                      <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">{nombre}</th>
                      <td className="px-2 py-1.5"><CampoNumero prefijo="$" valor={v.precio} alCambiar={(precio) => actualizarVariante(d, set, i, { precio })} ariaLabel={`Precio de ${nombre}`} /></td>
                      <td className="px-2 py-1.5"><CampoNumero prefijo="$" valor={v.precio_comparacion} alCambiar={(precio_comparacion) => actualizarVariante(d, set, i, { precio_comparacion })} ariaLabel={`Precio de comparación de ${nombre}`} /></td>
                      <td className="px-2 py-1.5"><CampoNumero prefijo="$" valor={v.costo} alCambiar={(costo) => actualizarVariante(d, set, i, { costo })} ariaLabel={`Costo de ${nombre}`} /></td>
                      <td className="px-2 py-1.5"><input type="text" value={v.sku} onChange={(e) => actualizarVariante(d, set, i, { sku: e.target.value })} aria-label={`SKU de ${nombre}`} maxLength={120} className={`${fieldClass} w-full min-w-28`} /></td>
                      <td className="px-2 py-1.5"><input type="text" value={v.codigo_barras} onChange={(e) => actualizarVariante(d, set, i, { codigo_barras: e.target.value })} aria-label={`Código de barras de ${nombre}`} maxLength={60} className={`${fieldClass} w-full min-w-28`} /></td>
                      <td className="px-2 py-1.5">
                        <CampoNumero
                          paso="0.001"
                          valor={v.peso}
                          alCambiar={(peso) => actualizarVariante(d, set, i, { peso })}
                          ariaLabel={`Peso de ${nombre}`}
                          sufijo={
                            <select aria-label={`Unidad de peso de ${nombre}`} value={v.unidad_peso} onChange={(e) => actualizarVariante(d, set, i, { unidad_peso: e.target.value as UnidadPeso })} className={`${fieldClass} w-16 shrink-0`}>
                              {UNIDADES_PESO.map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          }
                        />
                      </td>
                      {d.seguimiento_inventario &&
                        v.inventario.map((inv) => (
                          <td key={inv.sucursal} className="px-2 py-1.5">
                            <CampoNumero
                              entero
                              min={-999999}
                              valor={inv.disponible}
                              alCambiar={(x) => actualizarVariante(d, set, i, { inventario: v.inventario.map((k) => (k.sucursal === inv.sucursal ? { ...k, disponible: x ?? 0 } : k)) })}
                              ariaLabel={`Disponible de ${nombre} en ${inv.sucursal}`}
                            />
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="sr-only">Precios en moneda de {codigoPais}</span>
        </>
      )}
    </Tarjeta>
  );
}

// ─── Metacampos ────────────────────────────────────────────────────────────────────────────────────────────────

export function BloqueMetacampos({ d, set }: PropsBloque) {
  return (
    <Tarjeta
      titulo="Metacampos"
      accion={
        <button
          type="button"
          onClick={() => set({ metacampos: [...d.metacampos, { clave: "", valor: "" }] })}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}
        >
          <MasIcon className="h-4 w-4" />
          Agregar metacampo
        </button>
      }
    >
      {d.metacampos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay metacampos fijados</p>
      ) : (
        d.metacampos.map((m, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-end gap-2">
            <CampoTexto etiqueta={`Nombre del metacampo ${i + 1}`} valor={m.clave} alCambiar={(clave) => set({ metacampos: d.metacampos.map((x, k) => (k === i ? { ...x, clave } : x)) })} placeholder="Ej: material" maxLength={80} />
            <CampoTexto etiqueta={`Valor del metacampo ${i + 1}`} valor={m.valor} alCambiar={(valor) => set({ metacampos: d.metacampos.map((x, k) => (k === i ? { ...x, valor } : x)) })} placeholder="Ej: Polietileno" maxLength={500} />
            <Tooltip texto="Quitar metacampo">
              <button type="button" onClick={() => set({ metacampos: d.metacampos.filter((_, k) => k !== i) })} aria-label={`Quitar el metacampo ${m.clave || i + 1}`} className={`mb-1 flex h-8 w-8 items-center justify-center text-destructive hover:bg-muted ${anilloFoco}`}>
                <PapeleraIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        ))
      )}
    </Tarjeta>
  );
}

// ─── Vista previa en buscadores (SEO) ──────────────────────────────────────────────────────────────────────────

const textoPlano = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function BloqueSeo({ d, set }: PropsBloque) {
  const [editando, setEditando] = useState(false);
  const controlador = slugificar(d.seo_url) || slugificar(d.titulo);
  const titulo = d.seo_titulo || d.titulo || "Título del producto";
  const descripcion = useMemo(() => d.seo_descripcion || textoPlano(d.descripcion).slice(0, MAX_SEO_DESCRIPCION), [d.seo_descripcion, d.descripcion]);
  const precio = d.variantes[0]?.precio;

  return (
    <Tarjeta
      titulo="Vista previa en buscadores"
      accion={
        <button type="button" onClick={() => setEditando((e) => !e)} aria-expanded={editando} className={`rounded-md px-2 py-1 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
          {editando ? "Listo" : "Editar"}
        </button>
      }
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">tutienda.com › products › {controlador || "…"}</span>
        <span className="text-base font-medium underline decoration-border-control underline-offset-2">{titulo}</span>
        <span className="text-sm text-muted-foreground">
          {precio != null && <span className="text-foreground">${precio.toFixed(2)} USD · </span>}
          {descripcion || "Sin descripción."}
        </span>
      </div>
      {editando && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <CampoTexto etiqueta="Título de la página" valor={d.seo_titulo} alCambiar={(seo_titulo) => set({ seo_titulo })} maxLength={MAX_SEO_TITULO} contador placeholder={d.titulo} />
          <CampoTexto etiqueta="Descripción meta" valor={d.seo_descripcion} alCambiar={(seo_descripcion) => set({ seo_descripcion })} maxLength={MAX_SEO_DESCRIPCION} contador />
          <CampoTexto etiqueta="URL y controlador (handle)" valor={d.seo_url} alCambiar={(seo_url) => set({ seo_url })} placeholder={slugificar(d.titulo)} maxLength={255} />
        </div>
      )}
    </Tarjeta>
  );
}
