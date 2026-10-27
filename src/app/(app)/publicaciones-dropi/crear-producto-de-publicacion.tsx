"use client";

import { useMemo, type ReactNode } from "react";
import { useOpcionesSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import { fotoParaProducto, pareceCompuesto, sugerirComponentes } from "@/lib/publicaciones/producto-desde-publicacion";
import { crearProducto } from "../producto/actions";
import { CrearProductoPanel } from "../producto/crear-producto-panel";
import { vincularSkuPublicacion } from "./actions";

/**
 * «Crear el producto» desde una publicación (pedido de Jhokser, 27 oct 2026): la ficha «Nuevo producto» de Producto se abre aquí encima, sin
 * salir de Gestión de IDs Dropi y **sin hacer falta abrir Producto** (Nicole crea así los packs y combos que sus publicaciones necesitan:
 * `crearProducto` deja crear a quien puede escribir en Producto o en Gestión de IDs Dropi). Llega con el nombre, el SKU y la **misma foto**
 * de la publicación (se copia a la carpeta del producto) y, si el nombre suena a pack o combo, ya como Compuesto; al crearlo, el producto queda
 * vinculado a la publicación. Un SKU que ya tiene otro producto o un componente sin elegir lo avisa la propia ficha.
 */
export function CrearProductoDePublicacion({
  publicacionId,
  nombre,
  sku,
  fotos,
  boton,
  alCrear,
}: {
  publicacionId: string;
  nombre: string;
  /** El SKU escrito en la publicación (el de Dropi), si ya lo tiene. */
  sku?: string | null;
  /** Las fotos de la publicación: se usa la primera que está en nuestro almacenamiento. */
  fotos: (string | null | undefined)[];
  boton: (abrir: () => void) => ReactNode;
  /** Después de crear el producto y vincularlo. */
  alCrear?: () => void;
}) {
  const { mostrarToast } = useToast();
  const opcionesSku = useOpcionesSkuMaestro();
  const simples = useMemo(() => opcionesSku.filter((o) => !o.compuesto), [opcionesSku]);
  // Un simple por cada parte del nombre del combo (o el del pack con su cantidad): la persona los revisa y los cambia.
  const sugeridos = useMemo(() => sugerirComponentes(nombre, simples), [nombre, simples]);
  return (
    <CrearProductoPanel
      opcionesSimples={simples}
      componentesSugeridos={sugeridos}
      nombreInicial={nombre.slice(0, 200)}
      codigoInicial={(sku ?? "").replace(/\s/g, "").slice(0, 60)}
      fotoInicial={fotoParaProducto(fotos)}
      comoCompuesto={pareceCompuesto(nombre)}
      sinVariantes
      mensajeExito="Producto creado y vinculado a la publicación"
      action={async (datos) => {
        const r = await crearProducto(datos);
        if (r.error || !r.id) return r;
        const v = await vincularSkuPublicacion(publicacionId, r.id).catch(() => ({ error: "No se pudo guardar el vínculo." }));
        if (v.error) mostrarToast(`El producto se creó, pero no se vinculó: ${v.error}`, "destructive");
        alCrear?.();
        return {};
      }}
      boton={boton}
    />
  );
}
