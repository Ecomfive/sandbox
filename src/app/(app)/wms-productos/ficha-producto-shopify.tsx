"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import {
  CANALES_VENTA,
  ESTADOS_PRODUCTO,
  ETIQUETA_ESTADO_PRODUCTO,
  PLANTILLAS_TEMA,
  TONO_ESTADO_PRODUCTO,
  type EstadoProducto,
  type ProductoDatos,
} from "@/lib/wms/producto";
import { PapeleraIcon } from "@/lib/nav-icons";
import { duplicarProductoWms, eliminarProductoWms, guardarProductoWms, obtenerHistorialProductoWms, prepararSubidaMedio } from "./actions";
import {
  BloqueCategoria,
  BloqueEnvio,
  BloqueInventario,
  BloqueMetacampos,
  BloqueMultimedia,
  BloquePrecio,
  BloqueSeo,
  BloqueVariantes,
} from "./bloques-producto";
import { CampoChips, CampoTexto, Casilla, Tarjeta } from "./campos-producto";
import { EditorDescripcion } from "./editor-descripcion";

/**
 * «Ficha producto Shopify»: réplica de la ficha de producto del admin de Shopify, en dos columnas. A la izquierda,
 * título, descripción, multimedia, categoría, precio, inventario, envío, variantes, metacampos y vista previa en
 * buscadores; a la derecha, estado, publicación (canales), organización (tipo, proveedor, colecciones, etiquetas) y
 * plantilla de tema. Como en Shopify, «Guardar» y «Descartar» aparecen solo cuando hay cambios. Sin permiso de
 * escritura la ficha se ve completa pero deshabilitada (`fieldset disabled`).
 */
