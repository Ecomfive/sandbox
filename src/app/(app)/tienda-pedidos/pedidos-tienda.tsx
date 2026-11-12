"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Indicador, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { formatearMoneda } from "@/lib/formato";
import { Tooltip } from "@/components/ui/tooltip";
import { AlertaIcon, CalendarioIcon, CerrarIcon, ChatIcon, CheckIcon, ShopifyLogo, WhatsAppLogo, DeshacerIcon, EnvioIcon, EtiquetaIcon, InventarioIcon, MargenIcon, PedidoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ESTADOS_PEDIDO, diaPanama, resumirPedidos, type EstadoPedido } from "@/lib/tienda/resumen";
import type { PedidoFila } from "@/lib/tienda/datos";
import { FichaPedido } from "./ficha-pedido";

const ESTADO = new Map(ESTADOS_PEDIDO.map((e) => [e.id, e]));
const NOMBRE: NombreFilas = { singular: "pedido", plural: "pedidos" };
const ICONOS: Record<string, IconoComp> = {
  estado: PedidoIcon,
  entrada: ChatIcon,
  tienda: TiendaIcon,
  zona: EnvioIcon,
  corregimiento: EnvioIcon,
  producto: ProductoIcon,
  etiqueta: EtiquetaIcon,
  riesgo: AlertaIcon,
  transportista: EnvioIcon,
  fecha: CalendarioIcon,
  total: MargenIcon,
};
/** Por dónde entró el pedido, como en Mi Reto Digital: el ícono va antes del número. */
const ENTRADA = {
  bot: { texto: "Lo tomó el bot por WhatsApp", icono: WhatsAppLogo, clase: "" },
  shopify: { texto: "Entró por Shopify", icono: ShopifyLogo, clase: "" },
} as const;

function NumeroPedido({ p }: { p: PedidoFila }) {
  const e = p.entrada ? ENTRADA[p.entrada] : null;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {e ? (
        <Tooltip texto={e.texto}>
          <span tabIndex={0} aria-label={e.texto} className="inline-flex">
            <e.icono className={`h-4 w-4 ${e.clase}`.trim()} />
          </span>
        </Tooltip>
      ) : (
        <span aria-hidden="true" className="inline-block w-4" />
      )}
      {p.numero}
    </span>
  );
}

const RIESGO: Record<string, { etiqueta: string; tono: "aviso" | "peligro" }> = { medio: { etiqueta: "Medio", tono: "aviso" }, alto: { etiqueta: "Alto", tono: "peligro" } };

function cuando(iso: string, sinHora = false): string {
  const d = new Date(iso);
  // Del Excel de Finanzas: solo el día (no tiene hora).
  if (sinHora) return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
  const dia = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });
  if (dia(d) === dia(hoy)) return `hoy ${hora}`;
  if (dia(d) === dia(new Date(hoy.getTime() - 86_400_000))) return `ayer ${hora}`;
  return `${d.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" })} ${hora}`;
}

interface Contexto {
  codigoPais: string;
  tiendas: Record<string, string>;
}

