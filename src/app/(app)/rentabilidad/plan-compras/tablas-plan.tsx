"use client";

import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import { dias, dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import type { OrdenPlan, ResumenProductoPlan } from "@/lib/finanzas/plan-compras";
import { CalendarioIcon, EnvioIcon, EstadoIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const ETIQUETA_VIA: Record<string, string> = { mar: "Marítimo", aire: "Aéreo", tierra: "Terrestre" };

function Punto({ tono }: { tono: "warning" | "destructive" }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tono === "warning" ? "bg-warning" : "bg-destructive"}`} />;
}

function Producto({ codigo, producto }: { codigo: string; producto: string }) {
  return (
    <span className="line-clamp-2">
      <span className={`text-muted-foreground ${claseCifra}`}>{codigo}</span> {producto}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Órdenes
// ---------------------------------------------------------------------------------------------
const DEF_ORDENES: DefTabla<OrdenPlan> = {
  clave: "rentabilidad-plan-ordenes",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (o) => `${o.codigo} ${o.producto}` },
    { id: "mes", etiqueta: "Mes del pedido", tipo: "seleccion", valores: (o) => [mesCorto(`${o.fechaPedido.slice(0, 7)}-01`)], agrupable: true },
    { id: "estado", etiqueta: "A tiempo", tipo: "seleccion", valores: (o) => [o.atrasada ? "Atrasada" : "A tiempo"], agrupable: true },
    { id: "via", etiqueta: "Vía", tipo: "seleccion", valores: (o) => [ETIQUETA_VIA[o.via] ?? o.via], agrupable: true },
    { id: "pedido", etiqueta: "Pedir el", tipo: "fecha", valor: (o) => o.fechaPedido },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (o) => o.monto ?? 0 },
  ],
  vistaInicial: { agrupar: "mes" },
};

const COLUMNAS_ORDENES: ColumnaTabla<OrdenPlan, null>[] = [
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-sm", render: (o) => <Producto codigo={o.codigo} producto={o.producto} /> },
  {
    id: "pedido",
    label: "Pedir el",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (o) => (
      <span className="inline-flex items-center gap-1.5">
        {o.atrasada && <Punto tono="destructive" />}
        {fechaCorta(o.fechaPedido)}
      </span>
    ),
  },
  { id: "envio", label: "Envío", ocultable: true, clase: "whitespace-nowrap", render: (o) => fechaCorta(o.fechaEnvio) },
  {
    id: "llegada",
    label: "Llega",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (o) => `${fechaCorta(o.fechaLlegada)}${o.diasTarde > 0 ? ` · ${dias(o.diasTarde)} tarde` : ""}`,
  },
  { id: "via", label: "Vía", ocultable: true, clase: "whitespace-nowrap", render: (o) => ETIQUETA_VIA[o.via] ?? o.via },
  { id: "cantidad", label: "Unidades", ocultable: false, clase: num, render: (o) => entero(o.cantidad), total: (os) => entero(os.reduce((a, o) => a + o.cantidad, 0)) },
  { id: "necesaria", label: "Necesarias", ocultable: true, oculta: true, clase: num, render: (o) => entero(o.necesaria) },
  { id: "costo", label: "Costo unitario", ocultable: true, clase: num, render: (o) => dinero(o.costoUnitario, "USD", { decimales: 2 }) },
  { id: "monto", label: "Monto", ocultable: false, clase: `${num} font-medium`, render: (o) => (o.monto === null ? "Sin costo" : dinero(o.monto)), total: (os) => dinero(os.reduce((a, o) => a + (o.monto ?? 0), 0)) },
  { id: "anticipo", label: "Anticipo", ocultable: true, clase: num, render: (o) => dinero(o.anticipo), total: (os) => dinero(os.reduce((a, o) => a + (o.anticipo ?? 0), 0)) },
  { id: "saldo", label: "Saldo", ocultable: true, clase: num, render: (o) => (o.saldo === null ? SIN_DATO : `${dinero(o.saldo)} · ${fechaCorta(o.fechaSaldo)}`) },
];

const ICONOS_ORDENES: Record<string, IconoComp> = { producto: ProductoIcon, mes: CalendarioIcon, estado: EstadoIcon, via: EnvioIcon, pedido: CalendarioIcon, monto: GastoIcon };
const NOMBRE_ORDENES: NombreFilas = { singular: "orden", plural: "órdenes" };

export function TablaOrdenesPlan({ ordenes }: { ordenes: OrdenPlan[] }) {
  return (
    <TablaDatos
      def={DEF_ORDENES}
      filas={ordenes}
      columnas={COLUMNAS_ORDENES}
      contexto={null}
      iconos={ICONOS_ORDENES}
      nombre={NOMBRE_ORDENES}
      claveFila={(o) => o.clave}
      ariaLabel="Órdenes del plan de compras"
      anchoMinimo="64rem"
      vacio="El stock y lo que viene en camino cubren la demanda de todo el plan."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------------------------
const DEF_PRODUCTOS: DefTabla<ResumenProductoPlan> = {
  clave: "rentabilidad-plan-productos",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (p) => `${p.codigo} ${p.producto}` },
    { id: "quiebre", etiqueta: "Sin stock desde", tipo: "fecha", valor: (p) => p.quiebre ?? "" },
    { id: "plan", etiqueta: "En el plan", tipo: "seleccion", valores: (p) => [p.ordenes ? "Con órdenes" : "Cubierto"], agrupable: true },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (p) => p.monto ?? 0 },
  ],
};

const COLUMNAS_PRODUCTOS: ColumnaTabla<ResumenProductoPlan, null>[] = [
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-sm", render: (p) => <Producto codigo={p.codigo} producto={p.producto} /> },
  { id: "stock", label: "Stock", ocultable: false, clase: num, render: (p) => entero(p.stock) },
  { id: "enCamino", label: "En camino", ocultable: true, clase: num, render: (p) => (p.enCamino ? entero(p.enCamino) : SIN_DATO) },
  { id: "demanda", label: "Demanda del plan", ocultable: false, clase: num, render: (p) => entero(p.demanda) },
  {
    id: "quiebre",
    label: "Sin stock desde",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (p) =>
      p.quiebre ? (
        <span className="inline-flex items-center gap-1.5">
          <Punto tono="warning" />
          {fechaCorta(p.quiebre)}
        </span>
      ) : (
        SIN_DATO
      ),
  },
  { id: "ordenes", label: "Órdenes", ocultable: false, clase: num, render: (p) => entero(p.ordenes) },
  { id: "unidades", label: "Unidades a pedir", ocultable: false, clase: num, render: (p) => entero(p.unidades) },
  { id: "monto", label: "Monto", ocultable: false, clase: `${num} font-medium`, render: (p) => (p.monto === null ? "Sin costo" : dinero(p.monto)), total: (ps) => dinero(ps.reduce((a, p) => a + (p.monto ?? 0), 0)) },
  { id: "final", label: "Stock al final", ocultable: true, clase: num, render: (p) => entero(p.stockFinal) },
];

const ICONOS_PRODUCTOS: Record<string, IconoComp> = { producto: ProductoIcon, quiebre: CalendarioIcon, plan: EstadoIcon, monto: GastoIcon };
const NOMBRE_PRODUCTOS: NombreFilas = { singular: "producto", plural: "productos" };

export function TablaProductosPlan({ productos }: { productos: ResumenProductoPlan[] }) {
  return (
    <TablaDatos
      def={DEF_PRODUCTOS}
      filas={productos}
      columnas={COLUMNAS_PRODUCTOS}
      contexto={null}
      iconos={ICONOS_PRODUCTOS}
      nombre={NOMBRE_PRODUCTOS}
      claveFila={(p) => p.skuId}
      ariaLabel="Productos del plan de compras"
      anchoMinimo="56rem"
      vacio="No hay productos con demanda proyectada."
    />
  );
}
