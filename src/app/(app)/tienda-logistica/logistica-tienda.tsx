"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Indicador, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CalendarioIcon, EnvioIcon, InventarioIcon } from "@/lib/nav-icons";
import type { PedidoFila } from "@/lib/tienda/datos";
import { DIAS_DEMORA, diasDesde, etapaLogistica, listoParaPreparar } from "@/lib/tienda/logistica";
import { diaPanama } from "@/lib/tienda/resumen";
import { columnaProgramado } from "../tienda-pedidos/columnas-extra";
import { FichaPedido } from "../tienda-pedidos/ficha-pedido";
import { COLUMNAS, ICONOS, NOMBRE, defPedidos, type Contexto } from "../tienda-pedidos/pedidos-tienda";

type Vista = "preparar_hoy" | "preparar_despues" | "en_ruta" | "demorados" | "sin_zona";

/** Las columnas de Pedidos, con «Días» (desde el pedido), «Programado» y «Logística» en lugar de «Estado»; la transportista, visible. */
function columnasLogistica(hoy: string, multiTienda: boolean): ColumnaTabla<PedidoFila, Contexto>[] {
  const dias: ColumnaTabla<PedidoFila, Contexto> = {
    id: "dias",
    label: "Días",
    descripcion: "Días desde el pedido (Shopify no trae la fecha de despacho). En rojo, en ruta hace 5 días o más.",
    ocultable: true,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (p) => {
      const d = diasDesde(diaPanama(p.creado), hoy);
      return <span className={p.estado === "en_camino" && d >= DIAS_DEMORA ? "font-semibold text-destructive" : undefined}>{d}</span>;
    },
  };
  const etapa: ColumnaTabla<PedidoFila, Contexto> = {
    id: "logistica",
    label: "Logística",
    ocultable: true,
    render: (p) =>
      etapaLogistica(p.estado) === "en_ruta" ? (
        <Pastilla>En ruta</Pastilla>
      ) : listoParaPreparar(p.programado, p.provincia, hoy) ? (
        <Pastilla tono="aviso">Por preparar</Pastilla>
      ) : (
        <Pastilla tono="neutro">Programado</Pastilla>
      ),
  };
  const base = COLUMNAS.filter((c) => (multiTienda || c.id !== "tienda") && c.id !== "estado").map((c) => (c.id === "transportista" ? { ...c, oculta: false } : c));
  const i = base.findIndex((c) => c.id === "fecha") + 1;
  const j = base.findIndex((c) => c.id === "total") + 1;
  return [...base.slice(0, i), dias, columnaProgramado(hoy), ...base.slice(i, j), etapa, ...base.slice(j)];
}

/**
 * Logística (12 nov 2026, como Mi Reto Digital, con lo que hay): tarjetas que filtran la lista —por preparar hoy (en las mañanas), programados para
 * después, en ruta por zona, demorados y sin zona— y la lista con la barra y la ficha de Pedidos. Solo lectura.
 */