/** Las columnas, como en Mi Reto Digital: se ocultan y se reordenan desde «Columnas». */
const COLUMNAS: ColumnaTabla<PedidoFila, Contexto>[] = [
  { id: "pedido", label: "Pedido", ocultable: false, clase: "font-semibold text-primario whitespace-nowrap", render: (p) => <NumeroPedido p={p} /> },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (p, c) => c.tiendas[p.tiendaId] ?? "—" },
  { id: "fecha", label: "Fecha", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (p) => cuando(p.creado, p.sinHora) },
  { id: "cliente", label: "Cliente", ocultable: true, render: (p) => <span className="block max-w-[14rem] truncate">{p.cliente ?? "—"}</span> },
  {
    id: "pedidos",
    label: "Pedidos",
    descripcion: "Cuántos pedidos tiene el cliente en total (por su teléfono), contando este.",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (p) => p.pedidosCliente ?? "—",
  },
  {
    id: "riesgo",
    label: "Riesgo",
    descripcion: "Por el historial del cliente: medio si tuvo una devolución o cancelación y pocas entregas; alto si tuvo dos o más y más que entregas.",
    ocultable: true,
    render: (p) => (p.riesgo ? <Pastilla tono={RIESGO[p.riesgo].tono}>{RIESGO[p.riesgo].etiqueta}</Pastilla> : <span className="text-muted-foreground">—</span>),
  },
  {
    id: "productos",
    label: "Productos",
    ocultable: true,
    // Con la foto del producto (la de Shopify), como en Mi Reto Digital.
    render: (p) => (
      <span className="flex max-w-[18rem] items-center gap-2" title={p.productos ?? undefined}>
        {p.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.foto} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded border border-border object-cover" />
        )}
        <span className="truncate">{p.productos ?? "—"}</span>
      </span>
    ),
  },
  { id: "total", label: "Total", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap", render: (p, c) => formatearMoneda(p.total, c.codigoPais) },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (p) => {
      const e = ESTADO.get(p.estado)!;
      return <Pastilla tono={e.tono}>{e.etiqueta}</Pastilla>;
    },
  },
  {
    id: "direccion",
    label: "Dirección",
    ocultable: true,
    // Una sola línea, como una lista: la zona y el lugar, y la dirección en gris; entera al pasar el cursor.
    render: (p) => {
      const lugar = [p.provincia, p.ciudad].filter(Boolean).join(", ");
      const todo = [lugar, p.direccion].filter(Boolean).join(" · ");
      return (
        <span className="block max-w-[20rem] truncate" title={todo || undefined}>
          {lugar || "—"}
          {p.direccion && <span className="text-muted-foreground"> · {p.direccion}</span>}
        </span>
      );
    },
  },
  {
    id: "etiquetas",
    label: "Etiquetas",
    ocultable: true,
    render: (p) =>
      p.etiquetas?.length ? (
        <span className="flex max-w-[18rem] items-center gap-1 overflow-hidden whitespace-nowrap" title={p.etiquetas.join(", ")}>
          {p.etiquetas.slice(0, 2).map((e) => (
            <Pastilla key={e}>{e}</Pastilla>
          ))}
          {p.etiquetas.length > 2 && <span className="shrink-0 text-xs text-muted-foreground">+{p.etiquetas.length - 2}</span>}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "transportista",
    label: "Transportista",
    ocultable: true,
    oculta: true,
    clase: "text-muted-foreground whitespace-nowrap",
    render: (p) => (p.transportista ? `${p.transportista}${p.guia ? ` · ${p.guia}` : ""}` : "—"),
  },
];

