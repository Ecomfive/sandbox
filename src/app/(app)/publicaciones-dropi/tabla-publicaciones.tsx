"use client";

import { useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, type FilaPublicacion } from "./def-publicaciones";
import { ACCIONES, EN_DROPI } from "@/lib/publicaciones/automatico";
import { FichaPublicacion } from "./ficha-publicacion";
import { FilaPublicacionLista } from "./fila-publicacion";
import { TableroAcciones } from "./tablero-acciones";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = {
  accion: EstadoIcon,
  revision: CalendarioIcon,
  venta: MargenIcon,
  ubicacion: InventarioIcon,
  tipo: EstadoIcon,
  publicacion: EstadoIcon,
  privatizado: PersonaIcon,
  vinculo: ProductoIcon,
  nombre: ProductoIcon,
  precio: MargenIcon,
  margen: MargenIcon,
  margenBajo: MargenIcon,
  ultimaRevision: CalendarioIcon,
  fechaPublicacion: CalendarioIcon,
  stockDropi: InventarioIcon,
  ventaDropi: MargenIcon,
  ventaCoincide: MargenIcon,
  netas30: MargenIcon,
  stockDropiNum: InventarioIcon,
  diasInventario: CalendarioIcon,
};

// Los grupos de «Acción» y «En Dropi» se pintan con su color (son calculados, no listas de la publicación).
const comoOpciones = (l: { valor: string; etiqueta: string; color: string }[]): OpcionPublicacion[] => l.map((o) => ({ ...o, clickup: o.etiqueta }));
const COLOR_GRUPO: Record<string, OpcionPublicacion[]> = { accion: comoOpciones(ACCIONES), publicacion: comoOpciones(EN_DROPI), ubicacion: UBICACIONES, tipo: TIPOS };

/**
 * Las publicaciones del país: el tablero de acciones arriba y, debajo, la lista de filas con la barra de herramientas común y
 * «Agregar». Toda la fila abre la ficha, con flechas para pasar a la anterior y la siguiente.
 */
export function TablaPublicaciones({
  publicaciones,
  opcionesSku,
  paisId,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeEliminar,
  corteVentas,
  abrirInicial = null,
}: {
  publicaciones: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  paisId: string;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
  /** Hasta qué día llegan las ventas de Dropi; `null` si no se muestran (solo las ve un administrador). */
  corteVentas: string | null;
  /** La publicación que se abre al cargar (`?abrir=`, desde la ficha de un producto); si no es de este país, nada. */
  abrirInicial?: string | null;
}) {
  const verVentas = corteVentas !== null;
  const def = DEF_PUBLICACIONES;
  const [abierta, setAbierta] = useState<string | null>(() => (abrirInicial && publicaciones.some((p) => p.id === abrirInicial) ? abrirInicial : null));
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador (en el
  // servidor no hay `document`).
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <ProveedorSkusMaestros opciones={opcionesSku}>
      <TableroAcciones publicaciones={publicaciones} def={def} />
      <ListaDatos
        def={def}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        renderFila={(f, enOrden) => (
          <FilaPublicacionLista
            f={f}
            verVentas={verVentas}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
            alEliminar={puedeEliminar ? () => setAbierta((a) => (a === f.id ? null : a)) : undefined}
          />
        )}
        etiquetaGrupo={(campo, grupo) => {
          const o = COLOR_GRUPO[campo] && grupo.clave !== SIN_VALOR ? opcion(COLOR_GRUPO[campo], grupo.clave) : null;
          return o ? <Badge color={o.color}>{o.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>;
        }}
        accionPrincipal={puedeEscribir ? <CrearPublicacionPanel paisId={paisId} /> : undefined}
        vacio="Todavía no hay publicaciones en este país."
      />
      <FichaPublicacion
        publicacion={enNavegador ? publicaciones.find((p) => p.id === abierta) : undefined}
        codigoPais={codigoPais}
        nombrePais={nombrePais}
        puedeEscribir={puedeEscribir}
        puedeEliminar={puedeEliminar}
        corteVentas={corteVentas}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </ProveedorSkusMaestros>
  );
}