export function LogisticaTienda({ pedidos, codigoPais, tiendas, hoy }: { pedidos: PedidoFila[]; codigoPais: string; tiendas: Record<string, string>; hoy: string }) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("preparar_hoy");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const multiTienda = Object.keys(tiendas).length > 1;

  const grupos = useMemo(() => {
    const porPreparar = pedidos.filter((p) => etapaLogistica(p.estado) === "por_preparar");
    const enRuta = pedidos.filter((p) => etapaLogistica(p.estado) === "en_ruta");
    return {
      preparar_hoy: porPreparar.filter((p) => listoParaPreparar(p.programado, p.provincia, hoy)),
      preparar_despues: porPreparar.filter((p) => !listoParaPreparar(p.programado, p.provincia, hoy)).sort((a, b) => a.programado!.fecha.localeCompare(b.programado!.fecha)),
      en_ruta: enRuta,
      demorados: enRuta.filter((p) => diasDesde(diaPanama(p.creado), hoy) >= DIAS_DEMORA),
      sin_zona: pedidos.filter((p) => !p.provincia),
    } satisfies Record<Vista, PedidoFila[]>;
  }, [pedidos, hoy]);
  const zonas = (ps: PedidoFila[]) => {
    const n = (z: string | null) => ps.filter((p) => p.provincia === z).length;
    return `${num(n("Ciudad"))} ciudad · ${num(n("Interior"))} interior · ${num(n(null))} sin zona`;
  };
  const filas = grupos[vista];
  const columnas = useMemo(() => columnasLogistica(hoy, multiTienda), [hoy, multiTienda]);
  const def = useMemo(() => ({ ...defPedidos(tiendas), clave: "tienda-logistica" }), [tiendas]);
  const contexto = useMemo(() => ({ codigoPais, tiendas }), [codigoPais, tiendas]);
  const alternar = (v: Vista) => setVista((x) => (x === v ? "preparar_hoy" : v));

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

  const VACIO: Record<Vista, string> = {
    preparar_hoy: "No hay pedidos confirmados por preparar.",
    preparar_despues: "No hay pedidos programados para más adelante.",
    en_ruta: "No hay pedidos en ruta.",
    demorados: `Ningún pedido lleva ${DIAS_DEMORA} días o más en ruta.`,
    sin_zona: "Todos los pedidos tienen zona.",
  };

  return (
    <div className="flex flex-col gap-5">
      <TableroIndicadores etiqueta="Tablero de logística">
        <Indicador
          titulo="Por preparar"
          icono={InventarioIcon}
          color="ambar"
          punto={grupos.preparar_hoy.length ? "aviso" : undefined}
          valor={num(grupos.preparar_hoy.length)}
          detalle={grupos.preparar_hoy.length ? zonas(grupos.preparar_hoy) : "confirmados, para preparar en la mañana"}
          alPulsar={() => alternar("preparar_hoy")}
          activo={vista === "preparar_hoy"}
        />
        <Indicador
          titulo="Programados después"
          icono={CalendarioIcon}
          color="azul"
          valor={num(grupos.preparar_despues.length)}
          detalle="confirmados con fecha en la nota"
          alPulsar={() => alternar("preparar_despues")}
          activo={vista === "preparar_despues"}
        />
        <Indicador titulo="En ruta" icono={EnvioIcon} color="violeta" valor={num(grupos.en_ruta.length)} detalle={zonas(grupos.en_ruta)} alPulsar={() => alternar("en_ruta")} activo={vista === "en_ruta"} />
        <Indicador
          titulo={`En ruta ${DIAS_DEMORA}+ días`}
          icono={AlertaIcon}
          color="rojo"
          punto={grupos.demorados.length ? "peligro" : undefined}
          valor={num(grupos.demorados.length)}
          detalle="desde el pedido · Shopify no dice si se entregó"
          alPulsar={() => alternar("demorados")}
          activo={vista === "demorados"}
        />
        <Indicador
          titulo="Sin zona"
          icono={AlertaIcon}
          color="ambar"
          valor={num(grupos.sin_zona.length)}
          detalle="sin etiqueta CIUDAD ni INTERIOR"
          alPulsar={() => alternar("sin_zona")}
          activo={vista === "sin_zona"}
        />
      </TableroIndicadores>

      <p role="note" className="m-0 rounded-lg border border-primario/30 bg-primario-suave px-4 py-2 text-xs">
        Shopify no trae la guía, la fecha de despacho ni si el pedido se entregó o se devolvió: lo despachado queda en ruta y los días se cuentan desde el
        pedido. La zona y la transportista salen de la etiqueta (CIUDAD, INTERIOR/SERVIENTREGA) y la fecha programada, de la nota del pedido.
      </p>

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
        ariaLabel="Pedidos de logística"
        anchoMinimo="64rem"
        aspecto="lista"
        asaColumnas
        encabezadoMayusculas
        vacio={VACIO[vista]}
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

const num = (n: number) => n.toLocaleString("es-PA");
