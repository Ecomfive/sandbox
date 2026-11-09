"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { fechaCorta, mesMedio } from "@/lib/af4/fecha";
import { dias, dinero, entero, fraccion, SIN_DATO } from "@/lib/af4/formato";
import { montoMerma, type MermaMes, type ModoMerma, type ProductoMuerto, type Sobrestock } from "@/lib/finanzas/inventario-decisiones";
import { CalendarioIcon, EstadoIcon, GastoIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { llevarMermaAlLibro } from "./actions";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const usd = (v: number | null) => dinero(v);
const usd2 = (v: number | null) => dinero(v, "USD", { decimales: 2 });

function Punto({ tono }: { tono: "warning" | "destructive" | "success" }) {
  const c = tono === "warning" ? "bg-warning" : tono === "destructive" ? "bg-destructive" : "bg-success";
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${c}`} />;
}

const celdaProducto = (f: { codigo: string; producto: string }) => (
  <span className="line-clamp-2">
    <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span> {f.producto}
  </span>
);

// ---------------------------------------------------------------------------------------------
// Sobrestock
// ---------------------------------------------------------------------------------------------
const DEF_SOBRESTOCK: DefTabla<Sobrestock> = {
  clave: "rentabilidad-inventario-sobrestock",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.producto}` },
    { id: "ventas", etiqueta: "Ventas", tipo: "seleccion", valores: (f) => [f.sinVentas ? "Sin ventas en 90 días" : "Con ventas"], agrupable: true },
    { id: "exceso", etiqueta: "Exceso", tipo: "numero", valor: (f) => f.exceso },
    { id: "dio", etiqueta: "DIO", tipo: "numero", valor: (f) => f.dio ?? 9999 },
  ],
};
const COLUMNAS_SOBRESTOCK: ColumnaTabla<Sobrestock, null>[] = [
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-sm", render: celdaProducto },
  { id: "unidades", label: "Unidades", ocultable: true, clase: num, render: (f) => entero(f.unidades) },
  { id: "valor", label: "Valor", ocultable: true, clase: num, render: (f) => usd(f.valor) },
  {
    id: "dio",
    label: "DIO",
    ocultable: false,
    clase: num,
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        <Punto tono={f.sinVentas ? "destructive" : "warning"} />
        {f.sinVentas ? "Sin ventas" : dias(f.dio)}
      </span>
    ),
  },
  { id: "unidadesExceso", label: "Unidades de más", ocultable: true, clase: num, render: (f) => entero(f.unidadesExceso) },
  { id: "exceso", label: "Exceso", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.exceso), total: (fs) => usd(fs.reduce((a, f) => a + f.exceso, 0)) },
];
const ICONOS_SOBRESTOCK: Record<string, IconoComp> = { producto: ProductoIcon, ventas: EstadoIcon, exceso: GastoIcon, dio: CalendarioIcon };
const NOMBRE_SOBRESTOCK: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaSobrestock({ filas }: { filas: Sobrestock[] }) {
  return (
    <TablaDatos
      def={DEF_SOBRESTOCK}
      filas={filas}
      columnas={COLUMNAS_SOBRESTOCK}
      contexto={null}
      iconos={ICONOS_SOBRESTOCK}
      nombre={NOMBRE_SOBRESTOCK}
      claveFila={(f) => f.skuId}
      ariaLabel="Productos en sobrestock"
      vacio="Ningún producto pasa los días de sobrestock."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Inventario muerto y liquidación
// ---------------------------------------------------------------------------------------------
const DEF_MUERTO: DefTabla<ProductoMuerto> = {
  clave: "rentabilidad-inventario-muerto",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.producto}` },
    { id: "precio", etiqueta: "Precio", tipo: "seleccion", valores: (f) => [f.fuentePrecio === "ventas" ? "De ventas" : f.fuentePrecio === "lista" ? "De lista" : "Sin precio"], agrupable: true },
    { id: "valor", etiqueta: "Valor", tipo: "numero", valor: (f) => f.valor },
    { id: "recuperacion", etiqueta: "Recuperación", tipo: "numero", valor: (f) => f.recuperacion },
  ],
};
const COLUMNAS_MUERTO: ColumnaTabla<ProductoMuerto, null>[] = [
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-sm", render: celdaProducto },
  { id: "unidades", label: "Unidades", ocultable: false, clase: num, render: (f) => entero(f.unidades) },
  { id: "valor", label: "Valor", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.valor), total: (fs) => usd(fs.reduce((a, f) => a + f.valor, 0)) },
  {
    id: "salida",
    label: "Última salida",
    ocultable: true,
    clase: "whitespace-nowrap",
    render: (f) => (f.ultimaSalida ? `${fechaCorta(f.ultimaSalida)} · ${dias(f.diasSinVenta)}` : "Sin salidas"),
  },
  { id: "costo", label: "Costo unitario", ocultable: true, clase: num, render: (f) => usd2(f.costoUnitario) },
  { id: "precio", label: "Precio de venta", ocultable: false, clase: num, render: (f) => usd2(f.precio) },
  { id: "maximo", label: "Descuento máximo", ocultable: true, clase: num, render: (f) => fraccion(f.descuentoMaximo, { decimales: 0 }) },
  {
    id: "descuento",
    label: "Descuento sugerido",
    ocultable: false,
    clase: num,
    render: (f) =>
      f.descuentoSugerido === null ? (
        f.precioLiquidacion !== null ? "Al costo" : SIN_DATO
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {f.descuentoMaximo !== null && f.descuentoSugerido >= f.descuentoMaximo && <Punto tono="warning" />}
          {fraccion(f.descuentoSugerido, { decimales: 0 })}
        </span>
      ),
  },
  { id: "liquidacion", label: "Precio de liquidación", ocultable: false, clase: num, render: (f) => usd2(f.precioLiquidacion) },
  { id: "recuperacion", label: "Recuperación", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.recuperacion), total: (fs) => usd(fs.reduce((a, f) => a + f.recuperacion, 0)) },
  { id: "mantener", label: "Mantener al mes", ocultable: true, clase: num, render: (f) => usd(f.costoMantenerMensual) },
];
const ICONOS_MUERTO: Record<string, IconoComp> = { producto: ProductoIcon, precio: EstadoIcon, valor: GastoIcon, recuperacion: GastoIcon };
const NOMBRE_MUERTO: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaMuerto({ filas }: { filas: ProductoMuerto[] }) {
  return (
    <TablaDatos
      def={DEF_MUERTO}
      filas={filas}
      columnas={COLUMNAS_MUERTO}
      contexto={null}
      iconos={ICONOS_MUERTO}
      nombre={NOMBRE_MUERTO}
      claveFila={(f) => f.skuId}
      ariaLabel="Inventario muerto"
      anchoMinimo="60rem"
      vacio="No hay inventario sin ventas en esta ventana."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Merma del conteo
// ---------------------------------------------------------------------------------------------
interface CtxMerma {
  modo: ModoMerma;
  puedeLlevar: boolean;
}

function BotonLlevar({ fila, modo }: { fila: MermaMes; modo: ModoMerma }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { mostrarToast } = useToast();
  const monto = montoMerma(fila, modo);
  const igual = fila.enLibro !== null && Math.abs(fila.enLibro - monto) < 0.005;
  if (igual) return <span className="text-xs text-muted-foreground">En el libro</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const r = await llevarMermaAlLibro(fila.mes, modo).catch(() => ({ error: "Se cortó la conexión." }));
            if (r.error) setError(r.error);
            else mostrarToast(`Merma de ${mesMedio(fila.mes)} en el libro`);
          })
        }
        className={`inline-flex h-7 items-center rounded-md border border-border-control bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
      >
        {fila.enLibro === null ? "Llevar al EERR" : "Actualizar en el EERR"}
      </button>
      {error && (
        <span role="alert" className="flex max-w-56 items-center gap-1.5 text-left text-xs">
          <Punto tono="destructive" />
          {error}
        </span>
      )}
    </span>
  );
}