export function FichaProductoShopify({
  id,
  inicial,
  paisId,
  codigoPais,
  puedeEscribir,
}: {
  /** null = producto nuevo. */
  id: string | null;
  inicial: ProductoDatos;
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [d, setD] = useState<ProductoDatos>(inicial);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [faltaTitulo, setFaltaTitulo] = useState(false);
  const [version, setVersion] = useState(0);
  const archivos = useRef(new Map<string, File>());
  const snapshot = useMemo(() => JSON.stringify(inicial), [inicial]);
  const sinGuardar = JSON.stringify(d) !== snapshot;
  const esNuevo = id === null;

  const set = (cambios: Partial<ProductoDatos>) => {
    setD((actual) => ({ ...actual, ...cambios }));
    if ("titulo" in cambios) setFaltaTitulo(false);
  };

  function descartar() {
    archivos.current.clear();
    setD(inicial);
    setError(null);
    setFaltaTitulo(false);
    setVersion((v) => v + 1);
  }

  function guardar() {
    if (!d.titulo.trim()) {
      setFaltaTitulo(true);
      setError("Falta el título del producto.");
      document.getElementById("campo-titulo-producto")?.focus();
      return;
    }
    setError(null);
    empezar(async () => {
      // Los archivos nuevos suben directo a Storage con una dirección firmada; al guardar solo viaja su ruta.
      const medios = [...d.medios];
      for (const [i, m] of medios.entries()) {
        if (!m.tempId) continue;
        const archivo = archivos.current.get(m.tempId);
        if (!archivo) {
          setError("Falta uno de los archivos elegidos; vuelve a agregarlo.");
          return;
        }
        const permiso = await prepararSubidaMedio(archivo.name).catch(() => ({ error: "No se pudo preparar la subida." }));
        if ("error" in permiso) {
          setError(permiso.error);
          return;
        }
        const { error: errorSubida } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, {
          contentType: archivo.type || "application/octet-stream",
        });
        if (errorSubida) {
          setError(`No se pudo subir «${archivo.name}»: ${errorSubida.message}`);
          return;
        }
        medios[i] = { ...m, ruta: permiso.ruta, tempId: undefined };
      }

      const resultado = await guardarProductoWms({ id, paisId, datos: { ...d, medios } }).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in resultado) {
        setError(resultado.error);
        return;
      }
      archivos.current.clear();
      mostrarToast(esNuevo ? "Producto creado" : "Cambios guardados");
      if (esNuevo) router.replace(`/wms-productos/${resultado.id}`);
      else router.refresh();
    });
  }

  function duplicar() {
    if (!id) return;
    empezar(async () => {
      const r = await duplicarProductoWms(id).catch(() => ({ error: "No se pudo duplicar." }));
      if ("error" in r) setError(r.error);
      else {
        mostrarToast("Producto duplicado");
        router.push(`/wms-productos/${r.id}`);
      }
    });
  }

  function eliminar() {
    if (!id || !confirm(`¿Eliminar «${d.titulo || "este producto"}»? No se puede deshacer.`)) return;
    empezar(async () => {
      const r = await eliminarProductoWms(id).catch(() => ({ error: "No se pudo eliminar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Producto eliminado");
        router.push("/wms-productos");
      }
    });
  }

  const props = { d, set, codigoPais };

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de acciones: Guardar y Descartar solo con cambios (como en Shopify); Duplicar y Eliminar en un producto guardado. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-base font-semibold">
          <span className="truncate">{d.titulo || (esNuevo ? "Agregar producto" : "Producto sin título")}</span>
          <Badge tone={TONO_ESTADO_PRODUCTO[d.estado]}>{ETIQUETA_ESTADO_PRODUCTO[d.estado]}</Badge>
        </h2>
        {puedeEscribir && !esNuevo && (
          <>
            <Button type="button" variant="secondary" onClick={duplicar} disabled={pendiente}>
              Duplicar
            </Button>
            <Button type="button" variant="secondary" onClick={eliminar} disabled={pendiente} aria-label="Eliminar producto">
              <PapeleraIcon className="mr-1 h-4 w-4" />
              Eliminar
            </Button>
          </>
        )}
        {puedeEscribir && (sinGuardar || esNuevo) && (
          <>
            {sinGuardar && (
              <Button type="button" variant="secondary" onClick={descartar} disabled={pendiente}>
                Descartar
              </Button>
            )}
            <Button type="button" onClick={guardar} disabled={pendiente || (!sinGuardar && !esNuevo)}>
              {pendiente ? "Guardando..." : "Guardar"}
            </Button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <fieldset disabled={!puedeEscribir} className="m-0 min-w-0 border-0 p-0">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Tarjeta>
              <CampoTexto
                etiqueta="Título"
                valor={d.titulo}
                alCambiar={(titulo) => set({ titulo })}
                placeholder="Ej: Camiseta de algodón de manga corta"
                requerido
                invalido={faltaTitulo}
                maxLength={255}
              />
              <EditorDescripcion key={version} valor={d.descripcion} alCambiar={(descripcion) => set({ descripcion })} />
            </Tarjeta>

            <BloqueMultimedia medios={d.medios} alCambiar={(medios) => set({ medios })} archivos={archivos} />
            <BloqueCategoria {...props} />
            {d.opciones.length === 0 && <BloquePrecio {...props} />}
            <BloqueInventario {...props} />
            <BloqueEnvio {...props} />
            <BloqueVariantes {...props} />
            <BloqueMetacampos {...props} />
            <BloqueSeo {...props} />
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
            <Tarjeta titulo="Estado">
              <label className="flex flex-col gap-1">
                <span className="sr-only">Estado del producto</span>
                <select value={d.estado} onChange={(e) => set({ estado: e.target.value as EstadoProducto })} className={`${fieldClass} w-full`}>
                  {ESTADOS_PRODUCTO.map((e) => (
                    <option key={e} value={e}>
                      {ETIQUETA_ESTADO_PRODUCTO[e]}
                    </option>
                  ))}
                </select>
              </label>
            </Tarjeta>

            <Tarjeta titulo="Publicación">
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="sr-only">Canales de venta</legend>
                {CANALES_VENTA.map((c) => (
                  <Casilla
                    key={c}
                    texto={c}
                    marcada={d.canales.includes(c)}
                    alCambiar={(on) => set({ canales: on ? [...d.canales, c] : d.canales.filter((x) => x !== c) })}
                  />
                ))}
              </fieldset>
            </Tarjeta>

            <Tarjeta titulo="Organización del producto">
              <CampoTexto etiqueta="Tipo" valor={d.tipo} alCambiar={(tipo) => set({ tipo })} placeholder="Ej: Kit de riego" maxLength={100} />
              <CampoTexto etiqueta="Proveedor" valor={d.proveedor} alCambiar={(proveedor) => set({ proveedor })} placeholder="Ej: Dropi" maxLength={100} />
              <CampoChips etiqueta="Colecciones" valores={d.colecciones} alCambiar={(colecciones) => set({ colecciones })} placeholder="Ej: Jardín" />
              <CampoChips etiqueta="Etiquetas" valores={d.etiquetas} alCambiar={(etiquetas) => set({ etiquetas })} placeholder="Ej: verano, riego" />
            </Tarjeta>

            <Tarjeta titulo="Plantilla de tema">
              <label className="flex flex-col gap-1">
                <span className="sr-only">Plantilla de tema</span>
                <select value={d.plantilla_tema} onChange={(e) => set({ plantilla_tema: e.target.value })} className={`${fieldClass} w-full`}>
                  {PLANTILLAS_TEMA.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </Tarjeta>
          </div>
        </div>
      </fieldset>

      {id && (
        <div className="rounded-lg border border-border bg-card">
          <HistorialGenerico id={id} codigoPais={codigoPais} titulo="Historial" obtener={obtenerHistorialProductoWms} />
        </div>
      )}
    </div>
  );
}
