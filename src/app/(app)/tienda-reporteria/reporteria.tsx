"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Indicador, TableroIndicadores } from "@/components/panel/piezas-panel";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CalendarioIcon, CerrarIcon, DeshacerIcon, EnvioIcon, InventarioIcon, MargenIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import {
  EDITABLES,
  ESTADO_REPORTERIA,
  FILTROS_RAPIDOS,
  difiereDeMatriz,
  expandirFilas,
  resumirParaFinanzas,
  resumirReporteria,
  type CampoEditable,
  type FilaReporteria,
  type FilasCompactas,
} from "@/lib/ventas/reporteria";
import type { Movimiento, TiendaReporteria } from "@/lib/ventas/reporteria-datos";
import { editarCampoReporteria } from "./actions";
import { ImportarMatriz } from "./importar-matriz";

// La Reportería de pedidos (17 nov 2026; prototipo https://claude.ai/artifact/TNhc38acs7JZzNcsLSgUze): las columnas de la Matriz en grupos que se
// muestran u ocultan, una fila por producto (como el Excel), y las de administración se editan con doble clic (quedan en Movimientos).

type Fuente = "shopify" | "monday" | "se" | "compras" | "mano" | "sistema";
const FUENTE: Record<Fuente, string> = {
  shopify: "Llega sola de Shopify.",
  monday: "La llenan Monday y el reparto (o la Matriz, en los pedidos viejos).",
  se: "La llena Servientrega / SISCORE (o la Matriz, en los pedidos viejos).",
  compras: "El «COSTO PRODUCTO» de la Matriz; si no lo trae, el costo de Compras (en gris).",
  mano: "Se llena a mano: doble clic para editar.",
  sistema: "Lo dice el sistema (Shopify, Monday y Servientrega): no se cambia a mano.",
};

const GRUPOS = [
  { id: "pedido", nombre: "Pedido" },
  { id: "cliente", nombre: "Cliente" },
  { id: "producto", nombre: "Producto" },
  { id: "entrega", nombre: "Entrega" },
  { id: "cobro", nombre: "Cobro" },
  { id: "costos", nombre: "Costos" },
  { id: "cambios", nombre: "Cambios y devoluciones" },
  { id: "factura", nombre: "Facturación" },
] as const;
type Grupo = (typeof GRUPOS)[number]["id"];

interface Contexto {
  codigoPais: string;
  puedeEscribir: boolean;
  guardar: (f: FilaReporteria, campo: CampoEditable, valor: unknown) => Promise<string | null>;
}

const vacio = <span className="text-muted-foreground">—</span>;
const txt = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? vacio : String(v));
const fechaCorta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