/** Los filtros y la descarga de la lista (la tienda solo si hay varias). */
function defPedidos(tiendas: Record<string, string>): DefTabla<PedidoFila> {
  return {
    clave: "tienda-pedidos",
    campos: [
      // La búsqueda de la barra: número, cliente, guía, dirección y productos.
      { id: "buscar", etiqueta: "Buscar", tipo: "texto", sinCsv: true, valor: (p) => [p.numero, p.cliente, p.guia, p.direccion, p.ciudad, p.provincia, p.productos].filter(Boolean).join(" ") },
      {
        id: "estado",
        etiqueta: "Estado",
        tipo: "seleccion",
        valores: (p) => [p.estado],
        opciones: () => ESTADOS_PEDIDO.map((e) => ({ valor: e.id, etiqueta: e.etiqueta })),
        agrupable: true,
      },
      ...(Object.keys(tiendas).length > 1
        ? [{ id: "tienda", etiqueta: "Tienda", tipo: "seleccion" as const, valores: (p: PedidoFila) => [p.tiendaId], formatearValor: (v: string) => tiendas[v] ?? v, agrupable: true }]
        : []),
      {
        id: "entrada",
        etiqueta: "Entró por",
        tipo: "seleccion",
        valores: (p) => [p.entrada ?? "excel"],
        opciones: () => [
          { valor: "shopify", etiqueta: "Shopify" },
          { valor: "bot", etiqueta: "El bot por WhatsApp" },
          { valor: "excel", etiqueta: "Excel de Finanzas" },
        ],
        agrupable: true,
      },
      { id: "zona", etiqueta: "Zona", tipo: "seleccion", valores: (p) => [p.provincia ?? SIN_VALOR], etiquetaSinValor: "Sin zona", agrupable: true },
      { id: "corregimiento", etiqueta: "Lugar", tipo: "seleccion", valores: (p) => [p.ciudad ?? SIN_VALOR], etiquetaSinValor: "Sin lugar", agrupable: true },
      { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (p) => (p.productosLista?.length ? p.productosLista : [SIN_VALOR]), etiquetaSinValor: "Sin producto" },
      { id: "etiqueta", etiqueta: "Etiqueta", tipo: "seleccion", valores: (p) => (p.etiquetas?.length ? p.etiquetas : [SIN_VALOR]), etiquetaSinValor: "Sin etiquetas" },
      {
        id: "riesgo",
        etiqueta: "Riesgo",
        tipo: "seleccion",
        valores: (p) => [p.riesgo ?? "ninguno"],
        opciones: () => [
          { valor: "alto", etiqueta: "Alto" },
          { valor: "medio", etiqueta: "Medio" },
          { valor: "ninguno", etiqueta: "Sin riesgo" },
        ],
      },
      { id: "transportista", etiqueta: "Transportista", tipo: "seleccion", valores: (p) => [p.transportista ?? SIN_VALOR], etiquetaSinValor: "Sin transportista", agrupable: true },
      { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (p) => diaPanama(p.creado) },
      { id: "total", etiqueta: "Total", tipo: "numero", valor: (p) => p.total },
    ],
    total: (p) => p.total,
    csvAntes: [
      { etiqueta: "Pedido", valor: (p) => p.numero },
      { etiqueta: "Entró por", valor: (p) => (p.entrada ? ENTRADA[p.entrada].texto : "Excel de Finanzas") },
      { etiqueta: "Tienda", valor: (p) => tiendas[p.tiendaId] ?? "" },
      { etiqueta: "Fecha y hora", valor: (p) => cuando(p.creado, p.sinHora) },
      { etiqueta: "Cliente", valor: (p) => p.cliente },
      { etiqueta: "Pedidos del cliente", valor: (p) => p.pedidosCliente ?? null },
      { etiqueta: "Productos", valor: (p) => (p.productosLista ?? []).join(" | ") },
      { etiqueta: "Unidades", valor: (p) => p.unidades },
      { etiqueta: "Dirección", valor: (p) => p.direccion ?? "" },
      { etiqueta: "Guía", valor: (p) => p.guia ?? "" },
    ],
    pdf: ["Pedido", "Fecha y hora", "Cliente", "Productos", "Total", "Estado", "Zona", "Lugar"],
  };
}

/**
 * Gestión de tienda › Pedidos (12 nov 2026, como en Mi Reto Digital): el tablero de tarjetas (filtran la lista al pulsarlas) y la lista con la barra común
 * —buscar, filtros por estado, zona, lugar, producto, etiqueta, riesgo y transportista, columnas que se ocultan y se reordenan, y Descargar—. Tocar
 * cualquier parte de una fila abre la ficha del pedido a un lado, sin salir de la lista.
 */
