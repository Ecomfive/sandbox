"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { Reglas } from "@/lib/publicaciones/reglas";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, type FilaPublicacion } from "./def-publicaciones";
import { ACCIONES, EN_DROPI } from "@/lib/publicaciones/automatico";
import { TIPOS_RECOMENDACION } from "@/lib/publicaciones/recomendaciones";
import { FichaPublicacion } from "./ficha-publicacion";
import { EncabezadoFilasPublicacion, FilaPublicacionLista } from "./fila-publicacion";
import { ProveedorTareas } from "./recomendacion-publicacion";
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
  recomendacion: EstadoIcon,
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
const COLOR_GRUPO: Record<string, OpcionPublicacion[]> = { accion: comoOpciones(ACCIONES), recomendacion: comoOpciones(TIPOS_RECOMENDACION), publicacion: comoOpciones(EN_DROPI), ubicacion: UBICACIONES, tipo: TIPOS };

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
  puedeArchivar,
  corteVentas,
  reglas,
  decisionesDisponibles,
  tareas,
  abrirInicial = null,
  actualizadoDropi = null,
  barraDropi = null,
}: {
  publicaciones: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  paisId: string;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeArchivar: boolean;
  /** Hasta qué día llegan las ventas de Dropi; `null` si no se muestran (solo las ve un administrador). */
  corteVentas: string | null;
  reglas: Reglas;
  decisionesDisponibles: boolean;
  /** A quién se asignan las tareas, quién es la persona y si existe la migración 0128. */
  tareas: { personas: { id: string; nombre: string }[]; yo: string; conTareas: boolean };
  /** La publicación que se abre al cargar (`?abrir=`, desde la ficha de un producto); si no es de este país, nada. */
  abrirInicial?: string | null;
  /** La última lectura de «Mis productos» de Dropi, ya escrita en hora de Panamá (se escribe en el servidor: así no cambia al hidratar). */
  actualizadoDropi?: string | null;
  /** Lo que espera para Dropi y el favorito «Aplicar en Dropi» (`BarraAplicarDropi`, la arma la página). */
  barraDropi?: ReactNode;
}) {
  const verVentas = corteVentas !== null;
  const def = DEF_PUBLICACIONES;
  const [abierta, setAbierta] = useState<string | null>(() => (abrirInicial && publicaciones.some((p) => p.id === abrirInicial) ? abrirInicial : null));
  // La ficha abierta también queda en la dirección (`?abrir=<id>`): si la lista se vuelve a cargar (al guardar), sigue abierta.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierta) url.searchParams.set("abrir", abierta);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierta]);
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
    <ProveedorTareas {...tareas}>
    <ProveedorSkusMaestros opciones={opcionesSku}>
      <TableroAcciones publicaciones={publicaciones} def={def} reglas={reglas} />
      <p className="-mb-2 text-xs text-muted-foreground">
        {actualizadoDropi
          ? `Última actualización desde Dropi: ${actualizadoDropi} (bodegas, stock, precio, tipo y estado).`
          : "Todavía no se actualizó desde Dropi: las bodegas aparecen con la primera lectura de «Mis productos»."}
      </p>
      {barraDropi}
      <ListaDatos
        def={def}
        filas={publicaciones}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<EncabezadoFilasPublicacion verVentas={verVentas} puedeArchivar={puedeArchivar} />}
        renderFila={(f, enOrden) => (
          <FilaPublicacionLista
            f={f}
            verVentas={verVentas}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(f.id);
            }}
            puedeArchivar={puedeArchivar}
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
        puedeArchivar={puedeArchivar}
        corteVentas={corteVentas}
        margenMinimo={reglas.margen_minimo}
        decisionesDisponibles={decisionesDisponibles}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </ProveedorSkusMaestros>
    </ProveedorTareas>
  );
}