/** Una celda que se llena a mano: muestra el valor y, con doble clic (o Enter), un campo para cambiarlo. */
function CeldaEditable({ fila, campo, contexto }: { fila: FilaReporteria; campo: CampoEditable; contexto: Contexto }) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const valor = fila[campo.clave] as string | number | boolean | null;
  const editada = fila.editadas.includes(campo.columna);
  const mostrar = campo.tipo === "si_no" ? (valor ? "FACTURADO" : null) : campo.tipo === "monto" && typeof valor === "number" ? formatearMoneda(valor, contexto.codigoPais) : (valor as string | null);
  async function guardar(nuevo: unknown) {
    setGuardando(true);
    const e = await contexto.guardar(fila, campo, nuevo);
    setGuardando(false);
    setError(e);
    if (!e) setEditando(false);
  }
  if (editando) {
    const listaId = `ops-${campo.columna}`;
    if (campo.tipo === "si_no")
      return (
        <select autoFocus aria-label={campo.etiqueta} defaultValue={valor ? "si" : "no"} disabled={guardando} onChange={(e) => void guardar(e.target.value === "si")} onBlur={() => setEditando(false)} className="min-h-7 rounded border border-primario bg-card px-1 text-xs">
          <option value="no">Sin facturar</option>
          <option value="si">FACTURADO</option>
        </select>
      );
    return (
      <span className="inline-flex flex-col gap-0.5">
        <input
          autoFocus
          aria-label={campo.etiqueta}
          type={campo.tipo === "monto" ? "number" : "text"}
          step="0.01"
          min="0"
          list={campo.opciones ? listaId : undefined}
          defaultValue={valor === null || valor === undefined ? "" : String(valor)}
          disabled={guardando}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setError(null);
              setEditando(false);
            }
          }}
          onBlur={(e) => void guardar(e.target.value)}
          className="min-h-7 w-36 rounded border border-primario bg-card px-1.5 text-xs"
        />
        {campo.opciones && (
          <datalist id={listaId}>
            {campo.opciones.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
        {error && <span role="alert" className="text-[11px] text-destructive">{error}</span>}
      </span>
    );
  }
  if (!contexto.puedeEscribir) return <span>{mostrar ?? vacio}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      title={`${campo.etiqueta}: doble clic para editar${editada ? " (editado en el sistema)" : ""}`}
      onDoubleClick={() => setEditando(true)}
      onKeyDown={(e) => e.key === "Enter" && setEditando(true)}
      className={`relative -mx-1 inline-block min-w-12 cursor-text rounded px-1 hover:outline hover:outline-1 hover:outline-primario/40 ${editada ? "bg-primario-suave" : ""} ${anilloFoco}`}
    >
      {mostrar ?? vacio}
      {editada && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primario" />}
    </span>
  );
}

const editable = (columna: string) => EDITABLES.find((e) => e.columna === columna)!;
function celdaEditable(columna: string) {
  return function CeldaDeColumna(f: FilaReporteria, c: Contexto) {
    return <CeldaEditable fila={f} campo={editable(columna)} contexto={c} />;
  };
}
const dinero = (n: number | null, c: Contexto) => (n === null ? vacio : formatearMoneda(n, c.codigoPais));

type Col = ColumnaTabla<FilaReporteria, Contexto> & { grupo: Grupo | null };
const col = (grupo: Grupo | null, fuente: Fuente, c: Omit<ColumnaTabla<FilaReporteria, Contexto>, "descripcion" | "ocultable"> & { ocultable?: boolean }): Col => ({
  ocultable: true,
  ...c,
  grupo,
  descripcion: FUENTE[fuente],
});

