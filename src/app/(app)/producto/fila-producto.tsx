"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { SEPARADOR } from "@/lib/categorias/taxonomia";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { STOCK_BAJO } from "@/lib/producto/para-decidir";
import { colorEstado, etiquetaEstado } from "../productos-test/def-productos-test";
import { usd } from "../productos-test/informe";
import { ETIQUETA_CLASE, ETIQUETA_TIPO, numeroProducto, TONO_CLASE, type FilaProducto } from "./def-producto";
import { VistaRapidaProducto } from "./vista-rapida-producto";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });

const Punto = ({ clase, texto }: { clase: string; texto: string }) => (
  <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />
);

/** Una celda de la fila: lo principal arriba y lo de apoyo abajo; el nombre del dato solo se lee con lector de pantalla. */
function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full overflow-hidden text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

const Nada = () => <span className="text-muted-foreground">—</span>;

/** Su test más reciente (el resultado con su color) y la oferta en que se testeó. */
function CeldaTest({ p }: { p: FilaProducto }) {
  const t = p.tests[0];
  if (!t) return <Celda nombre="Test" principal={<Nada />} apoyo="Sin test" />;
  return (
    <Celda
      nombre="Test"
      principal={
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorEstado(t.estado) }} />
          <span className="truncate">{etiquetaEstado(t.estado)}</span>
        </span>
      }
      apoyo={[t.oferta !== null ? `Oferta ${usd(t.oferta)}` : null, p.tests.length > 1 ? `${p.tests.length} tests` : null].filter(Boolean).join(" · ") || undefined}
    />
  );
}

/** Lo comprado: unidades y la última orden; un activo sin compras lleva el aviso. */
function CeldaCompras({ p }: { p: FilaProducto }) {
  if (!p.compras.ordenes)
    return (
      <Celda
        nombre="Compras"
        alinear="derecha"
        principal={
          p.clase === "fisico" ? (
            <span className="inline-flex items-center gap-1.5">
              <Punto clase="bg-warning" texto="Nunca comprado" />
              Nunca comprado
            </span>
          ) : (
            <Nada />
          )
        }
      />
    );
  return (
    <Celda
      nombre="Compras"
      alinear="derecha"
      principal={<span className="tabular-nums">{entero(p.unidadesCompradas)} u. compradas</span>}
      apoyo={
        <span className="tabular-nums">
          {p.compras.ordenes} {p.compras.ordenes === 1 ? "compra" : "compras"}
          {p.compras.ultima ? ` · última ${p.compras.ultima.oc}` : ""}
        </span>
      }
    />
  );
}

/** En Dropi: el stock de sus publicaciones (con aviso si no hay o es bajo) o que no está conectado. */
function CeldaDropi({ p }: { p: FilaProducto }) {
  const conectado = p.asociaciones.length > 0 || p.nombresDropi.length > 0;
  const publicaciones = p.nombresDropi.filter((n) => !n.archivada).length;
  if (!conectado)
    return (
      <Celda
        nombre="En Dropi"
        alinear="derecha"
        principal={
          p.clase === "fisico" ? (
            <span className="inline-flex items-center gap-1.5">
              <Punto clase="bg-warning" texto="Sin conectar" />
              Sin conectar
            </span>
          ) : (
            <Nada />
          )
        }
      />
    );
  return (
    <Celda
      nombre="En Dropi"
      alinear="derecha"
      principal={
        p.stockDropi === null ? (
          <span className="text-muted-foreground">Sin stock leído</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {p.stockDropi === 0 && <Punto clase="bg-destructive" texto="Sin stock en Dropi" />}
            {p.stockDropi > 0 && p.stockDropi < STOCK_BAJO && <Punto clase="bg-warning" texto="Stock bajo en Dropi" />}
            {entero(p.stockDropi)} u. en Dropi
          </span>
        )
      }
      apoyo={
        publicaciones
          ? `${publicaciones} ${publicaciones === 1 ? "publicación" : "publicaciones"}`
          : `${p.asociaciones.length} ${p.asociaciones.length === 1 ? "ficha enlazada" : "fichas enlazadas"}`
      }
    />
  );
}

/**
 * Un producto como fila de la lista (23 oct 2026, igual que Gestión de IDs Dropi): foto, nombre con su número, SKU y categoría,
 * el estado, el test, lo comprado y cómo está en Dropi. Toda la fila abre su ficha; los avisos son un punto de color junto al dato.
 */
export function FilaProductoLista({ p, alAbrir }: { p: FilaProducto; alAbrir: () => void }) {
  const categoria = p.categoria?.ruta.split(SEPARADOR).at(-1) ?? null;
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha del producto ${p.codigo} (${numeroProducto(p.numero)})`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_1rem] ${anilloFoco}`}
    >
      {/* Producto */}
      <span className="flex min-w-0 items-center gap-3">
        {p.foto ? (
          <img src={p.foto} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
        ) : (
          <span role="img" aria-label="Sin foto" className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-border-control" />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          {/* Al pasar el cursor: el mapa de un compuesto, o la foto grande y las compras de un producto simple (va por portal y no
              tiene enlaces, así que puede ir dentro del botón de la fila). */}
          <TarjetaEmergente ancho={p.tipo === "combo" ? "34rem" : "17rem"} contenido={<VistaRapidaProducto producto={p} />}>
            <span className="block truncate text-sm font-medium">{p.nombre}</span>
          </TarjetaEmergente>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">{numeroProducto(p.numero)}</span>
            <span className="font-mono font-semibold text-foreground">{p.codigo}</span>
            {categoria ? (
              <span className="inline-flex max-w-[14rem] min-w-0 items-center gap-1.5">
                {p.categoria?.revisar && p.clase === "fisico" && <Punto clase="bg-warning" texto="Categoría por revisar" />}
                <span className="truncate">{categoria}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                {p.clase === "fisico" && <Punto clase="bg-warning" texto="Sin categoría" />}
                Sin categoría
              </span>
            )}
            {p.variantes.length > 0 && <span>{p.variantes.length} variantes</span>}
          </span>
        </span>
      </span>

      {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del producto en una fila que envuelve. */}
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:order-none lg:contents">
        <Celda
          nombre="Estado"
          principal={<Badge tone={TONO_CLASE[p.clase]}>{ETIQUETA_CLASE[p.clase] ?? p.clase}</Badge>}
          apoyo={[ETIQUETA_TIPO[p.tipo] ?? p.tipo, p.manejaVencimiento ? "Vence por lote" : null].filter(Boolean).join(" · ")}
        />
        <CeldaTest p={p} />
        <CeldaCompras p={p} />
        <CeldaDropi p={p} />
      </span>

      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
}