export function PedidosTienda({
  pedidos,
  codigoPais,
  tiendas,
  sinVincular,
  conectada,
  abrirInicial = null,
}: {
  pedidos: PedidoFila[];
  codigoPais: string;
  tiendas: Record<string, string>;
  /** Variantes de Shopify de esas tiendas que todavía no tienen producto nuestro. */
  sinVincular: number;
  /** Si alguna de las tiendas que se miran ya está conectada (sin eso, la lista vacía lo explica). */
  conectada: boolean;
  /** El pedido que llega en la dirección (`?pedido=`): se abre su ficha al entrar (el enlace copiado o el aviso de «Nuevo pedido»). */
  abrirInicial?: string | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoPedido | null>(null);
  const [abierto, setAbierto] = useState<string | null>(abrirInicial);
  const [orden, setOrden] = useState<string[]>([]);
  // Si ya se está en Pedidos y llega otro `?pedido=` (el «Ver» del aviso de «Nuevo pedido»), se abre esa ficha (se ajusta al dibujar, sin efecto).
  const [inicialVisto, setInicialVisto] = useState(abrirInicial);
  if (abrirInicial !== inicialVisto) {
    setInicialVisto(abrirInicial);
    if (abrirInicial) setAbierto(abrirInicial);
  }
  const r = useMemo(() => resumirPedidos(pedidos), [pedidos]);
  const filas = useMemo(() => (estado ? pedidos.filter((p) => p.estado === estado) : pedidos), [pedidos, estado]);
  const def = useMemo(() => defPedidos(tiendas), [tiendas]);
  const contexto = useMemo(() => ({ codigoPais, tiendas }), [codigoPais, tiendas]);
  const columnas = useMemo(() => (Object.keys(tiendas).length > 1 ? COLUMNAS : COLUMNAS.filter((c) => c.id !== "tienda")), [tiendas]);
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);
  const num = (n: number) => n.toLocaleString("es-PA");
  const alternar = (e: EstadoPedido) => setEstado((x) => (x === e ? null : e));

  // La ficha abierta queda en la dirección (`?pedido=`), así se puede copiar o recargar.
  const marcarEnDireccion = useCallback((id: string | null) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("pedido", id);
    else u.searchParams.delete("pedido");
    window.history.replaceState(window.history.state, "", u.toString());
  }, []);
  const abrir = useCallback(
    (id: string) => {
      setAbierto(id);
      marcarEnDireccion(id);
    },
    [marcarEnDireccion],
  );

  return (
    <div className="flex flex-col gap-5">
      <TableroIndicadores etiqueta="Tablero de pedidos">
        <Indicador titulo="Pedidos" icono={PedidoIcon} color="violeta" valor={num(r.pedidos)} detalle="todos los del periodo" alPulsar={() => setEstado(null)} activo={!estado} />
        <Indicador titulo="Por confirmar" icono={AlertaIcon} color="ambar" punto={r.porEstado.nuevo ? "aviso" : undefined} valor={num(r.porEstado.nuevo)} detalle="esperan llamada o mensaje" alPulsar={() => alternar("nuevo")} activo={estado === "nuevo"} />
        <Indicador titulo="Confirmados" icono={CheckIcon} color="azul" valor={num(r.porEstado.confirmado)} detalle={`${pct(r.confirmacion)} pasó la confirmación`} alPulsar={() => alternar("confirmado")} activo={estado === "confirmado"} />
        <Indicador titulo="En camino" icono={EnvioIcon} color="violeta" valor={num(r.porEstado.en_camino)} detalle="con guía, sin entregar" alPulsar={() => alternar("en_camino")} activo={estado === "en_camino"} />
        <Indicador titulo="Entregados" icono={InventarioIcon} color="verde" punto={r.porEstado.entregado ? "exito" : undefined} valor={num(r.porEstado.entregado)} detalle={`${pct(r.entrega)} de lo que salió`} alPulsar={() => alternar("entregado")} activo={estado === "entregado"} />
        <Indicador titulo="Cancelados" icono={CerrarIcon} color="rojo" valor={num(r.porEstado.cancelado)} detalle={pct(r.cancelacion)} alPulsar={() => alternar("cancelado")} activo={estado === "cancelado"} />
        <Indicador titulo="Devoluciones" icono={DeshacerIcon} color="rojo" valor={num(r.porEstado.devuelto)} detalle={pct(r.devolucion)} alPulsar={() => alternar("devuelto")} activo={estado === "devuelto"} />
        <Indicador titulo="SKU sin vincular" icono={AlertaIcon} color="ambar" punto={sinVincular ? "aviso" : undefined} valor={num(sinVincular)} detalle="variantes de Shopify sin producto nuestro" href="/tienda-productos" />
      </TableroIndicadores>

      <TablaDatos
        def={def}
        filas={filas}
        columnas={columnas}
        contexto={contexto}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(p) => p.id}
        formatearTotal={(n) => formatearMoneda(n, codigoPais)}
        abrirFila={{
          etiqueta: (p) => `Abrir el pedido ${p.numero}`,
          alAbrir: (p, ids) => {
            // Los pedidos que llegan por la conexión propia de Shopify (sin datos de Finanzas) siguen en su página.
            if (!p.productosLista) return router.push(`/tienda-pedidos/${p.id}`);
            setOrden(ids);
            abrir(p.id);
          },
        }}
        ariaLabel="Pedidos"
        anchoMinimo="64rem"
        aspecto="lista"
        asaColumnas
        encabezadoMayusculas
        vacio={conectada ? "No hay pedidos en este periodo." : "Los pedidos aparecen aquí al conectar la tienda a Shopify."}
      />

      <FichaPedido
        id={abierto}
        orden={orden.length ? orden : filas.map((p) => p.id)}
        alCerrar={() => {
          setAbierto(null);
          marcarEnDireccion(null);
        }}
        alIr={abrir}
      />
    </div>
  );
}
