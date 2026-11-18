"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Indicador, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CalendarioIcon, CerrarIcon, CheckIcon, ChatIcon } from "@/lib/nav-icons";
import { ETAPAS_CONFIRMACION, META_CONFIRMACION, etapaConfirmacion, tiempoEsperando, type EtapaConfirmacion, type ResumenConfirmacion } from "@/lib/tienda/confirmacion";
import type { PedidoFila } from "@/lib/tienda/datos";
import { diasHasta } from "@/lib/tienda/programado";
import { columnaProgramado } from "../columnas-extra";
import { FichaPedido } from "../ficha-pedido";
import { COLUMNAS, ICONOS, NOMBRE, defPedidos, type Contexto } from "../pedidos-tienda";
import { pedidosDeEtapa, type ConsultaConfirmacion } from "./actions";

const ETAPA = new Map(ETAPAS_CONFIRMACION.map((e) => [e.id, e]));
const TONO: Record<EtapaConfirmacion, "aviso" | "neutro" | "exito" | "peligro"> = { por_confirmar: "aviso", esperando: "neutro", confirmado: "exito", cancelado: "peligro" };

type Vista = "sin_confirmar" | "por_confirmar" | "esperando" | "programado" | "confirmado" | "cancelado";

/** Una lista del periodo que se pide al pulsar su tarjeta: mientras llega, cargando; si falla, el motivo. */
type ListaPeriodo = PedidoFila[] | "cargando" | { error: string };


/** Las columnas de Pedidos, con «Espera» (cuánto lleva sin confirmar) y «Confirmación» en lugar de «Estado». */
function columnasConfirmacion(ahora: number, hoy: string, multiTienda: boolean): ColumnaTabla<PedidoFila, Contexto>[] {
  const programado = columnaProgramado(hoy);
  const espera: ColumnaTabla<PedidoFila, Contexto> = {
    id: "espera",
    label: "Espera",
    descripcion: "Cuánto lleva el pedido sin confirmar, desde que entró en Shopify.",
    ocultable: true,
    clase: "whitespace-nowrap tabular-nums",
    render: (p) => (p.estado === "nuevo" ? tiempoEsperando(p.creado, ahora) : <span className="text-muted-foreground">—</span>),
  };
  const confirmacion: ColumnaTabla<PedidoFila, Contexto> = {
    id: "confirmacion",
    label: "Confirmación",
    ocultable: true,
    render: (p) => {
      const e = etapaConfirmacion(p);
      return <Pastilla tono={TONO[e]}>{ETAPA.get(e)!.etiqueta}</Pastilla>;
    },
  };
  const base = COLUMNAS.filter((c) => (multiTienda || c.id !== "tienda") && c.id !== "estado");
  const i = base.findIndex((c) => c.id === "fecha") + 1;
  const j = base.findIndex((c) => c.id === "total") + 1;
  return [...base.slice(0, i), espera, programado, ...base.slice(i, j), confirmacion, ...base.slice(j)];
}

/**
 * Confirmación (12 nov 2026, como Mi Reto Digital): las tarjetas filtran la lista (de entrada, todo lo sin confirmar, lo más viejo arriba), la meta de
 * confirmación del periodo y la lista con la misma barra y ficha de Pedidos. Solo lectura.
 */
