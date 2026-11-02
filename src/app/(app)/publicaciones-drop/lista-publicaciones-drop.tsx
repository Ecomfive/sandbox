"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ListaDatos } from "@/components/tabla/lista-datos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ConectadoIcon, DesconectadoIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearProductoDropPanel } from "./crear-producto-drop-panel";
import { DEF_PUBLICACIONES_DROP, type FilaPublicacionDrop } from "./def-publicaciones-drop";
import { FichaPublicacionDrop } from "./ficha-publicacion-drop";
import { EncabezadoFilasDrop, FilaPublicacionDropLista } from "./fila-publicacion-drop";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = {
  nombre: ProductoIcon,
  skuDrop: ProductoIcon,
  idDrop: DesconectadoIcon,
  estado: EstadoIcon,
  conexion: ConectadoIcon,
  vinculo: EnlaceIcon,
  stock: InventarioIcon,
  margen: MargenIcon,
  precio: MargenIcon,
  inventario: InventarioIcon,
};

/**
 * La lista de publicaciones de Drop: la misma barra de herramientas que la de Dropi (buscar, filtrar, agrupar, descargar); las tarjetas de arriba la filtran.
 * Tocar una fila abre su ficha a la derecha (como en Gestión de IDs Dropi), que también queda en la dirección (`?abrir=<id>`): al recargar sigue abierta.
 * «Crear producto» es el «Agregar» de Drop (el botón negro de su pantalla).
 */
export function ListaPublicacionesDrop({
  publicaciones,
  moneda,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeVerCompras,
  abrirInicial = null,
  opcionesSku,
  vacio,
}: {
  publicaciones: FilaPublicacionDrop[];
  moneda: MonedaPublicaciones;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeVerCompras: boolean;
  abrirInicial?: string | null;
  opcionesSku: OpcionSkuMaestro[];
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
  // Las demás publicaciones de Drop del mismo producto que la abierta.
  const mismoProducto = useMemo(() => {
    const actual = abierta ? publicaciones.find((p) => p.id === abierta) : undefined;
    return actual?.producto ? publicaciones.filter((p) => p.id !== actual.id && p.producto?.id === actual.producto!.id) : [];
  }, [abierta, publicaciones]);
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <>
      <ListaDatos
        def={DEF_PUBLICACIONES_DROP}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<EncabezadoFilasDrop />}
        renderFila={(f, enOrden) => (
          <FilaPublicacionDropLista
            f={f}
            moneda={moneda}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
          />
        )}
        accionPrincipal={puedeEscribir ? <CrearProductoDropPanel opcionesSku={opcionesSku} /> : undefined}
        vacio={vacio}
      />
      <FichaPublicacionDrop
        key={abierta ?? "cerrada"}
        publicacion={enNavegador ? publicaciones.find((p) => p.id === abierta) : undefined}
        moneda={moneda}
        codigoPais={codigoPais}
        nombrePais={nombrePais}
        puedeEscribir={puedeEscribir}
        puedeVerCompras={puedeVerCompras}
        mismoProducto={mismoProducto}
        alAbrirOtra={setAbierta}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
