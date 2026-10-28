"use client";

import { useEffect, useMemo, useState } from "react";
import { useOpcionesSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { pareceCompuesto, sugerirComponentes } from "@/lib/publicaciones/producto-desde-publicacion";
import { crearProducto } from "../producto/actions";
import { CrearProductoPanel } from "../producto/crear-producto-panel";

/** Deja afuera la función que abre la ficha (la da `CrearProductoPanel` por su `boton`), sin dibujar nada. */
function Registrar({ abrir, alRegistrar }: { abrir: () => void; alRegistrar: (abrir: () => void) => void }) {
  useEffect(() => alRegistrar(abrir), [abrir, alRegistrar]);
  return null;
}

/**
 * Crear el producto desde «Agregar» de Gestión de IDs Dropi (pedido de Alcides, 27 oct 2026; reemplaza el botón «Nuevo producto» de la
 * barra): si el producto que se va a vincular a la publicación no existe, se crea ahí mismo y queda elegido en «Producto vinculado». Es la
 * misma ficha «Nuevo producto» de Producto (simple o compuesto, con sus reglas) y llega con el nombre escrito en la publicación; si suena a
 * pack o combo, ya como compuesto con los productos simples que se parecen. Va **fuera** del formulario de «Agregar» (un formulario dentro de
 * otro enviaría los dos): `alRegistrar` entrega la función que la abre.
 */
export function CrearProductoAlAgregar({ nombre, alRegistrar, alCrear }: { nombre: string; alRegistrar: (abrir: () => void) => void; alCrear: (o: OpcionSkuMaestro) => void }) {
  const opciones = useOpcionesSkuMaestro();
  const simples = useMemo(() => opciones.filter((o) => !o.compuesto), [opciones]);
  const sugeridos = useMemo(() => sugerirComponentes(nombre, simples), [nombre, simples]);
  const [vez, setVez] = useState(0);
  return (
    <CrearProductoPanel
      // Una ficha nueva cada vez que se abre con otro nombre (lo escrito en la publicación).
      key={`${nombre}-${vez}`}
      opcionesSimples={simples}
      componentesSugeridos={sugeridos}
      nombreInicial={nombre.slice(0, 200)}
      comoCompuesto={pareceCompuesto(nombre)}
      sinVariantes
      mensajeExito="Producto creado: quedó elegido para la publicación"
      action={async (datos) => {
        const r = await crearProducto(datos);
        if (r.error || !r.id) return r;
        alCrear({
          id: r.id,
          codigo: String(datos.get("codigo") ?? "").trim(),
          nombre: String(datos.get("nombre") ?? "").trim(),
          estado: "aprobado",
          compuesto: datos.get("tipo") === "combo",
        });
        setVez((v) => v + 1);
        return {};
      }}
      boton={(abrir) => <Registrar abrir={abrir} alRegistrar={alRegistrar} />}
    />
  );
}