export function ConfirmacionTienda({
  sinConfirmar,
  programados,
  resumen: r,
  totalPeriodo,
  porTienda,
  consulta,
  periodo,
  codigoPais,
  tiendas,
  ahora,
  hoy,
}: {
  /** Los pedidos sin confirmar (de todo el tiempo que se mira), lo más viejo primero. */
  sinConfirmar: PedidoFila[];
  /** Los que todavía no salen y tienen fecha en la nota, por fecha. */
  programados: PedidoFila[];
  /** Confirmados, cancelados y la tasa del periodo elegido (calculados en el servidor: la página ya no manda todos los pedidos del periodo). */
  resumen: ResumenConfirmacion;
  /** Cuántos pedidos tiene el periodo. */
  totalPeriodo: number;
  /** La tasa de cada tienda, si se miran varias. */
  porTienda: ({ id: string; nombre: string; pedidos: number } & ResumenConfirmacion)[];
  /** La tienda y el periodo de la dirección, para pedir las listas de confirmados y cancelados al pulsar su tarjeta. */
  consulta: ConsultaConfirmacion;
  periodo: string;
  codigoPais: string;
  tiendas: Record<string, string>;
  ahora: number;
  /** Hoy en Panamá (AAAA-MM-DD). */
  hoy: string;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("sin_confirmar");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const multiTienda = Object.keys(tiendas).length > 1;
  const [listas, setListas] = useState<Partial<Record<"confirmado" | "cancelado", ListaPeriodo>>>({});
  // Los confirmados y cancelados del periodo se piden la primera vez que se abre su lista (18 nov 2026, velocidad).
  useEffect(() => {
    if ((vista !== "confirmado" && vista !== "cancelado") || listas[vista]) return;
    const etapa = vista;
    setListas((x) => ({ ...x, [etapa]: "cargando" }));
    pedidosDeEtapa(consulta, etapa).then(
      (res) => setListas((x) => ({ ...x, [etapa]: "error" in res ? { error: res.error } : res.pedidos })),
      () => setListas((x) => ({ ...x, [etapa]: { error: "No se pudo cargar la lista. Vuelve a pulsar la tarjeta." } })),
    );
  }, [vista, listas, consulta]);
  const listaPeriodo = vista === "confirmado" || vista === "cancelado" ? listas[vista] : undefined;
  const porConfirmar = useMemo(() => sinConfirmar.filter((p) => etapaConfirmacion(p) === "por_confirmar"), [sinConfirmar]);
  const esperando = useMemo(() => sinConfirmar.filter((p) => etapaConfirmacion(p) === "esperando"), [sinConfirmar]);
  const filas = useMemo(() => {
    if (vista === "sin_confirmar") return sinConfirmar;
    if (vista === "por_confirmar") return porConfirmar;
    if (vista === "esperando") return esperando;
    if (vista === "programado") return programados;
    return Array.isArray(listaPeriodo) ? listaPeriodo : [];
  }, [vista, sinConfirmar, porConfirmar, esperando, programados, listaPeriodo]);
  const columnas = useMemo(() => columnasConfirmacion(ahora, hoy, multiTienda), [ahora, hoy, multiTienda]);
  const sePasaron = programados.filter((p) => diasHasta(p.programado!.fecha, hoy) < 0).length;
  const paraHoy = programados.filter((p) => diasHasta(p.programado!.fecha, hoy) === 0).length;
  const def = useMemo(() => ({ ...defPedidos(tiendas), clave: "tienda-confirmacion" }), [tiendas]);
  const contexto = useMemo(() => ({ codigoPais, tiendas }), [codigoPais, tiendas]);
  const num = (n: number) => n.toLocaleString("es-PA");
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);
  const alternar = (v: Vista) => {
    // Si la lista del periodo falló, pulsar de nuevo la vuelve a pedir.
    if ((v === "confirmado" || v === "cancelado") && listas[v] && typeof listas[v] === "object" && !Array.isArray(listas[v])) {
      setListas((x) => ({ ...x, [v]: undefined }));
      setVista(v);
      return;
    }
    setVista((x) => (x === v ? "sin_confirmar" : v));
  };
  const masViejo = sinConfirmar[0] ? tiempoEsperando(sinConfirmar[0].creado, ahora) : null;

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

  const barra = r.tasa === null ? 0 : Math.min(100, r.tasa);
  const vacio =
    listaPeriodo === "cargando"
      ? "Cargando los pedidos…"
      : listaPeriodo && !Array.isArray(listaPeriodo)
        ? listaPeriodo.error
        : vista === "programado"
      ? "No hay pedidos programados: salen cuando la nota del pedido dice para qué día los quiere el cliente."
      : vista === "sin_confirmar" || vista === "por_confirmar" || vista === "esperando"
        ? "No hay pedidos sin confirmar. ¡Al día!"
          : `No hay pedidos así en ${periodo}.`;

  return (
    <div className="flex flex-col gap-5">
      <TableroIndicadores etiqueta="Tablero de confirmación">
        <Indicador
          titulo="Por confirmar"
          icono={AlertaIcon}
          color="ambar"
          punto={porConfirmar.length ? "aviso" : undefined}
          valor={num(porConfirmar.length)}
          detalle={masViejo ? `todos · el más viejo lleva ${masViejo}` : "todos · lo más viejo arriba"}
          alPulsar={() => alternar("por_confirmar")}
          activo={vista === "por_confirmar"}
        />
        <Indicador
          titulo="Esperando respuesta"
          icono={ChatIcon}
          color="violeta"
          valor={num(esperando.length)}
          detalle="con etiqueta de gestión (Pendiente, Modificar…)"
          alPulsar={() => alternar("esperando")}
          activo={vista === "esperando"}
        />
        <Indicador
          titulo="Programados"
          icono={CalendarioIcon}
          color="azul"
          punto={sePasaron ? "peligro" : paraHoy ? "aviso" : undefined}
          valor={num(programados.length)}
          detalle={programados.length ? `${num(sePasaron)} se pasaron · ${num(paraHoy)} para hoy` : "con fecha en la nota del pedido"}
          alPulsar={() => alternar("programado")}
          activo={vista === "programado"}
        />
        <Indicador titulo="Confirmados" icono={CheckIcon} color="verde" valor={num(r.porEtapa.confirmado)} detalle={`${pct(r.tasa)} · ${periodo}`} alPulsar={() => alternar("confirmado")} activo={vista === "confirmado"} />
        <Indicador titulo="Cancelados" icono={CerrarIcon} color="rojo" valor={num(r.porEtapa.cancelado)} detalle={`${pct(r.cancelacion)} · ${periodo}`} alPulsar={() => alternar("cancelado")} activo={vista === "cancelado"} />
      </TableroIndicadores>

      {/* La meta de confirmación (85 %, la de Mi Reto Digital): compacta y en un solo tono. */}
      <section aria-label="Meta de confirmación" className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <b className="text-base tabular-nums text-primario">{pct(r.tasa)}</b> confirmado de {num(totalPeriodo)} pedidos · meta {META_CONFIRMACION} %
          </span>
          <span className="text-xs text-muted-foreground">
            Pendiente {pct(r.pendiente)} · Cancelado {pct(r.cancelacion)} · {periodo}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-primario-suave" role="img" aria-label={`Confirmado ${pct(r.tasa)} de una meta de ${META_CONFIRMACION} %`}>
          <div className="h-full rounded-full bg-primario" style={{ width: `${barra}%` }} />
          <div aria-hidden="true" className="absolute top-0 h-full w-0.5 bg-foreground/60" style={{ left: `${META_CONFIRMACION}%` }} />
        </div>
        {porTienda.length > 1 && (
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-xs text-muted-foreground">
            {porTienda.map((t) => (
              <li key={t.id}>
                <b className="text-foreground">{t.nombre}</b> · {num(t.pedidos)} pedidos · confirmado {pct(t.tasa)} · cancelado {pct(t.cancelacion)}
              </li>
            ))}
          </ul>
        )}
      </section>

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
            if (!p.productosLista) return router.push(`/tienda-pedidos/${p.id}`);
            setOrden(ids);
            abrir(p.id);
          },
        }}
        ariaLabel="Pedidos por confirmar"
        anchoMinimo="64rem"
        aspecto="lista"
        asaColumnas
        encabezadoMayusculas
        vacio={vacio}
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
