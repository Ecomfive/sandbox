"use client";

import { SelectorTipoProducto } from "@/components/tabla/selector-tipo-producto";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { ConectadoIcon, EnlaceIcon, InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import type { MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import type { NombreFilas } from "@/lib/tabla/pie";
import { DEF_PUBLICACIONES_DUNAMIXFY, type FilaPublicacionDunamixfy } from "./def-publicaciones-dunamixfy";
import { FichaPublicacionDunamixfy } from "./ficha-publicacion-dunamixfy";
import { EncabezadoFilasDunamixfy, FilaPublicacionDunamixfyLista } from "./fila-publicacion-dunamixfy";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  nombre: ProductoIcon,
  idDunamixfy: ProductoIcon,
  skuDunamixfy: ProductoIcon,
  categoria: ProductoIcon,
  conexion: ConectadoIcon,
  vinculo: EnlaceIcon,
  stockNivel: InventarioIcon,
  margenNivel: MargenIcon,
  precio: MargenIcon,
  stock: InventarioIcon,
};

/** La lista de productos de Dunamixfy, con la barra común (buscar, filtrar, agrupar, descargar). Tocar una fila abre su ficha, que queda en la dirección (`?abrir=<id>`). */
export function ListaPublicacionesDunamixfy({
  publicaciones,
  moneda,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeVerCompras,
  abrirInicial = null,
  vacio,
}: {
  publicaciones: FilaPublicacionDunamixfy[];
  moneda: MonedaPublicaciones;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeVerCompras: boolean;
  abrirInicial?: string | null;
  vacio: string;
}) {
  const [abierta, setAbierta] = useState<string | null>(() => (abrirInicial && publicaciones.some((p) => p.id === abrirInicial) ? abrirInicial : null));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierta) url.searchParams.set("abrir", abierta);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierta]);
  // El orden en que se ven las filas al abrir una, para «Vincular y siguiente».
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <>
      <SelectorTipoProducto def={DEF_PUBLICACIONES_DUNAMIXFY} campo="tipoProducto" cuentas={{ todos: publicaciones.length, simple: publicaciones.filter((f) => f.producto && f.producto.tipo !== "combo").length, pack: publicaciones.filter((f) => f.producto?.tipo === "combo").length }} />
      <ListaDatos
        def={DEF_PUBLICACIONES_DUNAMIXFY}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<EncabezadoFilasDunamixfy />}
        renderFila={(f, enOrden) => (
          <FilaPublicacionDunamixfyLista
            f={f}
            moneda={moneda}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
          />
        )}
        vacio={vacio}
      />
      <FichaPublicacionDunamixfy
        key={abierta ?? "cerrada"}
        publicacion={enNavegador ? publicaciones.find((p) => p.id === abierta) : undefined}
        moneda={moneda}
        codigoPais={codigoPais}
        nombrePais={nombrePais}
        puedeEscribir={puedeEscribir}
        puedeVerCompras={puedeVerCompras}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
