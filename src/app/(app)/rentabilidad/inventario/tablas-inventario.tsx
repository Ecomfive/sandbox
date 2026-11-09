"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { ETIQUETA_TRAMO, type BodegaInventario, type LoteValorizado, type ProductoInventario, type TramoLento } from "@/lib/finanzas/inventario-valorizado";
import { BodegaIcon, CalendarioIcon, EstadoIcon, GastoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta } from "@/lib/af4/fecha";
import { dias, dinero, entero, SIN_DATO, veces } from "@/lib/af4/formato";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const usd = (v: number) => dinero(v);
const usd2 = (v: number | null) => dinero(v, "USD", { decimales: 2 });
const total = (filas: { valor: number }[]) => usd(filas.reduce((a, f) => a + f.valor, 0));

function Punto({ tono }: { tono: "warning" | "destructive" }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tono === "warning" ? "bg-warning" : "bg-destructive"}`} />;
}

// ---------------------------------------------------------------------------------------------
// Por bodega
// ---------------------------------------------------------------------------------------------
const DEF_BODEGAS: DefTabla<BodegaInventario> = {
  clave: "rentabilidad-inventario-bodegas",
  campos: [
    { id: "bodega", etiqueta: "Bodega", tipo: "texto", valor: (f) => f.bodega },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (f) => [f.tipo === "externa" ? "Externa" : "Propia"], agrupable: true },
    { id: "valor", etiqueta: "Valor", tipo: "numero", valor: (f) => f.valor },
    { id: "unidades", etiqueta: "Unidades", tipo: "numero", valor: (f) => f.unidades },
  ],
};
const COLUMNAS_BODEGAS: ColumnaTabla<BodegaInventario, null>[] = [
  { id: "bodega", label: "Bodega", ocultable: false, clase: "font-medium whitespace-nowrap", render: (f) => f.bodega },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "text-muted-foreground", render: (f) => (f.tipo === "externa" ? "Externa" : "Propia") },
  { id: "productos", label: "Productos", ocultable: true, clase: num, render: (f) => entero(f.productos) },
  { id: "unidades", label: "Unidades", ocultable: false, clase: num, render: (f) => entero(f.unidades) },
  {
    id: "sinCosto",
    label: "Sin costo",
    ocultable: true,
    clase: num,
    render: (f) =>
      f.sinCosto ? (
        <span className="inline-flex items-center gap-1.5">
          <Punto tono="warning" />
          {entero(f.sinCosto)}
        </span>
      ) : (
        SIN_DATO
      ),
  },
  { id: "valor", label: "Valor", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.valor), total },
];

const ICONOS_BODEGAS: Record<string, IconoComp> = { bodega: BodegaIcon, tipo: EstadoIcon, valor: GastoIcon, unidades: InventarioIcon };
const NOMBRE_BODEGAS: NombreFilas = { singular: "bodega", plural: "bodegas" };

export function TablaBodegas({ filas }: { filas: BodegaInventario[] }) {
  return (
    <TablaDatos
      def={DEF_BODEGAS}
      filas={filas}
      columnas={COLUMNAS_BODEGAS}
      contexto={null}
      iconos={ICONOS_BODEGAS}
      nombre={NOMBRE_BODEGAS}
      claveFila={(f) => f.bodegaId}
      ariaLabel="Inventario por bodega"
      vacio="No hay stock en ninguna bodega."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Por producto
// ---------------------------------------------------------------------------------------------
const tramoTexto = (t: TramoLento | null) => (t ? ETIQUETA_TRAMO[t] : "Con salidas recientes");

const DEF_PRODUCTOS: DefTabla<ProductoInventario> = {
  clave: "rentabilidad-inventario-productos",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.producto}` },
    { id: "tramo", etiqueta: "Movimiento", tipo: "seleccion", valores: (f) => [tramoTexto(f.tramo)], agrupable: true },
    { id: "costo", etiqueta: "Costo", tipo: "seleccion", valores: (f) => [f.sinCosto ? "Sin costo" : "Con costo"], agrupable: true },
    { id: "valor", etiqueta: "Valor", tipo: "numero", valor: (f) => f.valor },
    { id: "unidades", etiqueta: "Unidades", tipo: "numero", valor: (f) => f.unidades },
    { id: "dio", etiqueta: "DIO", tipo: "numero", valor: (f) => f.dio ?? 0 },
    { id: "salida", etiqueta: "Última salida", tipo: "fecha", valor: (f) => f.ultimaSalida ?? "" },
  ],
};
interface CtxProductos {
  tasa: number;
  umbral: number;
}
const mantenerAnual = (f: ProductoInventario, tasa: number) => Math.round(Math.max(f.valor, 0) * tasa * 100) / 100;

