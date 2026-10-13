"use client";

import { useRef, useState } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco } from "@/components/ui/field";
import { ProveedorSkusMaestros, useOpcionesSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Ventana } from "@/components/ui/ventana";
import { FlechaIzquierdaIcon } from "@/lib/nav-icons";
import { CrearProductoPanel } from "../producto/crear-producto-panel";
import { crearProductoParaTest } from "./actions";
import { FormularioProductoTest } from "./formulario-producto-test";

/**
 * «+ Agregar» de Test productos (13 oct 2026): abre el formulario del producto en test. Junto al campo «Producto» está
 * **«Nuevo producto»** (solo para quien puede modificar Producto), que cambia el panel a la ficha completa de Producto; al
 * crearlo se vuelve al formulario con ese producto ya elegido y el nombre lleno, para completar el test y guardarlo. Las dos
 * vistas quedan montadas mientras el panel está abierto, así que ir y volver no pierde lo escrito.
 */
export function AgregarProductoTest({ paisId, puedeCrearProducto, opcionesSimples }: { paisId: string; puedeCrearProducto: boolean; opcionesSimples: OpcionSkuMaestro[] }) {
  const [abierto, setAbierto] = useState(false);
  const [vista, setVista] = useState<"test" | "nuevo">("test");
  const [guardando, setGuardando] = useState(false);
  const [nuevos, setNuevos] = useState<OpcionSkuMaestro[]>([]);
  const [productoNuevo, setProductoNuevo] = useState<OpcionSkuMaestro | null>(null);
  // Cambia cada vez que se abre el panel: el formulario y la ficha arrancan vacíos.
  const [vez, setVez] = useState(0);
  const creado = useRef<OpcionSkuMaestro | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const opciones = useOpcionesSkuMaestro();

  function cerrar() {
    setAbierto(false);
    setGuardando(false);
    requestAnimationFrame(() => botonRef.current?.focus());
  }

  async function crear(formData: FormData) {
    const r = await crearProductoParaTest(formData);
    if (r.producto) creado.current = r.producto;
    return r;
  }

  return (
    <>
      <BotonAgregar
        ref={botonRef}
        onClick={() => {
          setVista("test");
          setProductoNuevo(null);
          setVez((v) => v + 1);
          setAbierto(true);
        }}
      />
      <Ventana
        abierto={abierto}
        alCerrar={() => {
          if (!guardando) cerrar();
        }}
        lado="derecha"
        ancho="lg"
        titulo={<span className="text-lg font-semibold">{vista === "nuevo" ? "Nuevo producto" : "Agregar producto en test"}</span>}
      >
        {puedeCrearProducto && (
          <div hidden={vista !== "nuevo"} className="flex-1 flex-col [&:not([hidden])]:flex">
            <div className="border-b border-border px-5 py-2">
              <button
                type="button"
                onClick={() => setVista("test")}
                disabled={guardando}
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 ${anilloFoco}`}
              >
                <FlechaIzquierdaIcon className="h-4 w-4" />
                Volver al test
              </button>
            </div>
            <CrearProductoPanel
              key={`nuevo-${vez}-${nuevos.length}`}
              incrustada
              opcionesSimples={opcionesSimples}
              action={crear}
              mensajeExito="Producto creado: completa el test y guárdalo"
              alGuardar={() => {
                const p = creado.current;
                creado.current = null;
                if (p) {
                  setNuevos((n) => [p, ...n]);
                  setProductoNuevo(p);
                }
                setVista("test");
              }}
              alCambiarEnviando={setGuardando}
            />
          </div>
        )}
        <div hidden={vista !== "test"} className="flex-1 flex-col [&:not([hidden])]:flex">
          {/* El producto recién creado todavía no está en la lista de la página: se suma aquí para poder mostrarlo elegido. */}
          <ProveedorSkusMaestros opciones={nuevos.length ? [...nuevos, ...opciones] : opciones}>
            <FormularioProductoTest
              key={`test-${vez}`}
              paisId={paisId}
              alGuardar={cerrar}
              alCambiarGuardando={setGuardando}
              alNuevoProducto={puedeCrearProducto ? () => setVista("nuevo") : undefined}
              productoNuevo={productoNuevo}
            />
          </ProveedorSkusMaestros>
        </div>
      </Ventana>
    </>
  );
}
