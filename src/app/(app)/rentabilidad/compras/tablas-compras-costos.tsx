"use client";

import { useState } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, fraccion, SIN_DATO } from "@/lib/af4/formato";
import type { Anticipo, CostoPuesto, GastoImportacion, PorPagarProveedor, VariacionCosto } from "@/lib/finanzas/compras-costos";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CalendarioIcon, ComprasIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { FichaCostoPuesto } from "./ficha-costo-puesto";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const usd = (v: number | null) => dinero(v);
const usd2 = (v: number | null) => dinero(v, "USD", { decimales: 2 });
const usd4 = (v: number | null) => dinero(v, "USD", { decimales: 4 });

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

function Punto({ tono }: { tono: "warning" | "destructive" | "success" }) {
  const c = tono === "warning" ? "bg-warning" : tono === "destructive" ? "bg-destructive" : "bg-success";
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${c}`} />;
}

const celdaCompra = (f: { codigo: string; nombre: string }) => (
  <span className="line-clamp-2">
    <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span> {f.nombre}
  </span>
);

// ---------------------------------------------------------------------------------------------
// Por pagar a proveedores
// ---------------------------------------------------------------------------------------------
const DEF_POR_PAGAR: DefTabla<PorPagarProveedor> = {
  clave: "rentabilidad-compras-por-pagar",
  campos: [
    { id: "compra", etiqueta: "Compra", tipo: "texto", valor: (f) => `${f.codigo} ${f.nombre} ${f.proveedor ?? ""}` },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (f) => [f.tipo === "compra" ? "Proveedor" : "Importación"], agrupable: true },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor ?? "Sin proveedor"], agrupable: true },
    { id: "fecha", etiqueta: "Fecha estimada", tipo: "fecha", valor: (f) => f.fecha ?? "" },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (f) => f.monto },
  ],
};
const COLUMNAS_POR_PAGAR: ColumnaTabla<PorPagarProveedor, null>[] = [
  { id: "compra", label: "Compra", ocultable: false, clase: "max-w-sm", render: celdaCompra },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.proveedor ?? SIN_DATO },
  { id: "concepto", label: "Concepto", ocultable: false, clase: "whitespace-nowrap", render: (f) => f.concepto },
  {
    id: "fecha",
    label: "Fecha estimada",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.vencido && <Punto tono="destructive" />}
        {f.fecha ? fechaCorta(f.fecha) : "Sin fecha"}
      </span>
    ),
  },
  { id: "monto", label: "Monto", ocultable: false, clase: `${num} font-medium`, render: (f) => usd2(f.monto), total: (fs) => usd2(fs.reduce((a, f) => a + f.monto, 0)) },
];
const ICONOS_POR_PAGAR: Record<string, IconoComp> = { compra: ComprasIcon, tipo: EstadoIcon, proveedor: ComprasIcon, fecha: CalendarioIcon, monto: GastoIcon };
const NOMBRE_PAGOS: NombreFilas = { singular: "pago", plural: "pagos" };

export function TablaPorPagar({ filas }: { filas: PorPagarProveedor[] }) {
  return (
    <TablaDatos
      def={DEF_POR_PAGAR}
      filas={filas}
      columnas={COLUMNAS_POR_PAGAR}
      contexto={null}
      iconos={ICONOS_POR_PAGAR}
      nombre={NOMBRE_PAGOS}
      claveFila={(f) => f.clave}
      ariaLabel="Cuentas por pagar a proveedores"
      vacio="No hay saldos pendientes con proveedores."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Anticipos
// ---------------------------------------------------------------------------------------------
const DEF_ANTICIPOS: DefTabla<Anticipo> = {
  clave: "rentabilidad-compras-anticipos",
  campos: [
    { id: "compra", etiqueta: "Compra", tipo: "texto", valor: (f) => `${f.codigo} ${f.nombre} ${f.proveedor ?? ""}` },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor ?? "Sin proveedor"], agrupable: true },
    { id: "anticipo", etiqueta: "Anticipo", tipo: "numero", valor: (f) => f.anticipo },
  ],
};
const COLUMNAS_ANTICIPOS: ColumnaTabla<Anticipo, null>[] = [
  { id: "compra", label: "Compra", ocultable: false, clase: "max-w-sm", render: celdaCompra },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.proveedor ?? SIN_DATO },
  { id: "envio", label: "Envío", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.fechaEnvio ? fechaCorta(f.fechaEnvio) : SIN_DATO) },
  { id: "monto", label: "Monto de la compra", ocultable: true, clase: num, render: (f) => usd2(f.montoTotal) },
  { id: "pagado", label: "Pagado", ocultable: false, clase: num, render: (f) => usd2(f.pagado) },
  { id: "gastos", label: "Gastos pagados", ocultable: true, clase: num, render: (f) => (f.gastosPagados ? usd2(f.gastosPagados) : SIN_DATO) },
  { id: "anticipo", label: "Anticipo", ocultable: false, clase: `${num} font-medium`, render: (f) => usd2(f.anticipo), total: (fs) => usd2(fs.reduce((a, f) => a + f.anticipo, 0)) },
];
const ICONOS_ANTICIPOS: Record<string, IconoComp> = { compra: ComprasIcon, proveedor: ComprasIcon, anticipo: GastoIcon };
const NOMBRE_COMPRAS: NombreFilas = { singular: "compra", plural: "compras" };

export function TablaAnticipos({ filas }: { filas: Anticipo[] }) {
  return (
    <TablaDatos
      def={DEF_ANTICIPOS}
      filas={filas}
      columnas={COLUMNAS_ANTICIPOS}
      contexto={null}
      iconos={ICONOS_ANTICIPOS}
      nombre={NOMBRE_COMPRAS}
      claveFila={(f) => f.compraId}
      ariaLabel="Anticipos a proveedores"
      vacio="No hay compras pagadas en camino."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Costo puesto en bodega
// ---------------------------------------------------------------------------------------------
interface CtxCosto {
  umbral: number;
}
const DEF_COSTO: DefTabla<CostoPuesto> = {
  clave: "rentabilidad-compras-costo-puesto",
  campos: [
    { id: "compra", etiqueta: "Compra", tipo: "texto", valor: (f) => `${f.codigo} ${f.nombre} ${f.proveedor ?? ""} ${f.lineas.map((l) => `${l.codigo} ${l.producto}`).join(" ")}` },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.abierta ? "Abierta" : "Cerrada"], agrupable: true },
    { id: "gastos", etiqueta: "Gastos", tipo: "seleccion", valores: (f) => [f.gastos > 0 ? "Con gastos de importación" : "Sin gastos de importación"], agrupable: true },
    { id: "llegada", etiqueta: "Llegada", tipo: "fecha", valor: (f) => f.fechaLlegada ?? "" },
    { id: "total", etiqueta: "Costo puesto", tipo: "numero", valor: (f) => f.total },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (f) => (f.diferencia ?? 0) * 100 },
  ],
};
const COLUMNAS_COSTO: ColumnaTabla<CostoPuesto, CtxCosto>[] = [
  { id: "compra", label: "Compra", ocultable: false, clase: "max-w-sm", render: celdaCompra },
  { id: "llegada", label: "Llegada", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.fechaLlegada ? fechaCorta(f.fechaLlegada) : "Sin llegar") },
  { id: "fob", label: "FOB", ocultable: false, clase: num, render: (f) => usd(f.fob), total: (fs) => usd(fs.reduce((a, f) => a + f.fob, 0)) },
  {
    id: "gastos",
    label: "Gastos de importación",
    ocultable: false,
    clase: num,
    render: (f) =>
      f.gastos ? (
        <span className="inline-flex items-center gap-1.5">
          {f.gastosPendientes > 0 && <Punto tono="warning" />}
          {usd(f.gastos)}
        </span>
      ) : (
        SIN_DATO
      ),
    total: (fs) => usd(fs.reduce((a, f) => a + f.gastos, 0)),
  },
  { id: "peso", label: "Gastos ÷ FOB", ocultable: true, clase: num, render: (f) => fraccion(f.pesoGastos) },
  { id: "total", label: "Costo puesto", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.total), total: (fs) => usd(fs.reduce((a, f) => a + f.total, 0)) },
  { id: "unidades", label: "Unidades", ocultable: true, clase: num, render: (f) => entero(f.unidades) },
  { id: "unitario", label: "Por unidad", ocultable: false, clase: num, render: (f) => usd4(f.unitarioReal) },
  { id: "vigente", label: "Vigente", ocultable: false, clase: num, render: (f) => usd4(f.unitarioVigente) },
  {
    id: "diferencia",
    label: "Diferencia",
    ocultable: false,
    clase: num,
    render: (f, c) =>
      f.diferencia === null ? (
        SIN_DATO
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {f.diferencia > c.umbral && <Punto tono="destructive" />}
          {fraccion(f.diferencia, { conSigno: true })}
        </span>
      ),
  },
];
const ICONOS_COSTO: Record<string, IconoComp> = { compra: ComprasIcon, estado: EstadoIcon, gastos: GastoIcon, llegada: CalendarioIcon, total: GastoIcon, diferencia: EstadoIcon };

export function TablaCostoPuesto({ filas, gastos, umbral, puedeEditar }: { filas: CostoPuesto[]; gastos: GastoImportacion[]; umbral: number; puedeEditar: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const fila = abierta ? (filas.find((f) => f.compraId === abierta) ?? null) : null;
  const i = abierta ? orden.indexOf(abierta) : -1;
  const ir = (d: number) => {
    const sig = orden[i + d];
    if (sig) setAbierta(sig);
  };
  return (
    <>
      <TablaDatos
        def={DEF_COSTO}
        filas={filas}
        columnas={COLUMNAS_COSTO}
        contexto={{ umbral }}
        iconos={ICONOS_COSTO}
        nombre={NOMBRE_COMPRAS}
        claveFila={(f) => f.compraId}
        ariaLabel="Costo puesto en bodega por compra"
        anchoMinimo="60rem"
        abrirFila={{
          etiqueta: (f) => `Abrir el costo puesto de ${f.codigo || f.nombre}`,
          alAbrir: (f, o) => {
            setOrden(o);
            setAbierta(f.compraId);
          },
        }}
        vacio="No hay compras con monto."
      />
      <FichaCostoPuesto
        fila={fila}
        gastos={fila ? gastos.filter((g) => g.compraId === fila.compraId) : []}
        puedeEditar={puedeEditar}
        alCerrar={() => setAbierta(null)}
        navegacion={
          <>
            <BotonNavegar texto="Compra anterior" icono={FlechaArribaIcon} activo={i > 0} alHacerClic={() => ir(-1)} />
            <BotonNavegar texto="Compra siguiente" icono={FlechaAbajoIcon} activo={i >= 0 && i < orden.length - 1} alHacerClic={() => ir(1)} />
          </>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Variación de costo entre lotes
// ---------------------------------------------------------------------------------------------
const DEF_VARIACION: DefTabla<VariacionCosto> = {
  clave: "rentabilidad-compras-variacion",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo ?? ""} ${f.producto}` },
    { id: "alerta", etiqueta: "Alerta", tipo: "seleccion", valores: (f) => [f.alerta ? "Subió más que el umbral" : f.variacion === null ? "Un solo lote" : "Dentro del umbral"], agrupable: true },
    { id: "variacion", etiqueta: "Variación", tipo: "numero", valor: (f) => (f.variacion ?? 0) * 100 },
    { id: "ultimo", etiqueta: "Último costo", tipo: "numero", valor: (f) => f.ultimo },
  ],
};
const COLUMNAS_VARIACION: ColumnaTabla<VariacionCosto, null>[] = [
  {
    id: "producto",
    label: "Producto",
    ocultable: false,
    clase: "max-w-sm",
    render: (f) => (
      <span className="flex min-w-0 items-center gap-1.5">
        {f.alerta && <Punto tono="destructive" />}
        <span className="line-clamp-2">
          {f.codigo && <span className={`text-muted-foreground ${claseCifra}`}>{f.codigo}</span>} {f.producto}
        </span>
      </span>
    ),
  },
  { id: "lotes", label: "Lotes", ocultable: true, clase: num, render: (f) => entero(f.lotes) },
  { id: "anterior", label: "Anterior", ocultable: false, clase: num, render: (f) => (f.anterior === null ? SIN_DATO : `${usd4(f.anterior)}${f.fechaAnterior ? ` · ${fechaCorta(f.fechaAnterior)}` : ""}`) },
  { id: "ultimo", label: "Último", ocultable: false, clase: num, render: (f) => `${usd4(f.ultimo)}${f.fechaUltimo ? ` · ${fechaCorta(f.fechaUltimo)}` : ""}` },
  { id: "variacion", label: "Variación", ocultable: false, clase: `${num} font-medium`, render: (f) => fraccion(f.variacion, { conSigno: true }) },
  { id: "total", label: "Desde el primero", ocultable: true, clase: num, render: (f) => fraccion(f.variacionTotal, { conSigno: true }) },
  { id: "rango", label: "Mínimo – máximo", ocultable: true, clase: num, render: (f) => `${usd4(f.minimo)} – ${usd4(f.maximo)}` },
];
const ICONOS_VARIACION: Record<string, IconoComp> = { producto: ProductoIcon, alerta: EstadoIcon, variacion: EstadoIcon, ultimo: GastoIcon };
const NOMBRE_PRODUCTOS: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaVariacion({ filas }: { filas: VariacionCosto[] }) {
  return (
    <TablaDatos
      def={DEF_VARIACION}
      filas={filas}
      columnas={COLUMNAS_VARIACION}
      contexto={null}
      iconos={ICONOS_VARIACION}
      nombre={NOMBRE_PRODUCTOS}
      claveFila={(f) => f.productoClave}
      ariaLabel="Variación del costo entre lotes"
      anchoMinimo="52rem"
      vacio="No hay lotes en Costos de mercancía."
    />
  );
}