// Las columnas de «Excel Matriz», en su orden.
const COLUMNAS: Col[] = [
  col(null, "shopify", { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap", render: (f) => <span className={f.linea > 1 ? "text-muted-foreground" : ""}>{f.tienda}</span> }),
  col(null, "shopify", { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap tabular-nums", render: (f) => <span className={f.linea > 1 ? "text-muted-foreground" : ""}>{fechaCorta(f.fecha)}</span> }),
  col(null, "shopify", { id: "numero", label: "N° Orden", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => (f.linea > 1 ? <span className="text-muted-foreground" title="Otro producto del mismo pedido">↳ {f.numero}</span> : f.numero) }),
  col("pedido", "shopify", { id: "estadoShopify", label: "Estado Shopify", render: (f) => txt(f.estadoShopify) }),
  col("pedido", "shopify", { id: "etiquetas", label: "Etiquetas", render: (f) => <span className="block max-w-[10rem] truncate" title={f.etiquetas ?? undefined}>{txt(f.etiquetas)}</span> }),
  col("pedido", "mano", { id: "preparacion", label: "Preparación", render: celdaEditable("preparacion") }),
  col("pedido", "shopify", { id: "notas", label: "Notas", render: (f) => <span className="block max-w-[12rem] truncate" title={f.notas ?? undefined}>{txt(f.notas)}</span> }),
  col("cliente", "shopify", { id: "cliente", label: "Nombres y apellidos", clase: "whitespace-nowrap", render: (f) => txt(f.cliente) }),
  col("cliente", "shopify", { id: "telefono", label: "Teléfono", clase: "whitespace-nowrap tabular-nums", render: (f) => txt(f.telefono) }),
  col("cliente", "shopify", { id: "provincia", label: "Provincia", render: (f) => txt(f.provincia) }),
  col("cliente", "shopify", { id: "corregimiento", label: "Corregimiento", render: (f) => txt(f.corregimiento) }),
  col("cliente", "shopify", { id: "direccion", label: "Dirección", render: (f) => <span className="block max-w-[14rem] truncate" title={f.direccion ?? undefined}>{txt(f.direccion)}</span> }),
  col("cliente", "shopify", { id: "zona", label: "Zona", render: (f) => txt(f.zona) }),
  col("producto", "shopify", { id: "producto", label: "Producto", render: (f) => <span className="block max-w-[16rem] truncate" title={f.producto ?? undefined}>{txt(f.producto)}</span> }),
  col("producto", "shopify", { id: "sku", label: "SKU", clase: "whitespace-nowrap", render: (f) => txt(f.sku) }),
  col("producto", "shopify", { id: "cantidad", label: "Cant.", alinear: "derecha", render: (f) => txt(f.cantidad) }),
  col("producto", "shopify", {
    id: "venta",
    label: "Total venta",
    alinear: "derecha",
    clase: "tabular-nums whitespace-nowrap",
    render: (f, c) => (f.linea > 1 ? <span className="text-xs text-muted-foreground">misma orden</span> : dinero(f.venta, c)),
    total: (fs) => formatearMoneda(fs.reduce((a, f) => a + (f.venta ?? 0), 0), "PA"),
  }),
  col("entrega", "sistema", {
    id: "estado",
    label: "Entregado / anulado / devolución",
    render: (f) => {
      const tono = f.estado === "entregada" ? "bg-success-soft text-success" : f.estado === "devuelta" ? "bg-warning-soft text-warning" : f.estado === "cancelada" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
      return <span className={`inline-block rounded-full px-2 py-px text-xs font-semibold ${tono}`}>{ESTADO_REPORTERIA[f.estado]}</span>;
    },
  }),
  col("entrega", "monday", {
    id: "estadoMatriz",
    label: "Según la Matriz",
    render: (f) => (f.estadoMatriz ? <span className={difiereDeMatriz(f.estado, f.estadoMatriz) ? "font-semibold text-warning" : ""} title={difiereDeMatriz(f.estado, f.estadoMatriz) ? "La Matriz dice otra cosa que el sistema: revisar" : undefined}>{f.estadoMatriz}</span> : vacio),
  }),
  col("entrega", "mano", { id: "verificado", label: "Verificado", render: celdaEditable("verificado") }),
  col("entrega", "monday", { id: "courier", label: "Courier", clase: "whitespace-nowrap", render: (f) => txt(f.courier) }),
  col("entrega", "monday", { id: "fechaEnvio", label: "Fecha de envío", clase: "whitespace-nowrap tabular-nums", render: (f) => txt(fechaCorta(f.fechaEnvio)) }),
  col("entrega", "se", { id: "resultado", label: "Exitosa / fallida", render: (f) => <span className="block max-w-[14rem] truncate" title={f.resultado ?? undefined}>{txt(f.resultado)}</span> }),
  col("entrega", "mano", { id: "motivo", label: "Motivo de cancelación", render: celdaEditable("motivo_cancelacion") }),
  col("entrega", "mano", { id: "delivery", label: "Delivery", render: celdaEditable("delivery") }),
  col("cobro", "mano", { id: "formaPago", label: "Forma de pago", render: celdaEditable("forma_pago_texto") }),
  col("cobro", "mano", { id: "mesCobro", label: "Mes de cobro", render: celdaEditable("mes_gestion") }),
  col("cobro", "mano", { id: "pagadoDelivery", label: "Monto pagado al delivery", alinear: "derecha", render: celdaEditable("monto_pagado_delivery") }),
  col("costos", "compras", {
    id: "costo",
    label: "Costo producto",
    alinear: "derecha",
    clase: "tabular-nums whitespace-nowrap",
    render: (f, c) => (f.costo === null ? vacio : <span className={f.costoFuente === "compras" ? "text-muted-foreground" : ""} title={f.costoFuente === "compras" ? "La Matriz no lo trae: es el costo de Compras" : undefined}>{formatearMoneda(f.costo, c.codigoPais)}</span>),
    total: (fs) => formatearMoneda(fs.reduce((a, f) => a + (f.costo ?? 0), 0), "PA"),
  }),
  col("costos", "mano", { id: "montoEnvio", label: "Monto envío", alinear: "derecha", render: celdaEditable("monto_envio") }),
  col("costos", "mano", { id: "montoEnvioSe", label: "Monto envío SE", alinear: "derecha", render: celdaEditable("monto_envio_se") }),
  col("cambios", "se", { id: "devueltosSe", label: "Devueltos SE", clase: "whitespace-nowrap tabular-nums", render: (f) => txt(fechaCorta(f.devueltosSe)) }),
  col("cambios", "mano", { id: "fechaDevolucion", label: "Fecha devolución / cambio", render: celdaEditable("fecha_devolucion_texto") }),
  col("cambios", "mano", { id: "cambioMonto", label: "Monto de cambio", alinear: "derecha", render: celdaEditable("cambio_monto") }),
  col("cambios", "mano", { id: "cambioFormaPago", label: "Forma de pago del cambio", render: celdaEditable("cambio_forma_pago") }),
  col("cambios", "mano", { id: "cambioEnvio", label: "Envío de cambio", alinear: "derecha", render: celdaEditable("cambio_envio") }),
  col("factura", "mano", { id: "facturado", label: "Facturado con ITBMS", render: celdaEditable("facturado") }),
  col("factura", "mano", { id: "factura", label: "N° factura", render: celdaEditable("factura_numero") }),
  col("factura", "mano", { id: "bloque", label: "Bloque facturado", render: celdaEditable("bloque_facturado") }),
];

const NOMBRE: NombreFilas = { singular: "línea", plural: "líneas" };
const ICONOS: Record<string, IconoComp> = { estado: PedidoIcon, tienda: TiendaIcon, courier: EnvioIcon, pago: MargenIcon, mes: CalendarioIcon, fecha: CalendarioIcon };

function defReporteria(): DefTabla<FilaReporteria> {
  const sel = (id: string, etiqueta: string, valor: (f: FilaReporteria) => string | null, sinValor: string) => ({
    id,
    etiqueta,
    tipo: "seleccion" as const,
    valores: (f: FilaReporteria) => [valor(f) ?? SIN_VALOR],
    etiquetaSinValor: sinValor,
    agrupable: true,
  });
  return {
    clave: "tienda-reporteria",
    campos: [
      {
        id: "buscar",
        etiqueta: "Buscar",
        tipo: "texto",
        sinCsv: true,
        valor: (f) => [f.numero, f.cliente, f.telefono, f.sku, f.producto, f.factura, f.direccion, f.corregimiento].filter(Boolean).join(" "),
      },
      { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.estado], opciones: () => Object.entries(ESTADO_REPORTERIA).map(([valor, etiqueta]) => ({ valor, etiqueta })), agrupable: true },
      sel("tienda", "Tienda", (f) => f.tienda, "Sin tienda"),
      sel("courier", "Courier", (f) => f.courier, "Sin courier"),
      sel("pago", "Forma de pago", (f) => f.formaPago, "Sin forma de pago"),
      sel("verificado", "Verificado", (f) => f.verificado, "Sin verificar"),
      sel("mes", "Mes de cobro", (f) => f.mesCobro, "Sin mes de cobro"),
      { id: "facturado", etiqueta: "Facturado", tipo: "seleccion", valores: (f) => [f.facturado ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Facturado" }, { valor: "no", etiqueta: "Sin facturar" }], agrupable: true },
      sel("zona", "Zona", (f) => f.zona, "Sin zona"),
      sel("provincia", "Provincia", (f) => f.provincia, "Sin provincia"),
      { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
    ],
    total: (f) => f.venta ?? 0,
    csvAntes: [
      { etiqueta: "Tienda", valor: (f) => f.tienda },
      { etiqueta: "Fecha", valor: (f) => fechaCorta(f.fecha) ?? "" },
      { etiqueta: "N° Orden", valor: (f) => f.numero },
      { etiqueta: "Nombres y apellidos", valor: (f) => f.cliente ?? "" },
      { etiqueta: "Total venta", valor: (f) => (f.linea > 1 ? "DUPLICADO" : (f.venta ?? null)) },
      { etiqueta: "Cantidad", valor: (f) => f.cantidad ?? null },
      { etiqueta: "Nombre producto", valor: (f) => f.producto ?? "" },
      { etiqueta: "SKU", valor: (f) => f.sku ?? "" },
      { etiqueta: "Provincia", valor: (f) => f.provincia ?? "" },
      { etiqueta: "Corregimiento", valor: (f) => f.corregimiento ?? "" },
      { etiqueta: "Dirección", valor: (f) => f.direccion ?? "" },
      { etiqueta: "Teléfono", valor: (f) => f.telefono ?? "" },
      { etiqueta: "Preparación del pedido", valor: (f) => f.preparacion ?? "" },
      { etiqueta: "Estado pedido Shopify", valor: (f) => f.estadoShopify ?? "" },
      { etiqueta: "Etiquetas", valor: (f) => f.etiquetas ?? "" },
      { etiqueta: "Etiqueta de zona", valor: (f) => f.zona ?? "" },
      { etiqueta: "Notas", valor: (f) => f.notas ?? "" },
      { etiqueta: "Entregado / anulado / devolución", valor: (f) => ESTADO_REPORTERIA[f.estado] },
      { etiqueta: "Según la Matriz", valor: (f) => f.estadoMatriz ?? "" },
      { etiqueta: "Forma de pago", valor: (f) => f.formaPago ?? "" },
      { etiqueta: "Verificado", valor: (f) => f.verificado ?? "" },
      { etiqueta: "Courier", valor: (f) => f.courier ?? "" },
      { etiqueta: "Monto envío", valor: (f) => f.montoEnvio ?? null },
      { etiqueta: "Fecha de envío", valor: (f) => fechaCorta(f.fechaEnvio) ?? "" },
      { etiqueta: "Costo producto", valor: (f) => f.costo ?? null },
      { etiqueta: "Motivo de cancelación", valor: (f) => f.motivo ?? "" },
      { etiqueta: "Monto envío SE", valor: (f) => f.montoEnvioSe ?? null },
      { etiqueta: "Exitosa / fallida", valor: (f) => f.resultado ?? "" },
      { etiqueta: "Mes de cobro", valor: (f) => f.mesCobro ?? "" },
      { etiqueta: "Monto de cambio", valor: (f) => f.cambioMonto ?? null },
      { etiqueta: "Forma de pago del cambio", valor: (f) => f.cambioFormaPago ?? "" },
      { etiqueta: "Devueltos SE", valor: (f) => fechaCorta(f.devueltosSe) ?? "" },
      { etiqueta: "Envío de cambio", valor: (f) => f.cambioEnvio ?? null },
      { etiqueta: "Fecha devolución / cambios", valor: (f) => f.fechaDevolucion ?? "" },
      { etiqueta: "Monto pagado al delivery", valor: (f) => f.pagadoDelivery ?? null },
      { etiqueta: "Delivery", valor: (f) => f.delivery ?? "" },
      { etiqueta: "Facturado con ITBMS", valor: (f) => (f.facturado ? "FACTURADO" : "") },
      { etiqueta: "N° factura", valor: (f) => f.factura ?? "" },
      { etiqueta: "Bloque facturado", valor: (f) => f.bloque ?? "" },
    ],
    pdf: ["Tienda", "Fecha", "N° Orden", "Nombres y apellidos", "Total venta", "Nombre producto", "Entregado / anulado / devolución", "Forma de pago", "Courier"],
  };
}
const DEF = defReporteria();
// Para la gente de una tienda cliente (tiendas limitadas, 17 nov 2026): sin el costo del producto, tampoco en el Excel.
const DEF_SIN_COSTOS: DefTabla<FilaReporteria> = { ...DEF, csvAntes: DEF.csvAntes?.filter((c) => c.etiqueta !== "Costo producto") };

const RAPIDOS: { id: keyof typeof FILTROS_RAPIDOS | "todos"; titulo: string; detalle: string; icono: IconoComp; color: "violeta" | "verde" | "ambar" | "rojo" | "azul" }[] = [
  { id: "todos", titulo: "Pedidos", detalle: "del mes", icono: PedidoIcon, color: "violeta" },
  { id: "entregados", titulo: "Entregados", detalle: "cobrados o entregados", icono: InventarioIcon, color: "verde" },
  { id: "devoluciones", titulo: "Devoluciones", detalle: "volvieron", icono: DeshacerIcon, color: "rojo" },
  { id: "anulados", titulo: "Anulados", detalle: "cancelados", icono: CerrarIcon, color: "rojo" },
  { id: "sinEstado", titulo: "Sin estado", detalle: "en camino o por gestionar", icono: EnvioIcon, color: "violeta" },
  { id: "sinFacturar", titulo: "Sin facturar", detalle: "entregados", icono: MargenIcon, color: "ambar" },
  { id: "difieren", titulo: "Difiere de la Matriz", detalle: "el estado no coincide: revisar", icono: AlertaIcon, color: "ambar" },
];
const CLAVE_RESUMEN: Record<string, keyof ReturnType<typeof resumirReporteria>> = {
  todos: "pedidos",
  entregados: "entregados",
  devoluciones: "devoluciones",
  anulados: "anulados",
  sinEstado: "sinEstado",
  porVerificar: "porVerificar",
  sinMesCobro: "sinMesCobro",
  sinFacturar: "sinFacturar",
  difieren: "difieren",
};

const etiquetaMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" }).replace(/^./, (c) => c.toUpperCase());
const NOMBRE_CAMPO = new Map(EDITABLES.map((e) => [e.columna, e.etiqueta]));

export function Reporteria({
  filas: compactas,
  tiendas,
  tiendaId,
  mes,
  meses,
  movimientos: movInicial,
  codigoPais,
  puedeEscribir,
  sinCostos = false,
}: {
  /** En forma compacta (`compactarFilas`): un mes de todas las tiendas pesa mucho menos así. */
  filas: FilasCompactas;
  tiendas: TiendaReporteria[];
  tiendaId: string | null;
  mes: string;
  meses: string[];
  movimientos: Movimiento[];
  codigoPais: string;
  puedeEscribir: boolean;
  /** Quien tiene tiendas limitadas no ve el costo del producto ni el margen (17 nov 2026). */
  sinCostos?: boolean;
}) {
  const router = useRouter();
  const inicial = useMemo(() => expandirFilas(compactas), [compactas]);
  const [filas, setFilas] = useState(inicial);
  const [movimientos, setMovimientos] = useState(movInicial);
  const [base, setBase] = useState(inicial);
  // Si la página trae otro mes u otra tienda, se toman sus filas (se ajusta al dibujar, sin efecto).
  if (base !== inicial) {
    setBase(inicial);
    setFilas(inicial);
    setMovimientos(movInicial);
  }
  const [rapido, setRapido] = useState<string>("todos");
  const [grupos, setGrupos] = useState<Set<Grupo>>(new Set(GRUPOS.map((g) => g.id)));
  const [importar, setImportar] = useState(false);

  const r = useMemo(() => resumirReporteria(filas), [filas]);
  const visibles = useMemo(() => (rapido === "todos" ? filas : filas.filter(FILTROS_RAPIDOS[rapido as keyof typeof FILTROS_RAPIDOS])), [filas, rapido]);
  const columnas = useMemo(() => COLUMNAS.filter((c) => (c.grupo === null || grupos.has(c.grupo)) && !(sinCostos && c.id === "costo")), [grupos, sinCostos]);
  const finanzas = useMemo(() => resumirParaFinanzas(filas), [filas]);

  const contexto = useMemo<Contexto>(
    () => ({
      codigoPais,
      puedeEscribir,
      guardar: async (fila, campo, valor) => {
        const res = await editarCampoReporteria(fila.ordenId, campo.columna, valor).catch(() => ({ error: "No se pudo guardar. Revisa la conexión." }) as { error?: string; valor?: unknown });
        if (res.error) return res.error;
        const antes = fila[campo.clave];
        if (String(antes ?? "") === String(res.valor ?? "")) return null;
        setFilas((fs) =>
          fs.map((f) => (f.ordenId === fila.ordenId ? { ...f, [campo.clave]: res.valor ?? null, editadas: f.editadas.includes(campo.columna) ? f.editadas : [...f.editadas, campo.columna] } : f)),
        );
        const comoTexto = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v));
        setMovimientos((m) => [
          { id: `nuevo-${Date.now()}`, ordenId: fila.ordenId, numero: fila.numero, campo: campo.columna, antes: comoTexto(antes), despues: comoTexto(res.valor), quien: "Tú", cuando: new Date().toISOString() },
          ...m,
        ]);
        return null;
      },
    }),
    [codigoPais, puedeEscribir],
  );

  const hrefCon = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const t = "tienda" in cambios ? cambios.tienda : tiendaId;
    const m = "mes" in cambios ? cambios.mes : mes;
    if (t) p.set("tienda", t);
    if (m) p.set("mes", m);
    return `/tienda-reporteria?${p.toString()}`;
  };
  const num = (n: number) => n.toLocaleString("es-PA");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Tienda" className="flex flex-wrap gap-2">
          {[{ id: null as string | null, nombre: "Todas" }, ...tiendas].map((t) => (
            <Link
              key={t.id ?? "todas"}
              href={hrefCon({ tienda: t.id })}
              aria-current={tiendaId === t.id ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium ${anilloFoco} ${tiendaId === t.id ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`}
            >
              {t.nombre}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="reporteria-mes">
            Mes
          </label>
          <select id="reporteria-mes" value={mes} onChange={(e) => router.push(hrefCon({ mes: e.target.value }))} className={`min-h-9 rounded-md border border-border bg-card px-2.5 text-sm ${anilloFoco}`}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {etiquetaMes(m)}
              </option>
            ))}
          </select>
          {puedeEscribir && (
            <button type="button" onClick={() => setImportar(true)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              ↻ Actualizar desde la Matriz
            </button>
          )}
        </div>
      </div>

      <TableroIndicadores etiqueta="Resumen del mes">
        {RAPIDOS.map((k) => {
          const n = r[CLAVE_RESUMEN[k.id]];
          return (
            <Indicador
              key={k.id}
              titulo={k.titulo}
              icono={k.icono}
              color={k.color}
              punto={k.id === "difieren" && n ? "aviso" : undefined}
              valor={num(n)}
              detalle={k.detalle}
              alPulsar={() => setRapido((x) => (x === k.id || k.id === "todos" ? "todos" : k.id))}
              activo={rapido === k.id}
            />
          );
        })}
      </TableroIndicadores>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Grupos de columnas">
        <span className="mr-1 text-xs text-muted-foreground">Columnas:</span>
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={grupos.has(g.id)}
            onClick={() =>
              setGrupos((s) => {
                const n = new Set(s);
                if (n.has(g.id)) n.delete(g.id);
                else n.add(g.id);
                return n;
              })
            }
            className={`rounded-full border px-2.5 py-0.5 text-xs ${anilloFoco} ${grupos.has(g.id) ? "border-primario bg-primario-suave text-primario" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}
          >
            {g.nombre}
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">Las celdas con fondo al pasar el cursor se llenan a mano: doble clic para editar. Las demás llegan solas.</span>
      </div>

      <TablaDatos
        def={sinCostos ? DEF_SIN_COSTOS : DEF}
        filas={visibles}
        columnas={columnas}
        contexto={contexto}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={(n) => formatearMoneda(n, codigoPais)}
        ariaLabel="Reportería de pedidos"
        anchoMinimo="140rem"
        aspecto="lista"
        densa
        encabezadoMayusculas
        fijarEncabezado
        porPagina={100}
        vacio="No hay pedidos de este mes en estas tiendas."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="t-mov" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="t-mov" className="m-0 text-sm font-semibold">
              Movimientos
            </h2>
            <span className="text-xs text-muted-foreground">quién cambió qué a mano (como la pestaña MOVIMIENTOS del Excel)</span>
          </div>
          {movimientos.length ? (
            <ul className="m-0 flex max-h-72 list-none flex-col gap-1.5 overflow-y-auto p-0">
              {movimientos.map((m) => (
                <li key={m.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 rounded-md bg-muted px-2.5 py-1.5 text-[13px]">
                  <time className="text-xs text-muted-foreground tabular-nums" dateTime={m.cuando}>
                    {new Date(m.cuando).toLocaleString("es-PA", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" })}
                  </time>
                  <span>
                    <b className="font-semibold">{m.quien ?? "Sistema"}</b> · {m.numero} · {NOMBRE_CAMPO.get(m.campo) ?? m.campo}: {m.antes ? <span className="text-muted-foreground line-through">{m.antes}</span> : null}
                    {m.antes ? " → " : ""}
                    <b className="font-semibold">{m.despues ?? "—"}</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">Todavía nadie ha cambiado nada a mano en estas tiendas.</p>
          )}
        </section>

        {!sinCostos && (
        <section aria-labelledby="t-fin" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="t-fin" className="m-0 text-sm font-semibold">
              Lo que pasa a Ventas por tienda
            </h2>
            <span className="text-xs text-muted-foreground">{etiquetaMes(mes)}</span>
          </div>
          <p className="m-0 text-xs text-muted-foreground">Finanzas no carga nada aparte: sale de estos mismos pedidos. Ventas y costo de lo entregado; envío de todo lo que salió.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground uppercase">
                  <th className="py-1 pr-2 font-semibold">Tienda</th>
                  <th className="px-2 py-1 text-right font-semibold">Pedidos</th>
                  <th className="px-2 py-1 text-right font-semibold">Entregados</th>
                  <th className="px-2 py-1 text-right font-semibold">Ventas</th>
                  <th className="px-2 py-1 text-right font-semibold">Costo</th>
                  <th className="px-2 py-1 text-right font-semibold">Envío</th>
                  <th className="py-1 pl-2 text-right font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody>
                {finanzas.map((x) => (
                  <tr key={x.tiendaId} className="border-t border-border tabular-nums">
                    <td className="py-1 pr-2">{x.tienda}</td>
                    <td className="px-2 py-1 text-right">{num(x.pedidos)}</td>
                    <td className="px-2 py-1 text-right">{num(x.entregados)}</td>
                    <td className="px-2 py-1 text-right">{formatearMoneda(x.ventas, codigoPais)}</td>
                    <td className="px-2 py-1 text-right">{formatearMoneda(x.costo, codigoPais)}</td>
                    <td className="px-2 py-1 text-right">{formatearMoneda(x.envio, codigoPais)}</td>
                    <td className="py-1 pl-2 text-right font-semibold">{formatearMoneda(x.margen, codigoPais)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link href="/ventas-tiendas" className="self-start text-xs font-medium text-primario hover:underline">
            Abrir Ventas por tienda
          </Link>
        </section>
        )}
      </div>

      <Ventana abierto={importar} alCerrar={() => setImportar(false)} titulo="Actualizar desde la Matriz" ancho="md">
        <ImportarMatriz
          alTerminar={() => {
            setImportar(false);
            router.refresh();
          }}
        />
      </Ventana>
    </div>
  );
}
