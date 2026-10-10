"use client";

import { useRef, useState } from "react";
import { FormularioCompra } from "./formulario-compra";
import { ProductosCompra } from "./productos-compra";
import { ComentariosNuevaCompra, publicarComentarios, type ComentarioBorrador } from "./comentarios-nueva-compra";
import { useToast } from "@/components/ui/toast";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { Ventana } from "@/components/ui/ventana";

/**
 * Botón «Agregar» y la ficha para crear una compra: un panel que sale por la derecha, igual que «Nueva
 * cuenta destino». Modificar y eliminar una compra ya creada se hacen desde su propia ficha (`FichaCompra`).
 */
export function CrearCompraPanel({
  vista,
  paises,
  tiendas,
  etiquetas,
  colores,
  puedeAgregarPais = false,
}: {
  vista: string;
  paises: { id: string; codigo: string; nombre: string }[];
  /** Las tiendas que ya existen en otras compras, para elegir en el campo Tienda. */
  tiendas?: string[];
  /** Las etiquetas que ya existen y sus colores. */
  etiquetas?: string[];
  colores?: Record<string, string>;
  puedeAgregarPais?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lineas, setLineas] = useState(0);
  // Los comentarios escritos antes de crear la compra: se publican en ella al crearla.
  const [borradores, setBorradores] = useState<ComentarioBorrador[]>([]);
  const { mostrarToast } = useToast();
  const botonAbrirRef = useRef<HTMLButtonElement>(null);

  function cerrar() {
    setAbierto(false);
    setBorradores([]);
    setGuardando(false);
    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

  function cerrarVentana() {
    if (guardando) return;
    cerrar();
  }

  return (
    <>
      <BotonAgregar ref={botonAbrirRef} onClick={() => setAbierto(true)} />

      <Ventana abierto={abierto} alCerrar={cerrarVentana} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Nueva orden de compra</span>}>
        <FormularioCompra
          vista={vista}
          paises={paises}
          tiendas={tiendas}
          etiquetas={etiquetas}
          colores={colores}
          puedeAgregarPais={puedeAgregarPais}
          alGuardar={cerrar}
          alCambiarGuardando={setGuardando}
          conProductos={lineas > 0}
          comentarios={<ComentariosNuevaCompra borradores={borradores} alCambiar={setBorradores} />}
          alCreada={async (id) => {
            if (borradores.length === 0) return;
            const fallidos = await publicarComentarios(id, borradores);
            if (fallidos) mostrarToast(`La compra se creó, pero ${fallidos} comentario${fallidos === 1 ? "" : "s"} no se pudo guardar: agrégalo desde su ficha.`, "destructive");
          }}
          // El mismo bloque «Productos» de la ficha, en el mismo lugar (las compras de Importadora no llevan productos).
          productos={vista === "importacion" ? undefined : <ProductosCompra key={String(abierto)} compraId={null} puedeEscribir incrustado alCambiarBorrador={setLineas} />}
        />
      </Ventana>
    </>
  );
}
