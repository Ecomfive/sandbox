"use client";

import { anilloFoco } from "@/components/ui/field";
import { useOpcionesSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { crearProducto } from "../producto/actions";
import { CrearProductoPanel } from "../producto/crear-producto-panel";

/**
 * «Nuevo producto» (27 oct 2026, pedido de Jhokser): crear un producto desde Gestión de IDs Dropi **sin partir de una publicación**, para quien no
 * abre Producto (Nicole). Es la misma ficha «Nuevo producto» de Producto, simple o compuesto, con las mismas reglas (SKU único, componentes,
 * foto, código de barras, envío); `crearProducto` deja crear a quien puede escribir en Producto o en esta lista. Sin variantes: se crean en
 * Producto. El producto queda en Producto; vincularlo a una publicación se hace en su ficha («Producto vinculado»).
 */
export function NuevoProducto() {
  const opcionesSku = useOpcionesSkuMaestro();
  return (
    <CrearProductoPanel
      opcionesSimples={opcionesSku.filter((o) => !o.compuesto)}
      action={crearProducto}
      mensajeExito="Producto creado: ya se puede vincular a una publicación"
      sinVariantes
      boton={(abrir) => (
        <button
          type="button"
          onClick={abrir}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-control bg-card px-3.5 text-sm font-semibold hover:bg-muted ${anilloFoco}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
            <path d="m3 8 9 5 9-5M12 13v8" />
          </svg>
          Nuevo producto
        </button>
      )}
    />
  );
}
