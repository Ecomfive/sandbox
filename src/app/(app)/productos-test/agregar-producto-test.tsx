"use client";

import { useRef, useState } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco } from "@/components/ui/field";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { Ventana } from "@/components/ui/ventana";
import { CrearProductoPanel } from "../producto/crear-producto-panel";
import { crearProductoNuevoEnTest } from "./actions";
import { FormularioProductoTest } from "./formulario-producto-test";

type Pestana = "nuevo" | "existente";

/**
 * «+ Agregar» de Test productos: un solo panel con dos pestañas arriba (como las de Compras). Arranca en **Nuevo producto**,
 * la ficha completa de Producto (lo crea allá y lo deja aquí vinculado; solo para quien puede modificar Producto); al lado,
 * **Producto existente** abre la ficha de siempre, donde se elige de Producto. Las dos quedan montadas mientras el panel está
 * abierto, así que pasar de una a otra no pierde lo escrito.
 */
export function AgregarProductoTest({ paisId, puedeCrearProducto, opcionesSimples }: { paisId: string; puedeCrearProducto: boolean; opcionesSimples: OpcionSkuMaestro[] }) {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("nuevo");
  const [guardando, setGuardando] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const actual: Pestana = puedeCrearProducto ? pestana : "existente";

  function cerrar() {
    setAbierto(false);
    setGuardando(false);
    requestAnimationFrame(() => botonRef.current?.focus());
  }

  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "nuevo", etiqueta: "Nuevo producto" },
    { id: "existente", etiqueta: "Producto existente" },
  ];

  return (
    <>
      <BotonAgregar
        ref={botonRef}
        onClick={() => {
          setPestana("nuevo");
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
        titulo={<span className="text-lg font-semibold">Agregar producto en test</span>}
      >
        {puedeCrearProducto && (
          <div role="tablist" aria-label="Cómo agregarlo" className="flex gap-5 border-b border-border px-5">
            {pestanas.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`pestana-agregar-${p.id}`}
                aria-selected={actual === p.id}
                aria-controls={`panel-agregar-${p.id}`}
                onClick={() => setPestana(p.id)}
                className={`relative -mb-px border-b-2 py-2.5 text-sm transition-colors ${
                  actual === p.id ? "border-[#8a35c9] font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                } ${anilloFoco}`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )}
        {puedeCrearProducto && (
          <div role="tabpanel" id="panel-agregar-nuevo" aria-labelledby="pestana-agregar-nuevo" hidden={actual !== "nuevo"} className="flex-1 flex-col [&:not([hidden])]:flex">
            <CrearProductoPanel
              incrustada
              opcionesSimples={opcionesSimples}
              action={crearProductoNuevoEnTest}
              mensajeExito="Producto creado y agregado a Test productos"
              ocultos={{ pais_id: paisId }}
              alGuardar={cerrar}
              alCambiarEnviando={setGuardando}
            />
          </div>
        )}
        <div
          role={puedeCrearProducto ? "tabpanel" : undefined}
          id="panel-agregar-existente"
          aria-labelledby={puedeCrearProducto ? "pestana-agregar-existente" : undefined}
          hidden={actual !== "existente"}
          className="flex-1 flex-col [&:not([hidden])]:flex"
        >
          <FormularioProductoTest paisId={paisId} alGuardar={cerrar} alCambiarGuardando={setGuardando} />
        </div>
      </Ventana>
    </>
  );
}
