"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { BotonBarra, Punto, claseConFicha, claseFichaMinimizada } from "@/components/panel/piezas-panel";
import { almacen } from "@/components/tabla/almacen";
import { Badge } from "@/components/ui/badge";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { AdjuntoIcon, CalendarioIcon, ComprasIcon, EstadoIcon, EtiquetaIcon, GastoIcon, PersonaIcon, PrioridadIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearCompraPanel } from "./crear-compra-panel";
import { SelectorVista } from "./selector-vista";
import {
  colorEstado,
  colorEtapa,
  conEmoji,
  DEF_COMPRAS,
  diasDeCompra,
  etiquetaEstado,
  etiquetaEtapa,
  etiquetaVia,
  MONEDA_COMPRAS,
  prioridadDe,
  valorUnitario,
  type FilaCompra,
} from "./def-compras";
import { FichaCompra } from "./ficha-compra";
import { FichaLateralCompra, FichaMinimizada } from "./ficha-lateral-compra";
import { diasEntre, enGrupo, estaAtrasada, hoy, umbralesTransito, type Grupo } from "./calculos-compras";

const NOMBRE: NombreFilas = { singular: "compra", plural: "compras" };
const ICONOS: Record<string, IconoComp> = {
  pais: ComprasIcon,
  etapa: EstadoIcon,
  estado: EstadoIcon,
  proveedor: ProductoIcon,
  tienda: ComprasIcon,
  cliente: PersonaIcon,
  viaEnvio: ComprasIcon,
  prioridad: PrioridadIcon,
  etiquetas: EtiquetaIcon,
  planificacionMes: CalendarioIcon,
  codigo: EtiquetaIcon,
  qtyTotal: ProductoIcon,
  montoTotal: GastoIcon,
  valorUnitario: GastoIcon,
  primerPago: GastoIcon,
  segundoPago: GastoIcon,
  pagadoAProveedor: GastoIcon,
  pagoPendiente: GastoIcon,
  cobradoCliente: GastoIcon,
  pendienteCliente: GastoIcon,
  fechaLimite: CalendarioIcon,
  fechaLlegada: CalendarioIcon,
  fechaPago1: CalendarioIcon,
  fechaPago2: CalendarioIcon,
  fechaEnvio: CalendarioIcon,
  creado: CalendarioIcon,
  cerrado: CalendarioIcon,
  dias: CalendarioIcon,
  trackId: EstadoIcon,
  orden: EstadoIcon,
  inconveniente: EstadoIcon,
  notas: EstadoIcon,
  asignado: PersonaIcon,
  factura: EstadoIcon,
  financiamiento: GastoIcon,
};

const usd = (v: number | null) => (v !== null ? formatearMoneda(v, MONEDA_COMPRAS) : "—");
const fecha = (v: string | null) => (v ? formatearFecha(v) : "—");
const siNo = (v: boolean) => (v ? "Sí" : <span className="text-muted-foreground">No</span>);
const lista = (v: string[], f: (x: string) => string = (x) => x) => (v.length ? v.map(f).join(", ") : "—");

/** Si la ficha de la derecha está minimizada; se guarda en el navegador de cada persona. */
const CLAVE_FICHA = "compras-ficha-v1";
/** Filtros de un toque sobre las abiertas (las cerradas se ven con el botón «Cerrados» de la barra). */
const RAPIDOS: { valor: Grupo; etiqueta: string }[] = [
  { valor: "cotizando", etiqueta: "Cotizando" },
  { valor: "produccion", etiqueta: "Producción" },
  { valor: "transito", etiqueta: "En tránsito" },
  { valor: "atrasadas", etiqueta: "Atrasadas" },
];

/** Una columna con el emoji de su campo delante del nombre, como en ClickUp. */
function col(id: string, nombre: string, resto: Omit<ColumnaTabla<FilaCompra>, "id" | "label">): ColumnaTabla<FilaCompra> {
  return { id, label: conEmoji(id, nombre), ...resto };
}

