"use client";

import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { BotonBarra, Punto, claseConFicha, claseFichaMinimizada } from "@/components/panel/piezas-panel";
import { almacen } from "@/components/tabla/almacen";
import { Badge } from "@/components/ui/badge";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { AdjuntoIcon, CalendarioIcon, ComprasIcon, EstadoIcon, EtiquetaIcon, GastoIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { actualizarCampoCompra, guardarColorEtiqueta } from "./actions";
import { CeldaEditable, type GuardarCelda } from "./celda-editable";
import { EtiquetasCompra, PastillaEtiqueta } from "./selector-etiquetas";
import { CrearCompraPanel } from "./crear-compra-panel";
import { campoEditable, normalizarValor } from "./def-edicion-compras";
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
  numeroOC,
  resumenLineas,
  tituloCompra,
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

/**
 * Quita de los cambios hechos en las celdas lo que el servidor ya trae igual (y las compras que ya no existen): lo que
 * queda es lo que todavía no llegó. Así un cambio de otra persona que llegue después no queda tapado por uno viejo.
 */
function podarCambios(cambios: Record<string, Partial<FilaCompra>>, servidor: FilaCompra[]): Record<string, Partial<FilaCompra>> {
  const porId = new Map(servidor.map((c) => [c.id, c]));
  const resultado: Record<string, Partial<FilaCompra>> = {};
  let cambio = false;
  for (const [id, parcial] of Object.entries(cambios)) {
    const fila = porId.get(id);
    const pendiente = Object.fromEntries(Object.entries(parcial).filter(([k, v]) => !fila || JSON.stringify(fila[k as keyof FilaCompra]) !== JSON.stringify(v)));
    if (fila && Object.keys(pendiente).length) resultado[id] = pendiente as Partial<FilaCompra>;
    if (!fila || Object.keys(pendiente).length !== Object.keys(parcial).length) cambio = true;
  }
  return cambio ? resultado : cambios;
}

/** Una columna con el emoji de su campo delante del nombre, como en ClickUp. */
function col(id: string, nombre: string, resto: Omit<ColumnaTabla<FilaCompra>, "id" | "label">): ColumnaTabla<FilaCompra> {
  return { id, label: conEmoji(id, nombre), ...resto };
}

/**
 * Las columnas: primero las ocho del día a día (compra, etapa, vía, creada, llegada, QTY, pagado y días) y después el resto
 * de los campos de ClickUp; todas a la vista, y cada persona oculta o mueve las que quiera (arrastrando el título o desde
 * «Columnas»). La compra lleva un punto rojo si está atrasada (más días en tránsito de lo normal para su vía).
 */
function columnas(
  umbral: Record<string, number>,
  dia: string,
  edicion: { puedeEscribir: boolean; guardar: GuardarCelda; etiquetas: string[]; colores: Record<string, string>; cambiarColor: (nombre: string, color: string) => void },
): ColumnaTabla<FilaCompra>[] {
  const resto = { ocultable: true } as const;
  /** El contenido de una celda, editable en su sitio si su dato se puede editar (ver `CAMPOS_EDITABLES`). */
  const ed = (c: FilaCompra, campo: string, contenido: ReactNode) => (
    <CeldaEditable compra={c} campo={campo} puedeEscribir={edicion.puedeEscribir} guardar={edicion.guardar}>
      {contenido}
    </CeldaEditable>
  );
  return [
    { id: "numero", label: "N.º OC", ocultable: true, clase: "whitespace-nowrap tabular-nums text-muted-foreground", render: (c) => numeroOC(c.numero) },
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
                {tituloCompra(c)}
              </span>
              {c.tipo === "pais" && c.productos === 0 && (
                <span className="shrink-0 rounded-full border border-warning/40 bg-warning-soft px-1.5 py-px text-[0.65rem] font-medium whitespace-nowrap text-warning">
                  Sin productos
                </span>
              )}
              {c.etiquetas.map((e) => (
                <PastillaEtiqueta key={e} nombre={e} color={edicion.colores[e]} />
              ))}
            </span>
            <span className="block text-xs text-muted-foreground">{[c.paisCodigo ?? "Importadora", c.proveedor, c.asignadoNombre].filter(Boolean).join(" · ")}</span>
            {c.lineas.length > 0 && (
              <span className="block max-w-[28rem] truncate text-xs text-foreground-soft" title={resumenLineas(c.lineas, 50)}>
                {resumenLineas(c.lineas)}
              </span>
            )}
          </span>
        );
      },
    },
    col("etapa", "Etapa", { ocultable: true, render: (c) => ed(c, "etapa", <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge>) }),
    col("viaEnvio", "Vía de envío", { ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (c) => ed(c, "viaEnvio", lista(c.viaEnvio, etiquetaVia)) }),
    col("creado", "Creada", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.creadoEn) }),
    col("fechaLlegada", "Fecha de llegada", {
      ocultable: true,
      clase: "whitespace-nowrap",
      render: (c) =>
        ed(
          c,
          "fechaLlegada",
          c.fechaLlegada ? (
            fecha(c.fechaLlegada)
          ) : c.fechaEnvio ? (
            <span className={estaAtrasada(c, umbral, dia) ? "text-destructive" : "text-muted-foreground"}>en tránsito {diasEntre(c.fechaEnvio, dia)} d</span>
          ) : (
            "—"
          ),
        ),
    }),
    col("qtyTotal", "QTY Total", { ocultable: true, clase: "tabular-nums", render: (c) => ed(c, "qtyTotal", c.qtyTotal ?? "—") }),
    col("pagadoAProveedor", "Pagado a Proveedor", { ocultable: true, clase: "tabular-nums", render: (c) => ed(c, "pagadoAProveedor", usd(c.pagadoAProveedor)) }),
    col("dias", "Días", { ocultable: true, clase: "tabular-nums", render: (c) => diasDeCompra(c) }),
    col("foto", "Foto", {
      ...resto,
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
    col("codigo", "Código", { ...resto, clase: "text-muted-foreground tabular-nums whitespace-nowrap", render: (c) => c.codigo ?? "—" }),
    col("pais", "País", { ...resto, clase: "text-muted-foreground", render: (c) => c.paisCodigo ?? (c.paisesDestino.length ? `→ ${c.paisesDestino.join(", ")}` : "—") }),
    col("estado", "Estado", { ...resto, render: (c) => ed(c, "estado", <Badge color={colorEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge>) }),
    col("proveedor", "Proveedor", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "proveedor", c.proveedor || "—") }),
    col("tienda", "Tienda", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "tienda", c.tienda || "—") }),
    col("cliente", "Cliente", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "cliente", c.cliente || "—") }),
    col("etiquetas", "Etiquetas", {
      ...resto,
      render: (c) => (
        <span className="flex min-h-6 items-center gap-1">
          {c.etiquetas.length === 0 && <span className="text-muted-foreground">—</span>}
          <EtiquetasCompra
            compra={c}
            todas={edicion.etiquetas}
            colores={edicion.colores}
            puedeEscribir={edicion.puedeEscribir}
            guardar={edicion.guardar}
            cambiarColor={edicion.cambiarColor}
          />
        </span>
      ),
    }),
    col("asignado", "Responsable", { ...resto, clase: "text-muted-foreground", render: (c) => c.asignadoNombre || "—" }),
    col("planificacion", "Planificación", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "planificacion", c.planificacion || "—") }),
    col("montoTotal", "Monto Total", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "montoTotal", usd(c.montoTotal)) }),
    col("valorUnitario", "Valor Unitario", { ...resto, clase: "tabular-nums", render: (c) => usd(valorUnitario(c)) }),
    col("primerPago", "Primer Pago", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "primerPago", usd(c.primerPago)) }),
    col("segundoPago", "Segundo Pago", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "segundoPago", usd(c.segundoPago)) }),
    col("pagoPendiente", "Pago Pendiente", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "pagoPendiente", usd(c.pagoPendiente)) }),
    col("cobradoCliente", "Cobrado Cliente", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "cobradoCliente", usd(c.cobradoCliente)) }),
    col("pendienteCliente", "Pendiente Cliente", { ...resto, clase: "tabular-nums", render: (c) => ed(c, "pendienteCliente", usd(c.pendienteCliente)) }),
    col("pagoCliente", "Pago Cliente", { ...resto, render: (c) => ed(c, "pagoCliente", c.pagoCliente || "—") }),
    col("cuentaReceptora", "Cuenta receptora", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "cuentaReceptora", c.cuentaReceptora || "—") }),
    col("factura", "Factura", { ...resto, render: (c) => ed(c, "factura", siNo(c.factura)) }),
    col("financiamiento", "Financiamiento", { ...resto, render: (c) => ed(c, "financiamiento", siNo(c.financiamiento)) }),
    col("fechaPago1", "Fecha de Pago (1)", { ...resto, clase: "whitespace-nowrap", render: (c) => ed(c, "fechaPago1", fecha(c.fechaPago1)) }),
    col("fechaPago2", "Fecha de Pago (2)", { ...resto, clase: "whitespace-nowrap", render: (c) => ed(c, "fechaPago2", fecha(c.fechaPago2)) }),
    col("fechaEnvio", "Fecha de Envío", { ...resto, clase: "whitespace-nowrap", render: (c) => ed(c, "fechaEnvio", fecha(c.fechaEnvio)) }),
    col("fechaLimite", "Fecha límite", { ...resto, clase: "whitespace-nowrap", render: (c) => ed(c, "fechaLimite", fecha(c.fechaLimite)) }),
    col("trackId", "Track ID", { ...resto, clase: "text-muted-foreground", render: (c) => ed(c, "trackId", c.trackId || "—") }),
    col("orden", "Orden", { ...resto, clase: "text-muted-foreground tabular-nums", render: (c) => ed(c, "orden", c.orden || "—") }),
    col("cerrado", "Cerrada", { ...resto, clase: "whitespace-nowrap", render: (c) => fecha(c.cerradoEn) }),
  ];
}

