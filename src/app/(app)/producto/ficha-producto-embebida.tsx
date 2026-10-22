"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/toast";
import { FichaProducto } from "./ficha-producto";
import { obtenerProductoParaFicha, type ProductoParaFicha } from "./ficha-actions";

/**
 * La ficha de un producto abierta desde otro módulo, encima de la que ya estaba abierta (Gestión de IDs Dropi): pide la fila
 * del producto al abrirse y dibuja la misma `FichaProducto` de Producto, con sus mismas acciones. Cerrarla deja la ficha de
 * atrás tal como estaba. Con `productoId` en null no hace nada.
 */
export function FichaProductoEmbebida({ productoId, alCerrar }: { productoId: string | null; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [cargado, setCargado] = useState<ProductoParaFicha | null>(null);
  // Siempre la última función, sin volver a pedir el producto en cada render de quien la pasa.
  const cerrarRef = useRef(alCerrar);
  useEffect(() => {
    cerrarRef.current = alCerrar;
  });

  useEffect(() => {
    if (!productoId) return;
    let vigente = true;
    obtenerProductoParaFicha(productoId)
      .catch(() => ({ error: "No se pudo abrir el producto." }))
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) {
          mostrarToast(r.error, "destructive");
          cerrarRef.current();
        } else setCargado(r);
      });
    return () => {
      vigente = false;
      setCargado(null);
    };
  }, [productoId, mostrarToast]);

  if (!productoId) return null;
  if (!cargado || cargado.producto.id !== productoId)
    return createPortal(
      <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-sm text-background shadow-lg">
        Abriendo el producto…
      </div>,
      document.body,
    );
  return (
    <FichaProducto
      producto={cargado.producto}
      orden={[cargado.producto.id]}
      codigoPais={cargado.codigoPais}
      puedeEscribir={cargado.puedeEscribir}
      puedeEliminar={cargado.puedeEliminar}
      referenciasTest={cargado.referenciasTest}
      alIr={() => {}}
      alCerrar={alCerrar}
    />
  );
}
