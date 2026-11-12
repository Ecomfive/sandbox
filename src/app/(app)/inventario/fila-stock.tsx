"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { MiniaturaFoto } from "@/components/ui/miniatura-foto";
import { Tooltip } from "@/components/ui/tooltip";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { ETIQUETA_PLATAFORMA, textoPlataformas, type Plataforma } from "@/lib/wms/stock-plataformas";
import { ETIQUETA_CLASE_SKU, ETIQUETA_TIPO_SKU, type FilaStock } from "./def-stock";
import { DESCRIPCION_CUBETA } from "./descripciones-stock";

/** Las columnas de la fila en pantalla ancha; las usa también el encabezado, así que van juntas. */
const COLUMNAS = "lg:grid-cols-[minmax(0,3fr)_repeat(5,minmax(0,1fr))_minmax(0,1.4fr)_1rem]";
const COLUMNAS_PLATAFORMAS = "lg:grid-cols-[minmax(0,2.6fr)_repeat(3,minmax(0,0.9fr))_minmax(0,1.7fr)_repeat(2,minmax(0,0.9fr))_minmax(0,1.2fr)_1rem]";

const entero = (n: number) => n.toLocaleString("es-PA");

/** Lo que está en la bodega pero no se puede vender, con su nombre: solo las cubetas que tienen algo. */
const fueraDeVenta = (f: FilaStock) =>
  [
    { nombre: "Dañado", n: f.danado },
    { nombre: "En inspección", n: f.inspeccion },
    { nombre: "Retenido", n: f.retenido },
    { nombre: "Vencido", n: f.vencido },
  ].filter((c) => c.n !== 0);

