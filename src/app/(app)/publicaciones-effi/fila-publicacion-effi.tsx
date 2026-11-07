"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Effi */
import type { ReactNode } from "react";
import { EtapaCotizando, LlegadaCamino } from "@/app/(app)/publicaciones-dropi/llegada-camino";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { anilloFoco } from "@/components/ui/field";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { ETIQUETA_SUGERENCIA, type TipoSugerencia } from "@/lib/publicaciones/vincular";
import { margenBajoEffi, sinStockEffi, type FilaPublicacionEffi } from "./def-publicaciones-effi";
import { InsigniaConectadoEffi } from "./insignia-conectado-effi";

/** Las columnas de la fila en pantalla ancha; las usa también el encabezado, así que van juntas. */
const COLUMNAS = "lg:grid-cols-[minmax(0,2.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_1rem]";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });

const Punto = ({ clase, texto }: { clase: string; texto: string }) => <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />;

function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full overflow-hidden text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

function Monto({ valor, moneda, className = "" }: { valor: number | null; moneda: MonedaPublicaciones; className?: string }) {
  const usd = formatoEnDolares(valor, moneda);
  return (
    <span className={className}>
      {formatoMonto(valor, moneda)}
      {usd && <span className="ml-1 text-xs font-normal text-muted-foreground">{usd}</span>}
    </span>
  );
}

function CeldaEnCamino({ f }: { f: FilaPublicacionEffi }) {
  const viene = f.enCamino > 0;
  const cotiza = f.enCotizacion > 0;
  return (
    <Celda
      nombre="En camino"
      alinear="derecha"
      principal={
        viene ? (
          <span className="font-medium tabular-nums text-success">{entero(f.enCamino)} en camino</span>
        ) : cotiza ? (
          <span className="font-medium tabular-nums text-warning">{entero(f.enCotizacion)} en cotización</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      }
      apoyo={
        viene ? (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-normal font-medium text-success lg:justify-end">
            <LlegadaCamino llegada={f.llegadaCamino} sinFecha={f.sinFechaCamino} sinEnvio={f.sinEnvioCamino} />
          </span>
        ) : cotiza ? (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-normal lg:justify-end">{f.etapaCotizacion ? <EtapaCotizando c={f.etapaCotizacion} /> : "aún no viene"}</span>
        ) : undefined
      }
    />
  );
}

export function EncabezadoFilasEffi() {
  const columnas: { nombre: string; derecha?: boolean }[] = [
    { nombre: "Producto" },
    { nombre: "Precio", derecha: true },
    { nombre: "Utilidad y margen", derecha: true },
    { nombre: "En camino", derecha: true },
    { nombre: "Stock", derecha: true },
  ];
  return (
    <div className={`hidden items-center gap-x-4 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${COLUMNAS}`}>
      {columnas.map((c) => (
        <span key={c.nombre} className={`min-w-0 truncate ${c.derecha ? "text-right" : ""}`}>
          {c.nombre}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/** Un artículo de Effi como fila: foto, nombre con su ID, conexión y su SKU (o la sugerencia), precio, margen, en camino y stock. Toda la fila abre su ficha, donde se vincula el producto. */
export function FilaPublicacionEffiLista({ f, moneda, alAbrir }: { f: FilaPublicacionEffi; moneda: MonedaPublicaciones; alAbrir: () => void }) {
  const tipo = f.sugerencia as TipoSugerencia | null;
  return (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha de ${f.nombre}`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${COLUMNAS} ${anilloFoco}`}
    >
      <span className="flex min-w-0 items-center gap-3">
        {f.fotoUrl ? (
          <img src={f.fotoUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
        ) : (
          <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-border-control" />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{f.nombre}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
            <span className="tabular-nums">ID {f.idEffi}</span>
            <InsigniaConectadoEffi conectado={f.conectado} />
            {f.producto ? (
              <>
                <span className="font-mono font-semibold text-foreground">{f.producto.codigo}</span>
                <CodigosProducto numero={f.producto.numero} barras={f.producto.barras} />
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Punto clase="bg-warning" texto="Sin vincular producto" />
                {f.sugerido && tipo ? `${ETIQUETA_SUGERENCIA[tipo] ?? "Sugerido"} · ${f.sugerido.codigo}` : "Sin SKU"}
              </span>
            )}
            {f.referencia && <span>Ref. {f.referencia}</span>}
          </span>
        </span>
      </span>

      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:order-none lg:contents">
        <Celda
          nombre="Precio"
          alinear="derecha"
          principal={<Monto valor={f.precio} moneda={moneda} className="font-semibold tabular-nums" />}
          apoyo={
            <span className="flex flex-col lg:items-end">
              <span className="max-w-full truncate">Costo {f.costo === null ? "—" : formatoMonto(f.costo, moneda)}</span>
              <span className="max-w-full truncate">Fulfillment {f.fulfillmentPaga === "dropshipper" ? "lo paga el dropshipper" : f.fulfillment === null ? "—" : formatoMonto(f.fulfillment, moneda)}</span>
            </span>
          }
        />
        <Celda
          nombre="Utilidad bruta y margen bruto"
          alinear="derecha"
          principal={f.utilidad === null ? <span className="text-muted-foreground">—</span> : <Monto valor={f.utilidad} moneda={moneda} className="tabular-nums" />}
          apoyo={
            f.margen === null ? (
              "Sin costo o sin precio"
            ) : (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {margenBajoEffi(f) && <Punto clase="bg-destructive" texto="Margen bajo" />}
                {Math.round(f.margen * 100)} % de margen bruto
              </span>
            )
          }
        />
        <CeldaEnCamino f={f} />
        <Celda
          nombre="Stock en la bodega Principal"
          alinear="derecha"
          principal={f.stock === null ? <span className="text-muted-foreground">—</span> : <span className={`font-medium tabular-nums ${sinStockEffi(f) ? "text-destructive" : ""}`}>{sinStockEffi(f) ? "Sin stock" : `${entero(f.stock)} u.`}</span>}
          apoyo="Bodega Principal"
        />
      </span>

      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
}
