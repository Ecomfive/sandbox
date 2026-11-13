"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Indicador, Pastilla, TableroIndicadores } from "@/components/panel/piezas-panel";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearMoneda } from "@/lib/formato";
import { AlertaIcon, CalendarioIcon, CerrarIcon, CheckIcon, EnvioIcon, InventarioIcon } from "@/lib/nav-icons";
import type { PedidoFila } from "@/lib/tienda/datos";
import { DIAS_DEMORA, anuladoPorEtiqueta, diasDesde, etapaConEntrega, etapaLogistica, listoParaPreparar } from "@/lib/tienda/logistica";
import { diaPanama } from "@/lib/tienda/resumen";
import { columnaProgramado } from "../tienda-pedidos/columnas-extra";
import { FichaPedido } from "../tienda-pedidos/ficha-pedido";
import { COLUMNAS, ICONOS, NOMBRE, defPedidos, type Contexto } from "../tienda-pedidos/pedidos-tienda";

type Vista = "preparar_hoy" | "preparar_despues" | "en_ruta" | "novedad" | "demorados" | "entregados" | "devueltos" | "anulados" | "sin_zona" | "verificar";

/** Una fila de Monday sin pedido en el sistema («A verificar»). */
export interface SinPedidoMonday {
  numero: string;
  tablero: string;
  estado: string;
  nota: string | null;
  repartidor: string | null;
  fecha: string | null;
}

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
    render: (p) => {
      if (p.aVerificar)
        return (
          <span className="inline-flex max-w-[22rem] items-center gap-1.5" title={p.aVerificar}>
            <Pastilla tono="peligro">A verificar</Pastilla>
            <span className="truncate text-xs text-muted-foreground">{p.aVerificar}</span>
          </span>
        );
      const e = etapaConEntrega(p.estado, p.entrega);
      const monday = p.entrega
        ? `${p.entrega.fuente === "siscore" ? `Servientrega${p.entrega.guia ? ` · guía ${p.entrega.guia}` : ""}` : "Monday"}: ${p.entrega.estado ?? "sin estado"}${p.entrega.fuente !== "siscore" && p.entrega.repartidor ? ` · ${p.entrega.repartidor}` : ""}${p.entrega.fecha ? ` · ${p.entrega.fecha}` : ""}${p.entrega.visitas ? ` · ${p.entrega.visitas} ${p.entrega.visitas === 1 ? "visita" : "visitas"} sin entregar` : ""}${p.entrega.causa ? ` · ${p.entrega.causa}` : ""}`
        : undefined;
      if (e === "entregado")
        return (
          <span title={monday}>
            <Pastilla tono="exito">Entregado</Pastilla>
          </span>
        );
      if (e === "devuelto")
        return (
          <span title={monday}>
            <Pastilla tono="peligro">Rechazado</Pastilla>
          </span>
        );
      if (anuladoPorEtiqueta(p.etiquetas))
        return (
          <span title={monday ?? "Etiqueta ANULADO/VERIFICADO o Cancelado: no se prepara y se procede a cancelar."}>
            <Pastilla tono="neutro">Anulado</Pastilla>
          </span>
        );
      return etapaLogistica(p.estado) === "en_ruta" ? (
        <span title={monday}>
          <Pastilla tono={p.entrega?.novedad ? "aviso" : undefined}>{p.entrega?.estado ? `En ruta · ${p.entrega.estado.toLowerCase()}` : "En ruta"}</Pastilla>
        </span>
      ) : listoParaPreparar(p.programado, p.provincia, hoy) ? (
        <Pastilla tono="aviso">Por preparar</Pastilla>
      ) : (
        <Pastilla tono="neutro">Programado</Pastilla>
      );
    },
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
export function LogisticaTienda({
  pedidos,
  codigoPais,
  tiendas,
  hoy,
  sinPedido = [],
}: {
  pedidos: PedidoFila[];
  codigoPais: string;
  tiendas: Record<string, string>;
  hoy: string;
  sinPedido?: SinPedidoMonday[];
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>("preparar_hoy");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const multiTienda = Object.keys(tiendas).length > 1;

  const grupos = useMemo(() => {
    // Los que el equipo etiquetó ANULADO/VERIFICADO (o Cancelado) no se preparan ni van en ruta: aparte, salvo que Monday o Servientrega registren la entrega.
    const abiertos = pedidos.filter((p) => {
      const e = etapaConEntrega(p.estado, p.entrega);
      return e === "por_preparar" || e === "en_ruta";
    });
    const anulados = abiertos.filter((p) => anuladoPorEtiqueta(p.etiquetas));
    const vigentes = abiertos.filter((p) => !anuladoPorEtiqueta(p.etiquetas));
    const porPreparar = vigentes.filter((p) => etapaLogistica(p.estado) === "por_preparar");
    const enRuta = vigentes.filter((p) => etapaConEntrega(p.estado, p.entrega) === "en_ruta");
    return {
      preparar_hoy: porPreparar.filter((p) => listoParaPreparar(p.programado, p.provincia, hoy)),
      preparar_despues: porPreparar.filter((p) => !listoParaPreparar(p.programado, p.provincia, hoy)).sort((a, b) => a.programado!.fecha.localeCompare(b.programado!.fecha)),
      en_ruta: enRuta,
      novedad: enRuta.filter((p) => p.entrega?.novedad || (p.entrega?.visitas ?? 0) > 0),
      demorados: enRuta.filter((p) => diasDesde(diaPanama(p.creado), hoy) >= DIAS_DEMORA),
      // Los cerrados que llegan solo para verificarlos (pueden ser viejos) no cuentan en Entregados ni Rechazados.
      entregados: pedidos.filter((p) => etapaConEntrega(p.estado, p.entrega) === "entregado" && !p.aVerificar),
      devueltos: pedidos.filter((p) => etapaConEntrega(p.estado, p.entrega) === "devuelto" && !p.aVerificar),
      verificar: pedidos.filter((p) => !!p.aVerificar),
      anulados,
      sin_zona: vigentes.filter((p) => !p.provincia),
    } satisfies Record<Vista, PedidoFila[]>;
  }, [pedidos, hoy]);
  const zonas = (ps: PedidoFila[]) => {
    const n = (z: string | null) => ps.filter((p) => p.provincia === z).length;
    return `${num(n("Ciudad"))} ciudad · ${num(n("Interior"))} interior · ${num(n(null))} sin zona`;
  };
  const filas = grupos[vista];
  const hayMonday = pedidos.some((p) => p.entrega);
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
    novedad: "Ningún pedido en ruta con visitas sin entregar.",
    entregados: "Ninguna entrega registrada en Monday para estos pedidos.",
    devueltos: "Ningún rechazo registrado en Monday para estos pedidos.",
    anulados: "Ningún pedido abierto con la etiqueta ANULADO/VERIFICADO.",
    sin_zona: "Todos los pedidos tienen zona.",
    verificar: sinPedido.length ? "Ningún pedido del sistema por verificar (abajo, lo de Monday sin pedido)." : "Nada por verificar: todo lo que dice Monday y Servientrega está asignado.",
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
          titulo="Con novedad"
          icono={AlertaIcon}
          color="ambar"
          punto={grupos.novedad.length ? "aviso" : undefined}
          valor={num(grupos.novedad.length)}
          detalle="visitas sin entregar (Servientrega)"
          alPulsar={() => alternar("novedad")}
          activo={vista === "novedad"}
        />
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
          titulo="Entregados"
          icono={CheckIcon}
          color="verde"
          valor={num(grupos.entregados.length)}
          detalle={hayMonday ? "últimos 7 días · Monday y Servientrega" : "llegan con Monday y SISCORE"}
          alPulsar={() => alternar("entregados")}
          activo={vista === "entregados"}
        />
        <Indicador
          titulo="Rechazados"
          icono={CerrarIcon}
          color="rojo"
          valor={num(grupos.devueltos.length)}
          detalle={hayMonday ? "últimos 7 días · fallidos o devueltos" : "llegan con Monday y SISCORE"}
          alPulsar={() => alternar("devueltos")}
          activo={vista === "devueltos"}
        />
        <Indicador
          titulo="Anulados"
          icono={CerrarIcon}
          color="ambar"
          valor={num(grupos.anulados.length)}
          detalle="ANULADO/VERIFICADO: no se preparan, por cancelar"
          alPulsar={() => alternar("anulados")}
          activo={vista === "anulados"}
        />
        <Indicador
          titulo="A verificar"
          icono={AlertaIcon}
          color="rojo"
          punto={grupos.verificar.length + sinPedido.length ? "peligro" : undefined}
          valor={num(grupos.verificar.length + sinPedido.length)}
          detalle={`${num(grupos.verificar.length)} pedidos · ${num(sinPedido.length)} de Monday sin pedido`}
          alPulsar={() => alternar("verificar")}
          activo={vista === "verificar"}
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
        Shopify no trae la guía, la fecha de despacho ni si el pedido se entregó: lo de ciudad se completa con Monday (entregado, rechazado y el
        repartidor); lo de interior, con la guía de Servientrega leída de SISCORE («Actualizar Servientrega»: estado, visitas sin entregar y
        devoluciones). Los días se cuentan desde el pedido. La zona y la transportista salen de la
        etiqueta (CIUDAD, INTERIOR/SERVIENTREGA) y la fecha programada, de la nota del pedido. Los etiquetados ANULADO/VERIFICADO (o Cancelado) no se
        preparan: van aparte en «Anulados» (mal etiquetados, dirección por mejorar, sin stock o reprogramados) y no cuentan en ruta.
      </p>

      {vista === "verificar" && (
        <p role="note" className="m-0 rounded-lg border border-primario/30 bg-primario-suave px-4 py-2 text-xs">
          Lo que Monday y Servientrega dicen se asigna solo en cada lectura. Aquí queda lo que no se pudo asignar y hay que averiguar por qué: pedidos en
          camino sin ningún registro, pedidos cerrados que Monday o Servientrega contradicen (el motivo sale en la columna Logística) y filas de Monday
          que no tienen pedido en el sistema.
        </p>
      )}

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

      {vista === "verificar" && sinPedido.length > 0 && (
        <section aria-label="Filas de Monday sin pedido" className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">En Monday sin pedido en el sistema ({num(sinPedido.length)})</h3>
          <p className="m-0 text-xs text-muted-foreground">Un número mal escrito en Monday o un pedido que no entró al sistema: buscarlo en Shopify o corregirlo en Monday.</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Pedido en Monday</th>
                  <th className="px-3 py-2 font-medium">Tablero</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Repartidor</th>
                  <th className="px-3 py-2 font-medium">Nota</th>
                  <th className="px-3 py-2 font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {sinPedido.map((f) => (
                  <tr key={`${f.tablero}-${f.numero}`} className="border-t border-border">
                    <td className="px-3 py-2 font-medium tabular-nums">{f.numero}</td>
                    <td className="px-3 py-2">{f.tablero}</td>
                    <td className="px-3 py-2">{f.estado}</td>
                    <td className="px-3 py-2">{f.repartidor ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.nota ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{f.fecha ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