const COLUMNAS_PRODUCTOS: ColumnaTabla<ProductoInventario, CtxProductos>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    clase: "max-w-sm",
    render: (f) => (
      <span className="flex min-w-0 items-center gap-1.5">
        {f.sinCosto && <Punto tono="warning" />}
        <span className="line-clamp-2">
          <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span> {f.producto}
        </span>
      </span>
    ),
  },
  { id: "unidades", label: "Unidades", ocultable: false, clase: num, render: (f) => entero(f.unidades) },
  { id: "costo", label: "Costo unitario", ocultable: true, clase: num, render: (f) => (f.sinCosto && f.costoUnitario === null ? "Sin costo" : usd2(f.costoUnitario)) },
  { id: "valor", label: "Valor", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.valor), total },
  { id: "vendidas", label: "Vendidas 90 d", ocultable: true, clase: num, render: (f) => (f.vendidas ? entero(f.vendidas) : SIN_DATO) },
  { id: "rotacion", label: "Rotación anual", ocultable: true, clase: num, render: (f) => veces(f.rotacion) },
  {
    id: "dio",
    label: "DIO",
    ocultable: false,
    clase: num,
    render: (f, c) =>
      (f.dio ?? 0) > c.umbral || (f.vendidas <= 0 && f.unidades > 0) ? (
        <span className="inline-flex items-center gap-1.5">
          <Punto tono="warning" />
          {f.vendidas <= 0 ? "Sin ventas" : dias(f.dio)}
        </span>
      ) : (
        dias(f.dio)
      ),
  },
  {
    id: "mantener",
    label: "Mantener al año",
    ocultable: true,
    clase: num,
    render: (f, c) => (f.valor > 0 ? usd(mantenerAnual(f, c.tasa)) : SIN_DATO),
  },
  {
    id: "salida",
    label: "Última salida",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.tramo && f.tramo !== "60" && <Punto tono={f.tramo === "180" ? "destructive" : "warning"} />}
        {f.ultimaSalida ? `${fechaCorta(f.ultimaSalida)} · ${dias(f.diasSinSalida)}` : "Sin salidas"}
      </span>
    ),
  },
  { id: "bodegas", label: "Bodegas", ocultable: true, clase: num, render: (f) => entero(f.bodegas) },
];

const ICONOS_PRODUCTOS: Record<string, IconoComp> = { producto: ProductoIcon, tramo: EstadoIcon, costo: GastoIcon, valor: GastoIcon, unidades: InventarioIcon, dio: CalendarioIcon, salida: CalendarioIcon };
const NOMBRE_PRODUCTOS: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaProductos({ filas, tasa, umbral }: { filas: ProductoInventario[]; tasa: number; umbral: number }) {
  return (
    <TablaDatos
      def={DEF_PRODUCTOS}
      filas={filas}
      columnas={COLUMNAS_PRODUCTOS}
      contexto={{ tasa, umbral }}
      iconos={ICONOS_PRODUCTOS}
      nombre={NOMBRE_PRODUCTOS}
      claveFila={(f) => f.skuId}
      ariaLabel="Inventario por producto"
      vacio="No hay productos con stock."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Vencimientos
// ---------------------------------------------------------------------------------------------
const DEF_LOTES: DefTabla<LoteValorizado> = {
  clave: "rentabilidad-inventario-vencimientos",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.producto} ${f.lote}` },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.estado === "vencido" ? "Vencido" : "Por vencer"], agrupable: true },
    { id: "vence", etiqueta: "Vence", tipo: "fecha", valor: (f) => f.vencimiento },
    { id: "valor", etiqueta: "Valor", tipo: "numero", valor: (f) => f.valor },
  ],
};
const COLUMNAS_LOTES: ColumnaTabla<LoteValorizado, null>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    clase: "max-w-sm",
    render: (f) => (
      <span className="line-clamp-2">
        <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span> {f.producto}
      </span>
    ),
  },
  { id: "lote", label: "Lote", ocultable: false, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => f.lote },
  {
    id: "vence",
    label: "Vence",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        <Punto tono={f.estado === "vencido" ? "destructive" : "warning"} />
        {fechaCorta(f.vencimiento)} · {f.diasRestantes < 0 ? `hace ${dias(-f.diasRestantes)}` : `en ${dias(f.diasRestantes)}`}
      </span>
    ),
  },
  { id: "cantidad", label: "Unidades", ocultable: false, clase: num, render: (f) => entero(f.cantidad) },
  { id: "valor", label: "Valor", ocultable: false, clase: `${num} font-medium`, render: (f) => (f.costoUnitario === null ? "Sin costo" : usd(f.valor)), total },
];

const ICONOS_LOTES: Record<string, IconoComp> = { producto: ProductoIcon, estado: EstadoIcon, vence: CalendarioIcon, valor: GastoIcon };
const NOMBRE_LOTES: NombreFilas = { singular: "lote", plural: "lotes" };

export function TablaVencimientos({ filas }: { filas: LoteValorizado[] }) {
  return (
    <TablaDatos
      def={DEF_LOTES}
      filas={filas}
      columnas={COLUMNAS_LOTES}
      contexto={null}
      iconos={ICONOS_LOTES}
      nombre={NOMBRE_LOTES}
      claveFila={(f) => f.loteId}
      ariaLabel="Lotes vencidos y por vencer"
      vacio="No hay lotes vencidos ni por vencer."
    />
  );
}