/**
 * Las columnas: primero las ocho que se ven al entrar (compra, etapa, vía, creada, llegada, QTY, pagado y días) y después el
 * resto de los campos de ClickUp, ocultos hasta que cada persona los muestre desde «Columnas». La compra lleva un punto
 * rojo si está atrasada (más días en tránsito de lo normal para su vía).
 */
function columnas(umbral: Record<string, number>, dia: string): ColumnaTabla<FilaCompra>[] {
  const oculta = { ocultable: true, oculta: true } as const;
  return [
    {
      id: "nombre",
      label: "Compra",
      ocultable: false,
      render: (c) => {
        const atrasada = estaAtrasada(c, umbral, dia);
        return (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5">
              {atrasada && <Punto tono="peligro" />}
              {atrasada && <span className="sr-only">Atrasada. </span>}
              <span className="block max-w-[24rem] truncate font-medium" title={c.nombre}>
                {c.codigo && <span className="mr-1.5 font-normal text-muted-foreground">{c.codigo}</span>}
                {c.nombre}
              </span>
            </span>
            <span className="block text-xs text-muted-foreground">{[c.paisCodigo ?? "Importadora", c.proveedor, c.asignadoNombre].filter(Boolean).join(" · ")}</span>
          </span>
        );
      },
    },
    col("etapa", "Etapa", { ocultable: true, render: (c) => <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge> }),
    col("viaEnvio", "Vía de envío", { ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (c) => lista(c.viaEnvio, etiquetaVia) }),
    col("creado", "Creada", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.creadoEn) }),
    col("fechaLlegada", "Fecha de llegada", {
      ocultable: true,
      clase: "whitespace-nowrap",
      render: (c) =>
        c.fechaLlegada ? (
          fecha(c.fechaLlegada)
        ) : c.fechaEnvio ? (
          <span className={estaAtrasada(c, umbral, dia) ? "text-destructive" : "text-muted-foreground"}>en tránsito {diasEntre(c.fechaEnvio, dia)} d</span>
        ) : (
          "—"
        ),
    }),
    col("qtyTotal", "QTY Total", { ocultable: true, clase: "tabular-nums", render: (c) => c.qtyTotal ?? "—" }),
    col("pagadoAProveedor", "Pagado a Proveedor", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.pagadoAProveedor) }),
    col("dias", "Días", { ocultable: true, clase: "tabular-nums", render: (c) => diasDeCompra(c) }),
    col("foto", "Foto", {
      ...oculta,
      render: (c) =>
        c.fotoUrl ? (
          <TarjetaEmergente
            clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
            contenido={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.fotoUrl} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.fotoUrl} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />
          </TarjetaEmergente>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <AdjuntoIcon className="h-3.5 w-3.5" />
          </div>
        ),
    }),
    col("codigo", "Código", { ...oculta, clase: "text-muted-foreground tabular-nums whitespace-nowrap", render: (c) => c.codigo ?? "—" }),
    col("pais", "País", { ...oculta, clase: "text-muted-foreground", render: (c) => c.paisCodigo ?? (c.paisesDestino.length ? `→ ${c.paisesDestino.join(", ")}` : "—") }),
    col("estado", "Estado", { ...oculta, render: (c) => <Badge color={colorEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge> }),
    col("prioridad", "Prioridad", {
      ...oculta,
      render: (c) => {
        const p = prioridadDe(c.prioridad);
        return p ? <Badge color={p.color}>{p.etiqueta}</Badge> : "—";
      },
    }),
    col("proveedor", "Proveedor", { ...oculta, clase: "text-muted-foreground", render: (c) => c.proveedor || "—" }),
    col("tienda", "Tienda", { ...oculta, clase: "text-muted-foreground", render: (c) => c.tienda || "—" }),
    col("cliente", "Cliente", { ...oculta, clase: "text-muted-foreground", render: (c) => c.cliente || "—" }),
    col("etiquetas", "Etiquetas", { ...oculta, clase: "text-muted-foreground", render: (c) => lista(c.etiquetas) }),
    col("asignado", "Responsable", { ...oculta, clase: "text-muted-foreground", render: (c) => c.asignadoNombre || "—" }),
    col("planificacion", "Planificación", { ...oculta, clase: "text-muted-foreground", render: (c) => c.planificacion || "—" }),
    col("montoTotal", "Monto Total", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.montoTotal) }),
    col("valorUnitario", "Valor Unitario", { ...oculta, clase: "tabular-nums", render: (c) => usd(valorUnitario(c)) }),
    col("primerPago", "Primer Pago", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.primerPago) }),
    col("segundoPago", "Segundo Pago", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.segundoPago) }),
    col("pagoPendiente", "Pago Pendiente", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.pagoPendiente) }),
    col("cobradoCliente", "Cobrado Cliente", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.cobradoCliente) }),
    col("pendienteCliente", "Pendiente Cliente", { ...oculta, clase: "tabular-nums", render: (c) => usd(c.pendienteCliente) }),
    col("pagoCliente", "Pago Cliente", { ...oculta, render: (c) => c.pagoCliente || "—" }),
    col("cuentaReceptora", "Cuenta receptora", { ...oculta, clase: "text-muted-foreground", render: (c) => c.cuentaReceptora || "—" }),
    col("factura", "Factura", { ...oculta, render: (c) => siNo(c.factura) }),
    col("financiamiento", "Financiamiento", { ...oculta, render: (c) => siNo(c.financiamiento) }),
    col("revisadoAA", "Revisado AA", { ...oculta, render: (c) => siNo(c.revisadoAA) }),
    col("fechaPago1", "Fecha de Pago (1)", { ...oculta, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaPago1) }),
    col("fechaPago2", "Fecha de Pago (2)", { ...oculta, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaPago2) }),
    col("fechaEnvio", "Fecha de Envío", { ...oculta, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaEnvio) }),
    col("fechaLimite", "Fecha límite", { ...oculta, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaLimite) }),
    col("trackId", "Track ID", { ...oculta, clase: "text-muted-foreground", render: (c) => c.trackId || "—" }),
    col("orden", "Orden", { ...oculta, clase: "text-muted-foreground tabular-nums", render: (c) => c.orden || "—" }),
    col("inconveniente", "Inconveniente", { ...oculta, render: (c) => c.inconveniente || "—" }),
    col("cerrado", "Cerrada", { ...oculta, clase: "whitespace-nowrap", render: (c) => fecha(c.cerradoEn) }),
  ];
}