/**
 * El tablero de Compras, una sola vista: la tabla con la barra de herramientas común (agrupar —arranca por Etapa—, filtros,
 * columnas, cerrados, descarga y «Agregar»), los filtros de un toque (cotizando, producción, en tránsito, atrasadas) y la
 * ficha de resumen fija a la derecha, que se puede minimizar. Pulsar la descripción de una compra la muestra en la ficha
 * (el resto de la fila no abre nada: sus celdas se editan en su sitio, ver `CeldaEditable`); «Abrir ficha completa» abre la
 * actividad (comentarios, adjuntos, historial). Con la ficha minimizada, la descripción abre la ficha completa.
 */
export function TablaCompras({
  compras: comprasServidor,
  vista,
  paises,
  puedeEscribir,
  puedeAgregarPais,
  grupoInicial,
  etapaInicial,
  abrirInicial = null,
  comentarioInicial = null,
  coloresEtiquetas = {},
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
  /** La compra que se abre al llegar (desde un aviso «Para ti») y el comentario que se señala. */
  abrirInicial?: string | null;
  comentarioInicial?: string | null;
  /** El color elegido de cada etiqueta (por su nombre). */
  coloresEtiquetas?: Record<string, string>;
}) {
  const { mostrarToast } = useToast();
  const [rapido, setRapido] = useState<Grupo | null>(grupoInicial && RAPIDOS.some((r) => r.valor === grupoInicial) ? grupoInicial : null);
  const [soloSinProductos, setSoloSinProductos] = useState(false);
  const [etapa, setEtapa] = useState(etapaInicial);
  const [elegida, setElegida] = useState<{ id: string; orden: string[] } | null>(null);
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(abrirInicial && comprasServidor.some((c) => c.id === abrirInicial) ? { id: abrirInicial, orden: [abrirInicial] } : null);
  const guardadoFicha = almacen(CLAVE_FICHA, "local");
  const fichaMinimizada = useSyncExternalStore(guardadoFicha.suscribir, guardadoFicha.leer, () => "") === "minimizada";

  // Lo editado en una celda se ve al instante, sin esperar a rearmar la página: son cambios sobre las filas que llegaron del
  // servidor. Cuando llegan filas nuevas (otra edición, la ficha, recargar) se descarta lo que ya coincide con el servidor.
  const [cambios, setCambios] = useState<Record<string, Partial<FilaCompra>>>({});
  const [comprasPrevias, setComprasPrevias] = useState(comprasServidor);
  if (comprasServidor !== comprasPrevias) {
    setComprasPrevias(comprasServidor);
    setCambios((actuales) => podarCambios(actuales, comprasServidor));
  }
  const compras = useMemo(
    () => (Object.keys(cambios).length ? comprasServidor.map((c) => (cambios[c.id] ? { ...c, ...cambios[c.id] } : c)) : comprasServidor),
    [comprasServidor, cambios],
  );

  /** Guarda un dato de una compra: se ve de inmediato y, si el servidor lo rechaza, vuelve a como estaba y se avisa. */
  const guardarCelda = useCallback<GuardarCelda>(
    async (compra, campo, bruto) => {
      const def = campoEditable(campo);
      if (!def) return;
      const normalizado = normalizarValor(def, bruto);
      if ("error" in normalizado) {
        mostrarToast(normalizado.error, "destructive");
        return;
      }
      const anterior = compra[def.prop];
      const poner = (p: Partial<FilaCompra>) => setCambios((o) => ({ ...o, [compra.id]: { ...o[compra.id], ...p } }));
      poner({ [def.prop]: normalizado.valor } as Partial<FilaCompra>);
      const resultado = await actualizarCampoCompra(compra.id, campo, normalizado.valor).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }) as { error?: string; cerradoEn?: string | null });
      if (resultado.error) {
        poner({ [def.prop]: anterior } as Partial<FilaCompra>);
        mostrarToast(resultado.error, "destructive");
        return;
      }
      if ("cerradoEn" in resultado) poner({ cerradoEn: resultado.cerradoEn ?? null });
      mostrarToast(`${def.etiqueta} guardado`);
    },
    [mostrarToast],
  );
  // Todas las etiquetas que existen en las compras, para el selector de etiquetas (como en ClickUp).
  const todasEtiquetas = useMemo(() => [...new Set(comprasServidor.flatMap((c) => c.etiquetas))].sort((a, b) => a.localeCompare(b, "es")), [comprasServidor]);
  // El color de cada etiqueta: se ve al instante al elegirlo; si el servidor lo rechaza, vuelve al de antes.
  const [colores, setColores] = useState(coloresEtiquetas);
  const cambiarColor = useCallback(
    (nombre: string, color: string) => {
      const antes = colores[nombre];
      setColores((c) => ({ ...c, [nombre]: color }));
      void guardarColorEtiqueta(nombre, color).then((r) => {
        if (!r.error) return;
        mostrarToast(r.error, "destructive");
        setColores((c) => {
          const siguiente = { ...c };
          if (antes) siguiente[nombre] = antes;
          else delete siguiente[nombre];
          return siguiente;
        });
      });
    },
    [colores, mostrarToast],
  );
  const edicion = useMemo(
    () => ({ puedeEscribir, guardar: guardarCelda, etiquetas: todasEtiquetas, colores, cambiarColor }),
    [puedeEscribir, guardarCelda, todasEtiquetas, colores, cambiarColor],
  );

  const umbral = useMemo(() => umbralesTransito(compras), [compras]);
  const dia = hoy();
  const cols = useMemo(() => columnas(umbral, dia, edicion), [umbral, dia, edicion]);
  const conteo = useMemo(() => Object.fromEntries(RAPIDOS.map((r) => [r.valor, compras.filter((c) => enGrupo(c, r.valor, umbral)).length])), [compras, umbral]);
  const filas = useMemo(
    () => compras.filter((c) => (!rapido || enGrupo(c, rapido, umbral)) && (!etapa || c.etapa === etapa) && (!soloSinProductos || (c.tipo === "pais" && c.productos === 0))),
    [compras, rapido, etapa, umbral, soloSinProductos],
  );
  // El avance de vincular productos a las compras de país (las de ClickUp llegaron sin productos).
  const dePais = compras.filter((c) => c.tipo === "pais");
  const sinProductos = dePais.filter((c) => c.productos === 0);
  const resumen = elegida ? (compras.find((c) => c.id === elegida.id) ?? null) : null;
  const completa = abierta ? compras.find((c) => c.id === abierta.id) : undefined;

  return (
    // El resumen de la derecha aparece al elegir una compra; sin elegir, la tabla usa todo el ancho.
    <div className={!resumen ? "flex flex-col" : fichaMinimizada ? claseFichaMinimizada : claseConFicha}>
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
          {dePais.length > 0 && (
            <BotonBarra activo={soloSinProductos} onClick={() => setSoloSinProductos((v) => !v)}>
              {sinProductos.length > 0 && <Punto tono="aviso" />}
              Sin productos <span className="text-muted-foreground tabular-nums">{sinProductos.length}</span>
            </BotonBarra>
          )}
        </div>
        {dePais.length > 0 && (
          <p className="m-0 text-xs text-muted-foreground" role="status">
            {sinProductos.length === 0
              ? `Todas las compras tienen sus productos vinculados (${dePais.length}).`
              : `Productos vinculados: ${dePais.length - sinProductos.length} de ${dePais.length} compras. Faltan ${sinProductos.length}${
                  soloSinProductos ? " (las cerradas se ven con el botón «Cerrados» de la tabla)" : ""
                }.`}
          </p>
        )}
        <TablaDatos
          def={DEF_COMPRAS}
          filas={filas}
          columnas={cols}
          iconos={ICONOS}
          nombre={NOMBRE}
          claveFila={(c) => c.id}
          formatearTotal={(total) => formatearMoneda(total, MONEDA_COMPRAS)}
          anchoMinimo="72rem"
          porPagina={100}
          paginarSiempre
          // La ficha se abre solo desde la descripción de la compra: el resto de las celdas se editan en su sitio.
          abrirFila={{
            etiqueta: (c) => `Ver la compra ${c.nombre}`,
            alAbrir: (c, orden) => (fichaMinimizada ? setAbierta({ id: c.id, orden }) : setElegida({ id: c.id, orden })),
            columna: "nombre",
            soloColumna: true,
            // El botón de etiquetas va junto al nombre, fuera del botón que abre la compra.
            junto: (c) => (
              <span className="flex h-5 items-center">
                <EtiquetasCompra
                  compra={c}
                  todas={edicion.etiquetas}
                  colores={edicion.colores}
                  puedeEscribir={edicion.puedeEscribir}
                  guardar={edicion.guardar}
                  cambiarColor={edicion.cambiarColor}
                  sinPastillas
                />
              </span>
            ),
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

      {!resumen ? null : fichaMinimizada ? (
        <FichaMinimizada alAbrir={() => guardadoFicha.guardar("")} />
      ) : (
        <FichaLateralCompra
          alCerrar={() => setElegida(null)}
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
        comentarioResaltado={abierta?.id === abrirInicial ? comentarioInicial : null}
      />
    </div>
  );
}
