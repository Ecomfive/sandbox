"use client";

import { useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { activarProductoParaCompra } from "../producto/actions";

/** Lo mínimo de un producto para decidir si se puede comprar. `clase` es su estado: 'fisico' (Activo) o 'test'. */
export interface ProductoParaCompra {
  id: string;
  codigo: string;
  nombre: string;
  clase: string;
}

const claseBoton = `rounded-md border px-4 py-2 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 ${anilloFoco}`;

/**
 * Regla de Compras: **un producto en Test no se puede comprar**. Antes de agregar un producto a una compra se llama
 * `await confirmar(producto)`:
 * - si ya está Activo, devuelve `true` sin preguntar;
 * - si está en Test, abre la advertencia «para comprarlo debe pasar a Activo». **Cancelar** devuelve `false` (se vuelve
 *   atrás y no se agrega); **Aceptar** lo pasa a Activo en su ficha de Producto (`activarProductoParaCompra`, queda en su
 *   actividad «desde Compras») y devuelve `true` para seguir con la compra. Si el cambio falla, el error se ve en la misma
 *   ventana y no se cierra.
 *
 * El componente que la usa dibuja `dialogo` en algún lugar de su árbol:
 *
 *   const { confirmar, dialogo } = useConfirmarProductoActivo();
 *   async function agregar(p) { if (!(await confirmar(p))) return; ...agregar a la compra... }
 *   return <>{...}{dialogo}</>;
 */
export function useConfirmarProductoActivo() {
  const [producto, setProducto] = useState<ProductoParaCompra | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  function terminar(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setProducto(null);
    setError(null);
  }

  function confirmar(p: ProductoParaCompra): Promise<boolean> {
    if (p.clase !== "test") return Promise.resolve(true);
    // Si había otra pregunta abierta, esa se da por cancelada.
    resolver.current?.(false);
    setError(null);
    setProducto(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }

  function aceptar() {
    if (!producto) return;
    setError(null);
    start(async () => {
      const r = await activarProductoParaCompra(producto.id);
      if (r.error) setError(r.error);
      else terminar(true);
    });
  }

  const dialogo = (
    <Ventana abierto={!!producto} alCerrar={() => !pendiente && terminar(false)} titulo="Producto en Test" ancho="sm">
      {producto && (
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="m-0">
            <strong className="font-semibold">{producto.codigo}</strong> · {producto.nombre} está en <strong className="font-semibold">Test</strong>. Para
            comprarlo debe cambiarse a <strong className="font-semibold">Activo</strong>. ¿Lo cambiamos ahora?
          </p>
          {error && (
            <p role="alert" className="m-0 text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" data-enfocar disabled={pendiente} onClick={() => terminar(false)} className={`${claseBoton} border-border bg-card hover:bg-accent`}>
              Cancelar
            </button>
            <button type="button" disabled={pendiente} onClick={aceptar} className={`${claseBoton} border-foreground bg-foreground text-background hover:bg-foreground/90`}>
              {pendiente ? "Cambiando…" : "Aceptar"}
            </button>
          </div>
        </div>
      )}
    </Ventana>
  );

  return { confirmar, dialogo };
}