const DEF_MERMA: DefTabla<MermaMes> = {
  clave: "rentabilidad-inventario-merma",
  campos: [
    { id: "mes", etiqueta: "Mes", tipo: "fecha", valor: (f) => f.mes },
    { id: "libro", etiqueta: "Libro", tipo: "seleccion", valores: (f) => [f.enLibro === null ? "Sin llevar" : "En el libro"], agrupable: true },
    { id: "faltante", etiqueta: "Faltantes", tipo: "numero", valor: (f) => f.valorFaltante },
  ],
};
const COLUMNAS_MERMA: ColumnaTabla<MermaMes, CtxMerma>[] = [
  { id: "mes", label: "Mes", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => mesMedio(f.mes) },
  { id: "productos", label: "Productos", ocultable: true, clase: num, render: (f) => entero(f.productos) },
  { id: "unidadesFaltantes", label: "Unidades faltantes", ocultable: true, clase: num, render: (f) => entero(f.faltante) },
  { id: "faltante", label: "Faltantes", ocultable: false, clase: num, render: (f) => usd2(f.valorFaltante) },
  { id: "unidadesSobrantes", label: "Unidades sobrantes", ocultable: true, clase: num, render: (f) => entero(f.sobrante) },
  { id: "sobrante", label: "Sobrantes", ocultable: false, clase: num, render: (f) => usd2(f.valorSobrante) },
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
  { id: "ajuste", label: "Ajuste al EERR", ocultable: false, clase: `${num} font-medium`, render: (f, c) => usd2(montoMerma(f, c.modo)) },
  { id: "enLibro", label: "En el libro", ocultable: false, clase: num, render: (f) => (f.enLibro === null ? SIN_DATO : usd2(f.enLibro)) },
];
const ICONOS_MERMA: Record<string, IconoComp> = { mes: CalendarioIcon, libro: EstadoIcon, faltante: InventarioIcon };
const NOMBRE_MERMA: NombreFilas = { singular: "mes", plural: "meses" };

export function TablaMerma({ filas, modo, puedeLlevar }: { filas: MermaMes[]; modo: ModoMerma; puedeLlevar: boolean }) {
  return (
    <TablaDatos
      def={DEF_MERMA}
      filas={filas}
      columnas={COLUMNAS_MERMA}
      contexto={{ modo, puedeLlevar }}
      iconos={ICONOS_MERMA}
      nombre={NOMBRE_MERMA}
      claveFila={(f) => f.mes}
      ariaLabel="Merma del conteo físico por mes"
      accion={puedeLlevar ? { etiqueta: "Libro", render: (f) => <BotonLlevar fila={f} modo={modo} /> } : undefined}
      vacio="No hay ajustes de conteo en los últimos meses."
    />
  );
}
