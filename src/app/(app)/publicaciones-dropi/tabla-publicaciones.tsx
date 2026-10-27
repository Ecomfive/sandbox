"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { CalendarioIcon, EnlaceIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { Reglas } from "@/lib/publicaciones/reglas";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import type { OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, type FilaPublicacion } from "./def-publicaciones";
import { ACCIONES, EN_DROPI } from "@/lib/publicaciones/automatico";
import { TIPOS_RECOMENDACION } from "@/lib/publicaciones/recomendaciones";
import { FichaPublicacion } from "./ficha-publicacion";
import { EncabezadoFilasPublicacion, FilaPublicacionLista } from "./fila-publicacion";
import { ProveedorTareas } from "./recomendacion-publicacion";
import { TableroAcciones } from "./tablero-acciones";
import { CalculadoraMargen } from "./calculadora-margen";
import { AvisoSinPublicacion } from "./sin-publicacion";
import type { ProductoSinPublicacion } from "@/lib/publicaciones/sin-publicacion";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";

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
  idDropi: EnlaceIcon,
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
  opcionesCrear,
  paisId,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeArchivar,
  esAdmin,
  corteVentas,
  reglas,
  decisionesDisponibles,
  tareas,
  abrirInicial = null,
  actualizadoDropi = null,
  barraDropi = null,
  actualizarDropi = false,
  sinPublicacion = [],
}: {
  publicaciones: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  /** Categorías y bodegas que ofrece «Publicar en Dropi». */
  opcionesCrear: OpcionesCrear;
  paisId: string;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeArchivar: boolean;
  /** Un administrador: la ficha le muestra las compras del producto vinculado. */
  esAdmin: boolean;
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
  /** El botón «Actualizar datos» arriba de «Agregar» (26 oct 2026: por ahora solo para Hernán). */
  actualizarDropi?: boolean;
  /** Lo activo en Dropi que no es de ninguna publicación del país («N productos en Dropi sin publicación»). */
  sinPublicacion?: ProductoSinPublicacion[];
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
  // Las demás publicaciones del mismo producto que la abierta (mismo SKU vinculado), para su sección en la ficha.
  const mismoProducto = useMemo(() => {
    const actual = abierta ? publicaciones.find((p) => p.id === abierta) : undefined;
    return actual?.sku ? publicaciones.filter((p) => p.id !== actual.id && p.sku?.id === actual.sku!.id) : [];
  }, [abierta, publicaciones]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  // A qué publicación se le puede poner el ID de un producto que está en Dropi sin publicación: las que aún no tienen ID (no un borrador).
  const sinId = useMemo(
    () => publicaciones.filter((p) => !idsDeDropi(p.dropiId).length && p.estadoPublicacion !== "borrador").map((p) => ({ id: p.id, numero: p.numero, nombre: p.nombre })),
    [publicaciones],
  );
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
      <p className="-mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {actualizadoDropi
            ? `Stock y bodegas leídos de Dropi: ${actualizadoDropi}.`
            : "Todavía no se actualizó desde Dropi: las bodegas aparecen con la primera lectura de «Mis productos»."}
        </span>
        <AvisoSinPublicacion productos={sinPublicacion} sinId={sinId} puedeEscribir={puedeEscribir} />
      </p>
      {/* Arriba de la lista: lo que espera para Dropi a la izquierda; la calculadora de margen (27 oct 2026, todos) y «Actualizar datos» a la derecha. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {barraDropi ?? <span />}
        <div className="flex flex-wrap gap-2">
          <CalculadoraMargen publicaciones={publicaciones} reglas={reglas} />
          {actualizarDropi && (
            <Link
              href="/publicaciones-dropi/actualizar"
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-border-control bg-card px-3.5 text-sm font-semibold hover:bg-muted ${anilloFoco}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
              Actualizar datos
            </Link>
          )}
        </div>
      </div>
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
        accionPrincipal={puedeEscribir ? <CrearPublicacionPanel paisId={paisId} opciones={opcionesCrear} /> : undefined}
        vacio="Todavía no hay publicaciones en este país."
      />
      <FichaPublicacion
        publicacion={enNavegador ? publicaciones.find((p) => p.id === abierta) : undefined}
        codigoPais={codigoPais}
        nombrePais={nombrePais}
        puedeEscribir={puedeEscribir}
        puedeArchivar={puedeArchivar}
        puedeVerCompras={esAdmin}
        puedeEliminar={esAdmin}
        corteVentas={corteVentas}
        margenMinimo={reglas.margen_minimo}
        decisionesDisponibles={decisionesDisponibles}
        opcionesCrear={opcionesCrear}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
        mismoProducto={mismoProducto}
        alAbrirOtra={setAbierta}
      />
    </ProveedorSkusMaestros>
    </ProveedorTareas>
  );
}
