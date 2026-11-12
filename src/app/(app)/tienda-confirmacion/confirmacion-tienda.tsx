"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Indicador, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CalendarioIcon, CerrarIcon, CheckIcon, ChatIcon } from "@/lib/nav-icons";
import { ETAPAS_CONFIRMACION, META_CONFIRMACION, etapaConfirmacion, resumirConfirmacion, tiempoEsperando, type EtapaConfirmacion } from "@/lib/tienda/confirmacion";
import type { PedidoFila } from "@/lib/tienda/datos";
import { FichaPedido } from "../tienda-pedidos/ficha-pedido";
import { COLUMNAS, ICONOS, NOMBRE, defPedidos, type Contexto } from "../tienda-pedidos/pedidos-tienda";

const ETAPA = new Map(ETAPAS_CONFIRMACION.map((e) => [e.id, e]));
const TONO: Record<EtapaConfirmacion, "aviso" | "neutro" | "exito" | "peligro"> = { por_confirmar: "aviso", esperando: "neutro", confirmado: "exito", cancelado: "peligro" };

type Vista = "sin_confirmar" | "por_confirmar" | "esperando" | "confirmado" | "cancelado";

/** Las columnas de Pedidos, con «Espera» (cuánto lleva sin confirmar) y «Confirmación» en lugar de «Estado». */
function columnasConfirmacion(ahora: number, multiTienda: boolean): ColumnaTabla<PedidoFila, Contexto>[] {
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
  return [...base.slice(0, i), espera, ...base.slice(i, j), confirmacion, ...base.slice(j)];
}

/**
 * Confirmación (12 nov 2026, como Mi Reto Digital): las tarjetas filtran la lista (de entrada, todo lo sin confirmar, lo más viejo arriba), la meta de
 * confirmación del periodo y la lista con la misma barra y ficha de Pedidos. Solo lectura.
 */
export function ConfirmacionTienda({
  sinConfirmar,
  delPeriodo,
  periodo,
  codigoPais,
  tiendas,
  ahora,
}: {
  /** Los pedidos sin confirmar (de todo el tiempo que se mira), lo más viejo primero. */
  sinConfirmar: PedidoFila[];
  /** Todos los pedidos del periodo elegido (para confirmados, cancelados y la tasa). */
  delPeriodo: PedidoFila[];
  periodo: string;
  codigoPais: string;
  tiendas: Record<string, string>;
  ahora: number;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("sin_confirmar");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const multiTienda = Object.keys(tiendas).length > 1;
  const r = useMemo(() => resumirConfirmacion(delPeriodo), [delPeriodo]);
  const porConfirmar = useMemo(() => sinConfirmar.filter((p) => etapaConfirmacion(p) === "por_confirmar"), [sinConfirmar]);
  const esperando = useMemo(() => sinConfirmar.filter((p) => etapaConfirmacion(p) === "esperando"), [sinConfirmar]);
  const filas = useMemo(() => {
    if (vista === "sin_confirmar") return sinConfirmar;
    if (vista === "por_confirmar") return porConfirmar;
    if (vista === "esperando") return esperando;
    return delPeriodo.filter((p) => etapaConfirmacion(p) === vista);
  }, [vista, sinConfirmar, porConfirmar, esperando, delPeriodo]);
  const columnas = useMemo(() => columnasConfirmacion(ahora, multiTienda), [ahora, multiTienda]);
  const def = useMemo(() => ({ ...defPedidos(tiendas), clave: "tienda-confirmacion" }), [tiendas]);
  const contexto = useMemo(() => ({ codigoPais, tiendas }), [codigoPais, tiendas]);
  const num = (n: number) => n.toLocaleString("es-PA");
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PA")} %`);
  const alternar = (v: Vista) => setVista((x) => (x === v ? "sin_confirmar" : v));
  const masViejo = sinConfirmar[0] ? tiempoEsperando(sinConfirmar[0].creado, ahora) : null;

  // La tasa por tienda (como Mi Reto Digital la da por país), solo si se miran varias.
  const porTienda = useMemo(() => {
    if (!multiTienda) return [];
    const grupos = new Map<string, PedidoFila[]>();
    for (const p of delPeriodo) grupos.set(p.tiendaId, [...(grupos.get(p.tiendaId) ?? []), p]);
    return [...grupos].map(([id, ps]) => ({ id, nombre: tiendas[id] ?? "—", pedidos: ps.length, ...resumirConfirmacion(ps) })).sort((a, b) => b.pedidos - a.pedidos);
  }, [multiTienda, delPeriodo, tiendas]);

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
    vista === "sin_confirmar" || vista === "por_confirmar" || vista === "esperando" ? "No hay pedidos sin confirmar. ¡Al día!" : `No hay pedidos así en ${periodo}.`;

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
        <Indicador titulo="Programados" icono={CalendarioIcon} color="azul" valor="—" detalle="llegan al conectar WhatsApp" />
        <Indicador titulo="Confirmados" icono={CheckIcon} color="verde" valor={num(r.porEtapa.confirmado)} detalle={`${pct(r.tasa)} · ${periodo}`} alPulsar={() => alternar("confirmado")} activo={vista === "confirmado"} />
        <Indicador titulo="Cancelados" icono={CerrarIcon} color="rojo" valor={num(r.porEtapa.cancelado)} detalle={`${pct(r.cancelacion)} · ${periodo}`} alPulsar={() => alternar("cancelado")} activo={vista === "cancelado"} />
      </TableroIndicadores>

      {/* La meta de confirmación (85 %, la de Mi Reto Digital): compacta y en un solo tono. */}
      <section aria-label="Meta de confirmación" className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <b className="text-base tabular-nums text-primario">{pct(r.tasa)}</b> confirmado de {num(delPeriodo.length)} pedidos · meta {META_CONFIRMACION} %
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