/** Una cifra: gris en cero y rojo si el saldo es negativo. Su nombre se ve en pantalla angosta, donde no hay encabezado. */
function Cifra({ nombre, n, apoyo, fuerte = false }: { nombre: string; n: number; apoyo?: ReactNode; fuerte?: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5 lg:items-end lg:text-right">
      <span className="text-xs text-muted-foreground lg:sr-only">{nombre}</span>
      <span className={`tabular-nums ${n < 0 ? "font-medium text-destructive" : n === 0 ? "text-muted-foreground" : fuerte ? "text-base font-semibold" : "text-sm"}`}>{entero(n)}</span>
      {apoyo && <span className="min-w-0 max-w-full text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

export function EncabezadoFilasStock({ conPlataformas = false, plataforma = null }: { conPlataformas?: boolean; plataforma?: Plataforma | null }) {
  const columnas = [
    { nombre: "Disponible", ayuda: DESCRIPCION_CUBETA.disponible },
    { nombre: "Físico", ayuda: DESCRIPCION_CUBETA.fisico },
    { nombre: "Cajas", ayuda: "Cuántas cajas hay guardadas. En la ficha se ve de qué tamaño son y en qué lugar. Si no suman el stock físico, sale aviso." },
    ...(conPlataformas
      ? [
          plataforma
            ? { nombre: `En ${ETIQUETA_PLATAFORMA[plataforma]}`, ayuda: `Lo que hay en ${ETIQUETA_PLATAFORMA[plataforma]} según su última lectura. No se mezcla con el físico de tus bodegas.` }
            : { nombre: "En plataformas", ayuda: "Lo que hay en Dropi, Effi y Drop según su última lectura. No se mezcla con el físico de tus bodegas." },
        ]
      : []),
    { nombre: "Reservado", ayuda: DESCRIPCION_CUBETA.reservado },
    { nombre: "En camino", ayuda: DESCRIPCION_CUBETA.enCamino },
    { nombre: "Fuera de venta", ayuda: "En la bodega pero sin poder venderse: dañado, en inspección, retenido o vencido." },
  ];
  return (
    <div className={`hidden items-center gap-x-4 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${conPlataformas ? COLUMNAS_PLATAFORMAS : COLUMNAS}`}>
      <span>Producto</span>
      {columnas.map((c) => (
        <span key={c.nombre} className="min-w-0 truncate text-right">
          <Tooltip texto={c.ayuda}>
            <span tabIndex={0} className="cursor-help border-b border-dotted border-muted-foreground/60">
              {c.nombre}
            </span>
          </Tooltip>
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/**
 * Un SKU como fila: foto, nombre, SKU y lo que lo distingue, y sus cifras. Toda la fila abre su ficha, donde están el stock por bodega y los movimientos.
 * Un producto con variantes (`f.variantes`) se despliega en vez de abrir su ficha: pulsarlo muestra sus variantes debajo, cada una con su fila y su ficha
 * (el stock se lleva en cada variante, y las cifras del principal son la suma). `hijo` es la fila de una variante dentro de su producto.
 */
export function FilaStockLista({
  f,
  alAbrir,
  conPlataformas = false,
  plataforma = null,
  hijo = false,
  abierto,
}: {
  f: FilaStock;
  alAbrir: () => void;
  conPlataformas?: boolean;
  plataforma?: Plataforma | null;
  hijo?: boolean;
  /** Solo en un producto con variantes: si está desplegado. */
  abierto?: boolean;
}) {
  const conVariantes = f.variantes.length > 0;
  const compuesto = f.tipo === "combo";
  const armables = compuesto && f.fisico !== 0 ? "armables" : undefined;
  const fuera = fueraDeVenta(f);
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={conVariantes ? `${abierto ? "Cerrar" : "Abrir"} las ${f.variantes.length} variantes de ${f.nombre}` : `Abrir el inventario del SKU ${f.codigo}`}
      aria-expanded={conVariantes ? abierto : undefined}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 py-3 pr-4 text-left transition-colors hover:bg-muted/50 ${hijo ? "bg-muted/30 pl-10" : "pl-4"} ${conPlataformas ? COLUMNAS_PLATAFORMAS : COLUMNAS} ${anilloFoco}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="shrink-0">
          <MiniaturaFoto url={f.foto} nombre={f.nombre} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{hijo && f.opciones ? f.opciones : f.nombre}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <span className="font-mono font-semibold text-foreground">{f.codigo}</span>
            <CodigosProducto numero={f.numero} barras={f.barras} />
            {conVariantes && <Badge tone="neutral">{f.variantes.length} variantes</Badge>}
            {f.repartoPendiente && <Badge tone="neutral">{hijo ? "Sin repartir: sale del general" : "Stock sin repartir"}</Badge>}
            {compuesto && <Badge tone="neutral">{ETIQUETA_TIPO_SKU.combo}</Badge>}
            {f.clase === "test" && <Badge tone="azul">{ETIQUETA_CLASE_SKU.test}</Badge>}
            {f.clase === "inactivo" && <Badge tone="destructive">{ETIQUETA_CLASE_SKU.inactivo}</Badge>}
            {f.clase === "descontinuado" && <Badge tone="neutral">{ETIQUETA_CLASE_SKU.descontinuado}</Badge>}
          </span>
        </span>
      </span>

      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-6 lg:order-none lg:contents">
        <Cifra nombre="Disponible" n={f.disponible} fuerte apoyo={armables} />
        <Cifra nombre="Físico" n={f.fisico} apoyo={armables} />
        <Cifra nombre="Cajas" n={f.cajas} apoyo={f.cajas > 0 && f.unidadesEnCajas !== f.fisico ? <span className="text-warning">No cuadra</span> : undefined} />
        {conPlataformas &&
          (plataforma ? (
            <Cifra nombre={`En ${ETIQUETA_PLATAFORMA[plataforma]}`} n={f.plataformas?.[plataforma] ?? 0} />
          ) : (
            <Cifra nombre="En plataformas" n={f.plataformas?.total ?? 0} apoyo={textoPlataformas(f.plataformas) || undefined} />
          ))}
        <Cifra nombre="Reservado" n={f.reservado} />
        <Cifra nombre="En camino" n={f.enCamino} />
        <Cifra
          nombre="Fuera de venta"
          n={f.danado + f.inspeccion + f.retenido + f.vencido}
          apoyo={fuera.length > 0 ? fuera.map((c) => `${c.nombre} ${entero(c.n)}`).join(" · ") : undefined}
        />
      </span>

      <ChevronRightIcon
        aria-hidden="true"
        className={`h-4 w-4 text-muted-foreground transition-transform lg:order-last ${conVariantes ? (abierto ? "rotate-90" : "") : "group-hover:translate-x-0.5"}`}
      />
    </button>
  );
}
