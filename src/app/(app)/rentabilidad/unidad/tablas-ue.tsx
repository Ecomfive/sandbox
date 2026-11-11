"use client";

import type { ReactNode } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { dinero, dinero2, entero, fraccion, porcentaje, veces } from "@/lib/af4/formato";
import {
  ETIQUETA_ACCION_PRODUCTO,
  ETIQUETA_ACCION_TIENDA,
  derivados,
  sumarFilasUE,
  type AccionProducto,
  type AccionTienda,
  type EquilibrioTienda,
  type FilaUE,
  type FilaVistaUE,
} from "@/lib/finanzas/unidad-economica";
import type { PedidoUE } from "@/lib/finanzas/cargar-unidad-economica";
import { EnvioIcon, EstadoIcon, GastoIcon, PedidoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const d0 = (v: number | null) => dinero(v, "USD", { vacioSiCero: true });
const d2 = (v: number | null) => dinero2(v);
const suma = (fs: FilaUE[], f: (x: FilaUE) => number) => fs.reduce((a, x) => a + f(x), 0);
const total = (f: (t: FilaUE, d: ReturnType<typeof derivados>) => ReactNode) => (fs: FilaUE[]) => {
  const t = sumarFilasUE(fs);
  return f(t, derivados(t));
};

/** Un punto rojo antes de lo que pierde plata (el color va en el punto, no en la fila). */
function ConPunto({ alerta, texto, children }: { alerta: boolean; texto: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {alerta ? (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          <span className="sr-only">{texto}: </span>
        </>
      ) : (
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0" />
      )}
      {children}
    </span>
  );
}

const PUNTO_ACCION: Record<AccionProducto | AccionTienda, string> = {
  mantener: "bg-success",
  escalar: "bg-success",
  subir_precio: "bg-warning",
  revisar_envio: "bg-warning",
  revisar_marketing: "bg-warning",
  retirar: "bg-destructive",
  cerrar: "bg-destructive",
};

function Accion({ accion, texto }: { accion: AccionProducto | AccionTienda; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_ACCION[accion]}`} />
      {texto}
    </span>
  );
}

export function textoAccion(f: Pick<FilaVistaUE, "accion" | "montoAccion" | "precioMinimo">): string {
  const base = ETIQUETA_ACCION_PRODUCTO[f.accion];
  if (f.montoAccion === null || f.montoAccion <= 0.005) return base;
  switch (f.accion) {
    case "subir_precio":
      return `${base} ${dinero2(f.montoAccion)}${f.precioMinimo !== null ? ` (a ${dinero2(f.precioMinimo)})` : ""}`;
    case "revisar_envio":
      return `${base}: +${dinero(f.montoAccion)}`;
    case "revisar_marketing":
      return `${base}: −${dinero(f.montoAccion)}`;
    case "retirar":
      return `${base}: pierde ${dinero(f.montoAccion)}`;
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------------------------

const DEF_PRODUCTOS: DefTabla<FilaVistaUE> = {
  clave: "rentabilidad-ue-productos",
  campos: [
    { id: "etiqueta", etiqueta: "Producto", tipo: "texto", valor: (f) => f.etiqueta },
    { id: "accion", etiqueta: "Recomendación", tipo: "seleccion", valores: (f) => [ETIQUETA_ACCION_PRODUCTO[f.accion]], agrupable: true },
    { id: "ordenes", etiqueta: "Pedidos", tipo: "numero", valor: (f) => f.ordenes },
    { id: "tasa", etiqueta: "Tasa de entrega", tipo: "numero", valor: (f) => (f.tasaEntrega === null ? null : f.tasaEntrega * 100) },
    { id: "ventas", etiqueta: "Ventas", tipo: "numero", valor: (f) => f.ventas },
    { id: "margen", etiqueta: "Margen real", tipo: "numero", valor: (f) => f.margen },
    { id: "margenPct", etiqueta: "Margen %", tipo: "numero", valor: (f) => f.margenPct },
  ],
};

const COLUMNAS_PRODUCTOS: ColumnaTabla<FilaVistaUE, null>[] = [
  {
    id: "etiqueta",
    label: "Producto",
    ocultable: false,
    clase: "font-medium",
    render: (f) => (
      <ConPunto alerta={f.margen < 0} texto="Pierde plata">
        {f.etiqueta}
      </ConPunto>
    ),
  },
  { id: "ordenes", label: "Pedidos", ocultable: true, clase: num, render: (f) => entero(f.ordenes), total: (fs) => entero(suma(fs, (x) => x.ordenes)) },
  { id: "entregadas", label: "Entregados", ocultable: true, oculta: true, clase: num, render: (f) => entero(f.entregadas), total: (fs) => entero(suma(fs, (x) => x.entregadas)) },
  { id: "unidades", label: "Unidades", ocultable: true, clase: num, render: (f) => entero(f.unidadesEntregadas), total: (fs) => entero(suma(fs, (x) => x.unidadesEntregadas)) },
  { id: "tasa", label: "Tasa de entrega", ocultable: true, clase: num, render: (f) => fraccion(f.tasaEntrega), total: total((_, d) => fraccion(d.tasaEntrega)) },
  { id: "precio", label: "Precio por unidad", ocultable: true, clase: num, render: (f) => d2(f.precioUnidad), total: total((_, d) => d2(d.precioUnidad)) },
  { id: "ventas", label: "Ventas", ocultable: false, clase: num, render: (f) => d0(f.ventas), total: (fs) => d0(suma(fs, (x) => x.ventas)) },
  { id: "mercancia", label: "Mercancía", ocultable: true, clase: num, render: (f) => d0(f.mercancia), total: (fs) => d0(suma(fs, (x) => x.mercancia)) },
  {
    id: "envio",
    label: "Envío",
    descripcion: "Costo de envío de las órdenes enviadas; sin costo cargado, el supuesto por orden.",
    ocultable: true,
    clase: num,
    render: (f) => d0(f.envio),
    total: (fs) => d0(suma(fs, (x) => x.envio)),
  },
  {
    id: "devolucion",
    label: "Devoluciones",
    descripcion: "Vuelta (envío × factor) y producto perdido de las devueltas.",
    ocultable: true,
    clase: num,
    render: (f) => d0(f.devolucion),
    total: (fs) => d0(suma(fs, (x) => x.devolucion)),
  },
  { id: "comision", label: "Comisión de cobro", ocultable: true, clase: num, render: (f) => d0(f.comision), total: (fs) => d0(suma(fs, (x) => x.comision)) },
  {
    id: "marketing",
    label: "Marketing asignado",
    descripcion: "Campañas de Meta asignadas al producto y el resto del marketing de la tienda por participación en el valor de las órdenes.",
    ocultable: true,
    clase: num,
    render: (f) => d0(f.marketing),
    total: (fs) => d0(suma(fs, (x) => x.marketing)),
  },
  { id: "margen", label: "Margen real", ocultable: false, clase: `${num} font-semibold`, render: (f) => dinero(f.margen), total: (fs) => dinero(suma(fs, (x) => x.margen)) },
  { id: "margenPct", label: "Margen %", ocultable: true, clase: num, render: (f) => porcentaje(f.margenPct), total: total((_, d) => porcentaje(d.margenPct)) },
  {
    id: "efecto",
    label: "Con la tasa promedio",
    descripcion: "Cuánto cambiaría el margen si su tasa de entrega fuera la del total de la selección.",
    ocultable: true,
    clase: num,
    render: (f) => dinero(f.efectoTasa, "USD", { conSigno: true, vacioSiCero: true }),
  },
  {
    id: "precioMinimo",
    label: "Precio mínimo",
    descripcion: "Precio por unidad que deja el margen objetivo con sus costos reales.",
    ocultable: true,
    clase: num,
    render: (f) => d2(f.precioMinimo),
  },
  { id: "accion", label: "Recomendación", ocultable: false, render: (f) => <Accion accion={f.accion} texto={textoAccion(f)} /> },
];

const ICONOS_PRODUCTOS: Record<string, IconoComp> = {
  etiqueta: ProductoIcon,
  accion: EstadoIcon,
  ordenes: PedidoIcon,
  tasa: EnvioIcon,
  ventas: GastoIcon,
  margen: GastoIcon,
  margenPct: GastoIcon,
};

export function TablaProductosUE({ filas, clave = "rentabilidad-ue-productos", vacio = "No hay pedidos en este período." }: { filas: FilaVistaUE[]; clave?: string; vacio?: string }) {
  return (
    <TablaDatos
      def={clave === DEF_PRODUCTOS.clave ? DEF_PRODUCTOS : { ...DEF_PRODUCTOS, clave }}
      filas={filas}
      columnas={COLUMNAS_PRODUCTOS}
      contexto={null}
      iconos={ICONOS_PRODUCTOS}
      nombre={{ singular: "producto", plural: "productos" }}
      claveFila={(f) => f.id}
      ariaLabel="Margen real por producto"
      anchoMinimo="72rem"
      vacio={vacio}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Devoluciones por producto
// ---------------------------------------------------------------------------------------------

const DEF_DEVOLUCIONES: DefTabla<FilaVistaUE> = {
  clave: "rentabilidad-ue-devoluciones",
  campos: [
    { id: "etiqueta", etiqueta: "Producto", tipo: "texto", valor: (f) => f.etiqueta },
    { id: "devueltas", etiqueta: "Devueltos", tipo: "numero", valor: (f) => f.devueltas },
    { id: "porDevolucion", etiqueta: "Costo por devolución", tipo: "numero", valor: (f) => f.costoPorDevolucion },
    { id: "costo", etiqueta: "Costo de devoluciones", tipo: "numero", valor: (f) => f.costoDevoluciones },
  ],
};

const COLUMNAS_DEVOLUCIONES: ColumnaTabla<FilaVistaUE, null>[] = [
  { id: "etiqueta", label: "Producto", ocultable: false, clase: "font-medium", render: (f) => f.etiqueta },
  { id: "devueltas", label: "Devueltos", ocultable: false, clase: num, render: (f) => entero(f.devueltas), total: (fs) => entero(suma(fs, (x) => x.devueltas)) },
  {
    id: "tasaDev",
    label: "% devuelto",
    ocultable: true,
    clase: num,
    render: (f) => fraccion(f.enviadas ? f.devueltas / f.enviadas : null),
    total: (fs) => {
      const e = suma(fs, (x) => x.enviadas);
      return fraccion(e ? suma(fs, (x) => x.devueltas) / e : null);
    },
  },
  { id: "ida", label: "Envío de ida", ocultable: true, clase: num, render: (f) => d0(f.envioDevueltas), total: (fs) => d0(suma(fs, (x) => x.envioDevueltas)) },
  {
    id: "vuelta",
    label: "Vuelta y producto perdido",
    ocultable: true,
    clase: num,
    render: (f) => d0(f.devolucion),
    total: (fs) => d0(suma(fs, (x) => x.devolucion)),
  },
  { id: "porDevolucion", label: "Costo por devolución", ocultable: false, clase: `${num} font-semibold`, render: (f) => d2(f.costoPorDevolucion), total: total((_, d) => d2(d.costoPorDevolucion)) },
  { id: "costo", label: "Costo de devoluciones", ocultable: false, clase: num, render: (f) => dinero(f.costoDevoluciones), total: total((_, d) => dinero(d.costoDevoluciones)) },
  {
    id: "sobreVentas",
    label: "% de las ventas",
    ocultable: true,
    clase: num,
    render: (f) => fraccion(f.ventas ? f.costoDevoluciones / f.ventas : null),
  },
];

export function TablaDevolucionesUE({ filas }: { filas: FilaVistaUE[] }) {
  return (
    <TablaDatos
      def={DEF_DEVOLUCIONES}
      filas={filas}
      columnas={COLUMNAS_DEVOLUCIONES}
      contexto={null}
      iconos={{ etiqueta: ProductoIcon, devueltas: EnvioIcon, porDevolucion: GastoIcon, costo: GastoIcon }}
      nombre={{ singular: "producto", plural: "productos" }}
      claveFila={(f) => f.id}
      ariaLabel="Costo de las devoluciones por producto"
      anchoMinimo="52rem"
      vacio="No hubo devoluciones en este período."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Grupos: zona, repartidor, tamaño del pedido
// ---------------------------------------------------------------------------------------------

export type VarianteGrupo = "zona" | "repartidor" | "tamano" | "tienda";

const NOMBRE_GRUPO: Record<VarianteGrupo, { label: string; nombre: NombreFilas; aria: string }> = {
  zona: { label: "Zona", nombre: { singular: "zona", plural: "zonas" }, aria: "Margen por zona de entrega" },
  repartidor: { label: "Repartidor o transportista", nombre: { singular: "repartidor", plural: "repartidores" }, aria: "Margen por repartidor o transportista" },
  tamano: { label: "Pedido", nombre: { singular: "grupo", plural: "grupos" }, aria: "Pedidos de un producto y de varios" },
  tienda: { label: "Tienda", nombre: { singular: "tienda", plural: "tiendas" }, aria: "Margen por tienda" },
};

const defGrupo = (v: VarianteGrupo): DefTabla<FilaVistaUE> => ({
  clave: `rentabilidad-ue-${v}`,
  campos: [
    { id: "etiqueta", etiqueta: NOMBRE_GRUPO[v].label, tipo: "texto", valor: (f) => f.etiqueta },
    { id: "ordenes", etiqueta: "Pedidos", tipo: "numero", valor: (f) => f.ordenes },
    { id: "tasa", etiqueta: "Tasa de entrega", tipo: "numero", valor: (f) => (f.tasaEntrega === null ? null : f.tasaEntrega * 100) },
    { id: "margen", etiqueta: "Margen real", tipo: "numero", valor: (f) => f.margen },
    { id: "porOrden", etiqueta: "Margen por pedido", tipo: "numero", valor: (f) => f.margenPorOrden },
  ],
});
const DEFS_GRUPO: Record<VarianteGrupo, DefTabla<FilaVistaUE>> = { zona: defGrupo("zona"), repartidor: defGrupo("repartidor"), tamano: defGrupo("tamano"), tienda: defGrupo("tienda") };

const columnasGrupo = (v: VarianteGrupo): ColumnaTabla<FilaVistaUE, null>[] => [
  {
    id: "etiqueta",
    label: NOMBRE_GRUPO[v].label,
    ocultable: false,
    clase: "font-medium whitespace-nowrap",
    render: (f) => (
      <ConPunto alerta={f.margen < 0} texto="Pierde plata">
        {f.etiqueta}
      </ConPunto>
    ),
  },
  { id: "ordenes", label: "Pedidos", ocultable: false, clase: num, render: (f) => entero(f.ordenes), total: (fs) => entero(suma(fs, (x) => x.ordenes)) },
  { id: "enviadas", label: "Enviados", ocultable: true, oculta: v === "tamano", clase: num, render: (f) => entero(f.enviadas), total: (fs) => entero(suma(fs, (x) => x.enviadas)) },
  { id: "tasa", label: "Tasa de entrega", ocultable: false, clase: num, render: (f) => fraccion(f.tasaEntrega), total: total((_, d) => fraccion(d.tasaEntrega)) },
  { id: "ticket", label: "Ticket", ocultable: true, clase: num, render: (f) => d2(f.ticket), total: total((_, d) => d2(d.ticket)) },
  { id: "ventas", label: "Ventas", ocultable: true, clase: num, render: (f) => d0(f.ventas), total: (fs) => d0(suma(fs, (x) => x.ventas)) },
  { id: "envio", label: "Envío", ocultable: true, clase: num, render: (f) => d0(f.envio), total: (fs) => d0(suma(fs, (x) => x.envio)) },
  { id: "devolucion", label: "Devoluciones", ocultable: true, clase: num, render: (f) => d0(f.devolucion), total: (fs) => d0(suma(fs, (x) => x.devolucion)) },
  { id: "margen", label: "Margen real", ocultable: false, clase: `${num} font-semibold`, render: (f) => dinero(f.margen), total: (fs) => dinero(suma(fs, (x) => x.margen)) },
  { id: "margenPct", label: "Margen %", ocultable: true, clase: num, render: (f) => porcentaje(f.margenPct), total: total((_, d) => porcentaje(d.margenPct)) },
  { id: "porOrden", label: "Margen por pedido", ocultable: false, clase: num, render: (f) => d2(f.margenPorOrden), total: total((_, d) => d2(d.margenPorOrden)) },
  { id: "pierden", label: "Pedidos que pierden", ocultable: true, clase: num, render: (f) => entero(f.pierden), total: (fs) => entero(suma(fs, (x) => x.pierden)) },
  {
    id: "efecto",
    label: "Con la tasa promedio",
    descripcion: "Cuánto cambiaría el margen si su tasa de entrega fuera la del total.",
    ocultable: true,
    oculta: v === "tamano",
    clase: num,
    render: (f) => dinero(f.efectoTasa, "USD", { conSigno: true, vacioSiCero: true }),
  },
];
const COLUMNAS_GRUPO: Record<VarianteGrupo, ColumnaTabla<FilaVistaUE, null>[]> = {
  zona: columnasGrupo("zona"),
  repartidor: columnasGrupo("repartidor"),
  tamano: columnasGrupo("tamano"),
  tienda: columnasGrupo("tienda"),
};

export function TablaGrupoUE({ filas, variante }: { filas: FilaVistaUE[]; variante: VarianteGrupo }) {
  return (
    <TablaDatos
      def={DEFS_GRUPO[variante]}
      filas={filas}
      columnas={COLUMNAS_GRUPO[variante]}
      contexto={null}
      iconos={{ etiqueta: variante === "tienda" ? TiendaIcon : variante === "repartidor" ? EnvioIcon : PedidoIcon, ordenes: PedidoIcon, tasa: EnvioIcon, margen: GastoIcon, porOrden: GastoIcon }}
      nombre={NOMBRE_GRUPO[variante].nombre}
      claveFila={(f) => f.id}
      ariaLabel={NOMBRE_GRUPO[variante].aria}
      anchoMinimo="56rem"
      vacio="No hay pedidos en este período."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Pedidos que pierden plata
// ---------------------------------------------------------------------------------------------

export interface FilaPedidoUE extends PedidoUE {
  tienda: string;
}

const ESTADO: Record<string, string> = {
  entregada: "Entregado",
  devuelta: "Devuelto",
  en_transito: "En tránsito",
  pendiente: "Pendiente",
  cancelada: "Cancelado",
  no_gestionada: "No gestionado",
};

const DEF_PEDIDOS: DefTabla<FilaPedidoUE> = {
  clave: "rentabilidad-ue-pedidos",
  campos: [
    { id: "numero", etiqueta: "Pedido", tipo: "texto", valor: (f) => f.numero },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ESTADO[f.estado] ?? f.estado], agrupable: true },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
    { id: "producto", etiqueta: "Productos", tipo: "texto", valor: (f) => f.producto },
    { id: "repartidor", etiqueta: "Repartidor", tipo: "seleccion", valores: (f) => [f.repartidor ?? "Sin transportista"], agrupable: true },
    { id: "margen", etiqueta: "Margen real", tipo: "numero", valor: (f) => f.margen },
  ],
};

const COLUMNAS_PEDIDOS: ColumnaTabla<FilaPedidoUE, null>[] = [
  {
    id: "numero",
    label: "Pedido",
    ocultable: false,
    clase: "font-medium whitespace-nowrap",
    render: (f) => (
      <ConPunto alerta texto="Pierde plata">
        {f.numero}
      </ConPunto>
    ),
  },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.tienda },
  { id: "fecha", label: "Fecha", ocultable: true, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => f.fecha },
  { id: "estado", label: "Estado", ocultable: false, clase: "whitespace-nowrap", render: (f) => ESTADO[f.estado] ?? f.estado },
  { id: "producto", label: "Productos", ocultable: true, clase: "max-w-[18rem] truncate", render: (f) => f.producto },
  { id: "repartidor", label: "Repartidor", ocultable: true, oculta: true, clase: "whitespace-nowrap", render: (f) => f.repartidor ?? "—" },
  { id: "ventas", label: "Ventas", ocultable: false, clase: num, render: (f) => d2(f.ventas), total: (fs) => dinero(fs.reduce((a, x) => a + x.ventas, 0)) },
  { id: "mercancia", label: "Mercancía", ocultable: true, clase: num, render: (f) => d2(f.mercancia), total: (fs) => dinero(fs.reduce((a, x) => a + x.mercancia, 0)) },
  {
    id: "envio",
    label: "Envío",
    ocultable: true,
    clase: num,
    render: (f) => (
      <span className="inline-flex items-center gap-1">
        {f.envioSupuesto && <span className="text-xs text-muted-foreground">supuesto</span>}
        {d2(f.envio)}
      </span>
    ),
    total: (fs) => dinero(fs.reduce((a, x) => a + x.envio, 0)),
  },
  { id: "devolucion", label: "Devolución", ocultable: true, clase: num, render: (f) => d2(f.devolucion), total: (fs) => dinero(fs.reduce((a, x) => a + x.devolucion, 0)) },
  { id: "comision", label: "Comisión", ocultable: true, clase: num, render: (f) => d2(f.comision), total: (fs) => dinero(fs.reduce((a, x) => a + x.comision, 0)) },
  { id: "marketing", label: "Marketing", ocultable: true, clase: num, render: (f) => d2(f.marketing), total: (fs) => dinero(fs.reduce((a, x) => a + x.marketing, 0)) },
  { id: "margen", label: "Margen real", ocultable: false, clase: `${num} font-semibold`, render: (f) => d2(f.margen), total: (fs) => dinero(fs.reduce((a, x) => a + x.margen, 0)) },
];

export function TablaPedidosUE({ filas }: { filas: FilaPedidoUE[] }) {
  return (
    <TablaDatos
      def={DEF_PEDIDOS}
      filas={filas}
      columnas={COLUMNAS_PEDIDOS}
      contexto={null}
      iconos={{ numero: PedidoIcon, tienda: TiendaIcon, estado: EstadoIcon, producto: ProductoIcon, repartidor: EnvioIcon, margen: GastoIcon }}
      nombre={{ singular: "pedido", plural: "pedidos" }}
      claveFila={(f) => f.ordenId}
      ariaLabel="Pedidos que pierden plata"
      anchoMinimo="64rem"
      vacio="Ningún pedido pierde plata en este período."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Equilibrio y contribución por tienda
// ---------------------------------------------------------------------------------------------

export interface FilaEquilibrioUE extends EquilibrioTienda {
  id: string;
  tienda: string;
  margenPct: number | null;
}

const DEF_EQUILIBRIO: DefTabla<FilaEquilibrioUE> = {
  clave: "rentabilidad-ue-equilibrio",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "texto", valor: (f) => f.tienda },
    { id: "accion", etiqueta: "Recomendación", tipo: "seleccion", valores: (f) => [ETIQUETA_ACCION_TIENDA[f.accion]], agrupable: true },
    { id: "despues", etiqueta: "Después de fijos", tipo: "numero", valor: (f) => f.despuesDeFijos },
  ],
};

const sumaE = (fs: FilaEquilibrioUE[], f: (x: FilaEquilibrioUE) => number) => fs.reduce((a, x) => a + f(x), 0);

const COLUMNAS_EQUILIBRIO: ColumnaTabla<FilaEquilibrioUE, null>[] = [
  {
    id: "tienda",
    label: "Tienda",
    ocultable: false,
    clase: "font-medium whitespace-nowrap",
    render: (f) => (
      <ConPunto alerta={f.despuesDeFijos < 0} texto="No cubre sus fijos">
        {f.tienda}
      </ConPunto>
    ),
  },
  { id: "ordenesMes", label: "Pedidos por mes", ocultable: false, clase: num, render: (f) => entero(f.ordenesMes), total: (fs) => entero(sumaE(fs, (x) => x.ordenesMes)) },
  { id: "porOrden", label: "Margen por pedido", ocultable: false, clase: num, render: (f) => d2(f.margenPorOrden) },
  { id: "margenPct", label: "Margen %", ocultable: true, clase: num, render: (f) => porcentaje(f.margenPct) },
  { id: "contribucion", label: "Contribución por mes", ocultable: false, clase: num, render: (f) => dinero(f.contribucionMes), total: (fs) => dinero(sumaE(fs, (x) => x.contribucionMes)) },
  {
    id: "fijos",
    label: "Fijos por mes",
    descripcion: "Administración del libro de la tienda (con su parte de A DISTRIBUIR), o el monto puesto en los supuestos.",
    ocultable: false,
    clase: num,
    render: (f) => (
      <span className="inline-flex items-center gap-1">
        {f.fijosOrigen === "supuesto" && <span className="text-xs text-muted-foreground">supuesto</span>}
        {dinero(f.fijosMes)}
      </span>
    ),
    total: (fs) => dinero(sumaE(fs, (x) => x.fijosMes)),
  },
  {
    id: "equilibrio",
    label: "Pedidos para el equilibrio",
    ocultable: false,
    clase: `${num} font-semibold`,
    render: (f) => (f.ordenesEquilibrio === null ? "No se alcanza" : entero(Math.ceil(f.ordenesEquilibrio))),
  },
  {
    id: "brecha",
    label: "Pedidos que faltan",
    ocultable: true,
    clase: num,
    render: (f) => (f.ordenesEquilibrio === null ? "—" : entero(Math.max(0, Math.ceil(f.ordenesEquilibrio - f.ordenesMes)))),
  },
  { id: "despues", label: "Después de fijos", ocultable: false, clase: `${num} font-semibold`, render: (f) => dinero(f.despuesDeFijos), total: (fs) => dinero(sumaE(fs, (x) => x.despuesDeFijos)) },
  { id: "accion", label: "Recomendación", ocultable: false, render: (f) => <Accion accion={f.accion} texto={ETIQUETA_ACCION_TIENDA[f.accion]} /> },
];

export function TablaEquilibrioUE({ filas }: { filas: FilaEquilibrioUE[] }) {
  return (
    <TablaDatos
      def={DEF_EQUILIBRIO}
      filas={filas}
      columnas={COLUMNAS_EQUILIBRIO}
      contexto={null}
      iconos={{ tienda: TiendaIcon, accion: EstadoIcon, despues: GastoIcon }}
      nombre={{ singular: "tienda", plural: "tiendas" }}
      claveFila={(f) => f.id}
      ariaLabel="Punto de equilibrio y contribución por tienda"
      anchoMinimo="64rem"
      vacio="No hay pedidos en este período."
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Marketing: CAC por tienda y producto, campañas
// ---------------------------------------------------------------------------------------------

export interface FilaCacUE {
  id: string;
  etiqueta: string;
  gastoMeta: number;
  gastoMarketing: number;
  ordenes: number;
  entregadas: number;
  comprasMeta: number;
  cacOrden: number | null;
  cacEntregada: number | null;
  costoCompra: number | null;
  roasMargen: number | null;
}

const DEF_CAC: DefTabla<FilaCacUE> = {
  clave: "rentabilidad-ue-cac",
  campos: [
    { id: "etiqueta", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.etiqueta },
    { id: "gastoMeta", etiqueta: "Gasto en Meta", tipo: "numero", valor: (f) => f.gastoMeta },
    { id: "cacEntregada", etiqueta: "CAC por entregado", tipo: "numero", valor: (f) => f.cacEntregada },
  ],
};
const sumaC = (fs: FilaCacUE[], f: (x: FilaCacUE) => number) => fs.reduce((a, x) => a + f(x), 0);
const ratio = (a: number, b: number) => (a > 0 && b > 0 ? a / b : null);

const columnasCac = (etiqueta: string): ColumnaTabla<FilaCacUE, null>[] => [
  { id: "etiqueta", label: etiqueta, ocultable: false, clase: "font-medium", render: (f) => f.etiqueta },
  {
    id: "gastoMeta",
    label: "Gasto en Meta",
    descripcion: "Campañas importadas; sin campañas, el gasto en Meta del libro.",
    ocultable: false,
    clase: num,
    render: (f) => d0(f.gastoMeta),
    total: (fs) => d0(sumaC(fs, (x) => x.gastoMeta)),
  },
  { id: "gastoMarketing", label: "Marketing total", ocultable: true, clase: num, render: (f) => d0(f.gastoMarketing), total: (fs) => d0(sumaC(fs, (x) => x.gastoMarketing)) },
  { id: "ordenes", label: "Pedidos", ocultable: true, clase: num, render: (f) => entero(f.ordenes), total: (fs) => entero(sumaC(fs, (x) => x.ordenes)) },
  { id: "entregadas", label: "Entregados", ocultable: true, clase: num, render: (f) => entero(f.entregadas), total: (fs) => entero(sumaC(fs, (x) => x.entregadas)) },
  { id: "compras", label: "Compras en Meta", ocultable: true, clase: num, render: (f) => entero(f.comprasMeta), total: (fs) => entero(sumaC(fs, (x) => x.comprasMeta)) },
  { id: "cacOrden", label: "CAC por pedido", ocultable: false, clase: num, render: (f) => d2(f.cacOrden), total: (fs) => d2(ratio(sumaC(fs, (x) => x.gastoMeta), sumaC(fs, (x) => x.ordenes))) },
  {
    id: "cacEntregada",
    label: "CAC por entregado",
    ocultable: false,
    clase: `${num} font-semibold`,
    render: (f) => d2(f.cacEntregada),
    total: (fs) => d2(ratio(sumaC(fs, (x) => x.gastoMeta), sumaC(fs, (x) => x.entregadas))),
  },
  { id: "costoCompra", label: "Costo por compra (Meta)", ocultable: true, clase: num, render: (f) => d2(f.costoCompra) },
  {
    id: "roas",
    label: "ROAS de margen",
    descripcion: "Margen antes de marketing ÷ marketing total. Debajo de 1×, el margen no paga la publicidad.",
    ocultable: false,
    clase: num,
    render: (f) => (
      <ConPunto alerta={f.roasMargen !== null && f.roasMargen < 1} texto="No paga la publicidad">
        {veces(f.roasMargen)}
      </ConPunto>
    ),
  },
];
const COLUMNAS_CAC_TIENDA = columnasCac("Tienda");
const COLUMNAS_CAC_PRODUCTO = columnasCac("Producto");

export function TablaCacUE({ filas, por }: { filas: FilaCacUE[]; por: "tienda" | "producto" }) {
  return (
    <TablaDatos
      def={por === "tienda" ? DEF_CAC : { ...DEF_CAC, clave: "rentabilidad-ue-cac-producto" }}
      filas={filas}
      columnas={por === "tienda" ? COLUMNAS_CAC_TIENDA : COLUMNAS_CAC_PRODUCTO}
      contexto={null}
      iconos={{ etiqueta: por === "tienda" ? TiendaIcon : ProductoIcon, gastoMeta: GastoIcon, cacEntregada: GastoIcon }}
      nombre={por === "tienda" ? { singular: "tienda", plural: "tiendas" } : { singular: "producto", plural: "productos" }}
      claveFila={(f) => f.id}
      ariaLabel={por === "tienda" ? "Costo de adquisición por tienda" : "Costo de adquisición por producto"}
      anchoMinimo="56rem"
      vacio={por === "tienda" ? "Sin gasto de Meta en este período." : "Ninguna campaña está asignada a un producto."}
    />
  );
}

export interface FilaCampanaUE {
  id: string;
  campana: string;
  conjunto: string;
  tienda: string;
  producto: string;
  asignacion: string;
  gasto: number;
  compras: number;
  costoCompra: number | null;
  roasMargen: number | null;
  desde: string;
  hasta: string;
}

const ASIGNACION: Record<string, string> = { regla: "Por regla", manual: "A mano", sin_asignar: "Sin asignar" };

const DEF_CAMPANAS: DefTabla<FilaCampanaUE> = {
  clave: "rentabilidad-ue-campanas",
  campos: [
    { id: "campana", etiqueta: "Campaña", tipo: "texto", valor: (f) => `${f.campana} ${f.conjunto}` },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "asignacion", etiqueta: "Asignación", tipo: "seleccion", valores: (f) => [ASIGNACION[f.asignacion] ?? f.asignacion], agrupable: true },
    { id: "gasto", etiqueta: "Gasto", tipo: "numero", valor: (f) => f.gasto },
    { id: "roas", etiqueta: "ROAS de margen", tipo: "numero", valor: (f) => f.roasMargen },
  ],
};

const COLUMNAS_CAMPANAS: ColumnaTabla<FilaCampanaUE, null>[] = [
  {
    id: "campana",
    label: "Campaña",
    ocultable: false,
    clase: "max-w-[22rem]",
    render: (f) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{f.campana}</span>
        {f.conjunto && <span className="truncate text-xs text-muted-foreground">{f.conjunto}</span>}
      </span>
    ),
  },
  {
    id: "tienda",
    label: "Tienda",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) => (
      <ConPunto alerta={f.asignacion === "sin_asignar"} texto="Sin asignar">
        {f.tienda}
      </ConPunto>
    ),
  },
  { id: "producto", label: "Producto", ocultable: true, clase: "max-w-[14rem] truncate", render: (f) => f.producto },
  { id: "periodo", label: "Días", ocultable: true, oculta: true, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => (f.desde === f.hasta ? f.desde : `${f.desde} – ${f.hasta}`) },
  { id: "gasto", label: "Gasto", ocultable: false, clase: num, render: (f) => d2(f.gasto), total: (fs) => dinero(fs.reduce((a, x) => a + x.gasto, 0)) },
  { id: "compras", label: "Compras", ocultable: false, clase: num, render: (f) => entero(f.compras), total: (fs) => entero(fs.reduce((a, x) => a + x.compras, 0)) },
  { id: "costoCompra", label: "Costo por compra", ocultable: false, clase: num, render: (f) => d2(f.costoCompra) },
  {
    id: "roas",
    label: "ROAS de margen",
    descripcion: "Compras × tasa de entrega × margen antes de marketing por entregado (del producto o de la tienda) ÷ gasto.",
    ocultable: false,
    clase: `${num} font-semibold`,
    render: (f) => (
      <ConPunto alerta={f.roasMargen !== null && f.roasMargen < 1} texto="No paga la publicidad">
        {veces(f.roasMargen)}
      </ConPunto>
    ),
  },
];

export function TablaCampanasUE({ filas }: { filas: FilaCampanaUE[] }) {
  return (
    <TablaDatos
      def={DEF_CAMPANAS}
      filas={filas}
      columnas={COLUMNAS_CAMPANAS}
      contexto={null}
      iconos={{ campana: GastoIcon, tienda: TiendaIcon, asignacion: EstadoIcon, gasto: GastoIcon, roas: GastoIcon }}
      nombre={{ singular: "campaña", plural: "campañas" }}
      claveFila={(f) => f.id}
      ariaLabel="ROAS de margen por campaña"
      anchoMinimo="60rem"
      vacio="Todavía no hay campañas de Meta importadas en este período."
    />
  );
}