/**
 * El tablero de Compras, una sola vista: la tabla con la barra de herramientas común (agrupar —arranca por Etapa—, filtros,
 * columnas, cerrados, descarga y «Agregar»), los filtros de un toque (cotizando, producción, en tránsito, atrasadas) y la
 * ficha de resumen fija a la derecha, que se puede minimizar. Pulsar una fila la muestra en la ficha; «Abrir ficha
 * completa» abre la actividad (comentarios, adjuntos, historial). Con la ficha minimizada, la fila abre la ficha completa.
 */
export function TablaCompras({
  compras,
  vista,
  paises,
  puedeEscribir,
  puedeAgregarPais,
  grupoInicial,
  etapaInicial,
}: {
  compras: FilaCompra[];
  vista: string;
  paises: { id: string; codigo: string; nombre: string }[];
  puedeEscribir: boolean;
  /** Puede modificar Configuración: ve «＋ País» junto al selector. */
  puedeAgregarPais: boolean;
  /** Filtro de un toque con que se llega (los enlaces del informe y del dashboard). */
  grupoInicial: Grupo | null;
  /** Etapa con que se llega desde el informe («ver las de esta etapa»). */
  etapaInicial: string;
}) {
  const [rapido, setRapido] = useState<Grupo | null>(grupoInicial && RAPIDOS.some((r) => r.valor === grupoInicial) ? grupoInicial : null);
  const [etapa, setEtapa] = useState(etapaInicial);
  const [elegida, setElegida] = useState<{ id: string; orden: string[] } | null>(null);
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const guardadoFicha = almacen(CLAVE_FICHA, "local");
  const fichaMinimizada = useSyncExternalStore(guardadoFicha.suscribir, guardadoFicha.leer, () => "") === "minimizada";

  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const dia = hoy();
  const cols = useMemo(() => columnas(umbral, dia), [umbral, dia]);
  const conteo = useMemo(() => Object.fromEntries(RAPIDOS.map((r) => [r.valor, compras.filter((c) => enGrupo(c, r.valor, umbral)).length])), [compras, umbral]);
  const filas = useMemo(() => compras.filter((c) => (!rapido || enGrupo(c, rapido, umbral)) && (!etapa || c.etapa === etapa)), [compras, rapido, etapa, umbral]);
  const resumen = elegida ? (compras.find((c) => c.id === elegida.id) ?? null) : null;
  const completa = abierta ? compras.find((c) => c.id === abierta.id) : undefined;

  return (
    <div className={fichaMinimizada ? claseFichaMinimizada : claseConFicha}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros rápidos">
          {RAPIDOS.map((r) => (
            <BotonBarra key={r.valor} activo={rapido === r.valor} onClick={() => setRapido((v) => (v === r.valor ? null : r.valor))}>
              {r.valor === "atrasadas" && conteo.atrasadas > 0 && <Punto tono="peligro" />}
              {r.etiqueta} <span className="text-muted-foreground tabular-nums">{conteo[r.valor]}</span>
            </BotonBarra>
          ))}
          {etapa && (
            <BotonBarra activo onClick={() => setEtapa("")} aria-label={`Quitar el filtro de etapa ${etiquetaEtapa(etapa)}`}>
              Etapa: {etiquetaEtapa(etapa)} ✕
            </BotonBarra>
          )}
        </div>
        <TablaDatos
          def={DEF_COMPRAS}
          filas={filas}
          columnas={cols}
          iconos={ICONOS}
          nombre={NOMBRE}
          claveFila={(c) => c.id}
          formatearTotal={(total) => formatearMoneda(total, MONEDA_COMPRAS)}
          anchoMinimo="56rem"
          porPagina={100}
          paginarSiempre
          abrirFila={{
            etiqueta: (c) => `Ver la compra ${c.nombre}`,
            alAbrir: (c, orden) => (fichaMinimizada ? setAbierta({ id: c.id, orden }) : setElegida({ id: c.id, orden })),
          }}
          claseFila={(c) => (!fichaMinimizada && c.id === elegida?.id ? "bg-accent" : "")}
          accionPrincipal={
            <div className="flex items-center gap-2">
              <SelectorVista vista={vista} paises={paises} puedeAgregarPais={puedeAgregarPais} />
              {puedeEscribir && <CrearCompraPanel vista={vista} paises={paises} />}
            </div>
          }
          ariaLabel="Tablero de compras"
          aspecto="lista"
          vacio={vista === "importacion" ? "Todavía no hay compras de Importadora." : "Todavía no hay compras registradas."}
        />
      </div>

      {fichaMinimizada ? (
        <FichaMinimizada alAbrir={() => guardadoFicha.guardar("")} />
      ) : (
        <FichaLateralCompra
          compra={resumen}
          orden={elegida?.orden ?? []}
          alIr={(id) => setElegida((e) => (e ? { ...e, id } : e))}
          alAbrir={() => resumen && setAbierta({ id: resumen.id, orden: elegida?.orden ?? [] })}
          alMinimizar={() => guardadoFicha.guardar("minimizada")}
        />
      )}
      <FichaCompra
        compra={completa}
        orden={abierta?.orden ?? []}
        paises={paises}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </div>
  );
}
