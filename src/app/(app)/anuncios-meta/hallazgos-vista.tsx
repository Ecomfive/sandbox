"use client";

import { useState } from "react";
import { NOMBRE_CATEGORIA, tieneHistorialSuficiente, UMBRALES_HISTORICO, type AnalisisHistorico, type CategoriaHallazgo, type FilaEntrega, type FilaMes, type FilaTendencia, type FilaVentas, type Hallazgo } from "@/lib/meta-ads/historico";
import type { InterpretacionGuardada } from "@/lib/meta-ads/interpretacion-guardada";
import { dolares } from "@/lib/meta-ads/metricas";
import { ChatHallazgos } from "./chat-hallazgos";
import { InsigniaCerteza, TarjetaMeta } from "./graficas";
import { InterpretacionVista } from "./interpretacion-vista";
import { Cifra, entero } from "./piezas";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

type Filtro = "todo" | "atender" | CategoriaHallazgo;
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "atender", texto: "Para atender" },
  { id: "todo", texto: "Todo" },
  { id: "entrega", texto: "Entrega" },
  { id: "tendencia", texto: "Tendencias" },
  { id: "no_funciona", texto: "Lo que no funciona" },
  { id: "funciona", texto: "Lo que funciona" },
];

const PUNTO = { alerta: "bg-destructive", bueno: "bg-success", info: "bg-muted-foreground" } as const;
const TEXTO_TONO = { alerta: "Para atender", bueno: "Buena noticia", info: "Para mirar" } as const;

function TarjetaHallazgo({ h }: { h: Hallazgo }) {
  return (
    <li className="flex flex-col gap-1.5 px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[h.tono]}`} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium">{h.titulo}</p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{h.detalle}</p>
          {h.motivo && (
            <p className="m-0 mt-1 text-xs">
              <span className="font-medium">Por qué: </span>
              {h.motivo}
            </p>
          )}
          {h.accion && (
            <p className="m-0 mt-1 text-xs">
              <span className="font-medium">Qué hacer: </span>
              {h.accion}
            </p>
          )}
          <p className="m-0 mt-1 text-xs text-muted-foreground">
            {NOMBRE_CATEGORIA[h.categoria]} · {TEXTO_TONO[h.tono]}
          </p>
        </div>
        <InsigniaCerteza certeza={h.certeza} />
      </div>
    </li>
  );
}

const ETIQUETA_VEREDICTO = {
  vende_y_entrega: { texto: "Vende y entrega", clase: "text-success" },
  vende_pero_no_entrega: { texto: "Vende pero no entrega", clase: "text-destructive" },
  no_funciona: { texto: "No llega a su tope", clase: "text-muted-foreground" },
  poca_data: { texto: "Poca data", clase: "text-muted-foreground" },
  sin_entrega: { texto: "Sin tasa de entrega todavía", clase: "text-muted-foreground" },
} as const;

function TablaEntrega({ filas, promedio, tiendas, pedidos }: { filas: FilaEntrega[]; promedio: number | null; tiendas: string[]; pedidos: number }) {
  return (
    <TarjetaMeta titulo="Entrega por producto" id="entrega" derecha={promedio !== null ? `Promedio de todos: ${pct(promedio)}` : undefined}>
      {tiendas.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">No se encontró la tienda de las cuentas en los pedidos (anótala en «Cuentas›Tienda» con el nombre de la tienda, por ejemplo «Oferfy»): sin eso no se puede calcular la tasa de entrega.</p>
      ) : (
        <>
          <p className="m-0 mb-2 text-xs text-muted-foreground">
            De los pedidos de {tiendas.join(", ")} de los últimos 180 días ({entero(pedidos)} líneas). Tasa = entregados ÷ (entregados + devueltos): lo cancelado antes de salir y lo que sigue en camino no cuentan. «CPA por entrega» es lo que cuesta cada compra que sí llega al cliente.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Producto</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Gasto</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Compras</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Entrega</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">Resueltos</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA por entrega</th>
                  <th scope="col" className="py-1.5 pl-3 font-medium">Veredicto</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const v = ETIQUETA_VEREDICTO[f.veredicto];
                  return (
                    <tr key={f.clave} className="border-b border-border last:border-b-0">
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                        {f.nombre}
                        {f.enTienda && f.enTienda.toLowerCase() !== f.nombre.toLowerCase() && <span className="block text-xs font-normal text-muted-foreground">En la tienda: {f.enTienda}</span>}
                      </th>
                      <td className="px-2 py-1.5 text-right tabular-nums">{dolares(f.gasto)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{entero(f.compras)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{f.cpa === null ? "—" : dolares(f.cpa)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{pct(f.tasa)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{entero(f.cerradas)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{f.cpaEntregado === null ? "—" : dolares(f.cpaEntregado)}</td>
                      <td className={`py-1.5 pl-3 text-xs font-medium ${v.clase}`}>{v.texto}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </TarjetaMeta>
  );
}

const RANKINGS = [
  { id: "productos", titulo: "Productos" },
  { id: "campanas", titulo: "Campañas" },
  { id: "videos", titulo: "Videos" },
  { id: "angulos", titulo: "Ángulos" },
  { id: "ganchos", titulo: "Ganchos" },
  { id: "formatos", titulo: "Formatos" },
] as const;

function TablaVentas({ filas }: { filas: FilaVentas[] }) {
  if (filas.length === 0) return <p className="m-0 text-sm text-muted-foreground">Todavía no hay ventas con este dato.</p>;
  const maximo = Math.max(...filas.map((f) => f.compras));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Nombre</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Compras</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Del total</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA</th>
            <th scope="col" className="py-1.5 pl-2 text-right font-medium">Entregadas (est.)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.nombre} className="border-b border-border last:border-b-0">
              <th scope="row" className="max-w-[18rem] py-1.5 pr-3 text-left font-medium"><span className="line-clamp-2">{f.nombre}</span></th>
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-1.5 rounded-full bg-primario" style={{ width: `${Math.max(4, (f.compras / maximo) * 96)}px` }} />
                  <span className="tabular-nums">{entero(f.compras)}</span>
                </span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{pct(f.parte)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{f.cpa === null ? "—" : dolares(f.cpa)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">
                {f.comprasEntregadas === null ? "—" : entero(f.comprasEntregadas)}
                {f.comprasEntregadas !== null && !f.entregaReal && <span className="ml-1 text-xs text-muted-foreground" title="Con el promedio de entrega de todos los productos: el suyo todavía no tiene tasa">*</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeccionVentas({ a }: { a: AnalisisHistorico }) {
  const [vista, setVista] = useState<(typeof RANKINGS)[number]["id"]>("productos");
  return (
    <TarjetaMeta titulo="Qué genera más ventas" id="ventas" derecha="Todo el historial">
      <div role="group" aria-label="Qué ordenar" className="mb-3 flex flex-wrap gap-1.5">
        {RANKINGS.map((r) => (
          <button key={r.id} type="button" aria-pressed={vista === r.id} onClick={() => setVista(r.id)} className={`min-h-8 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${vista === r.id ? "border-transparent bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
            {r.titulo}
          </button>
        ))}
      </div>
      <TablaVentas filas={a.rankings[vista]} />
      <p className="m-0 mt-2 text-xs text-muted-foreground">Ordenado por compras que Meta atribuye. «Entregadas (est.)» = compras × la tasa de entrega del producto; con * se usó el promedio de todos los productos porque el suyo todavía no tiene tasa.</p>
    </TarjetaMeta>
  );
}

function SeccionBandas({ a }: { a: AnalisisHistorico }) {
  return (
    <TarjetaMeta titulo="Desde qué valor funciona" id="bandas" derecha={`${entero(a.resumen.campanasMedibles)} campañas con gasto suficiente`}>
      <p className="m-0 mb-3 text-xs text-muted-foreground">
        De las campañas con al menos {dolares(100)} gastados, en cada banda de una métrica, cuántas llegaron a su CPA tope. En total funcionó {pct(a.resumen.tasaFuncionaron)}.
      </p>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {a.bandas.map((b) => (
          <div key={b.id} className="flex flex-col gap-1.5">
            <h3 className="m-0 text-sm font-semibold">{b.titulo}</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-2 font-medium">Valor</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">Campañas</th>
                  <th scope="col" className="px-1 py-1 text-right font-medium">Funcionaron</th>
                  <th scope="col" className="py-1 pl-1 text-right font-medium">CPA</th>
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f) => (
                  <tr key={f.etiqueta} className="border-b border-border last:border-b-0">
                    <th scope="row" className="py-1 pr-2 text-left font-normal">{f.etiqueta}</th>
                    <td className="px-1 py-1 text-right tabular-nums">{entero(f.campanas)}</td>
                    <td className="px-1 py-1 text-right tabular-nums">{f.campanas ? `${entero(f.funcionaron)} (${pct(f.tasa)})` : "—"}</td>
                    <td className="py-1 pl-1 text-right tabular-nums">{f.cpa === null ? "—" : dolares(f.cpa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </TarjetaMeta>
  );
}

const NOMBRE_MES = (mes: string) => {
  const [a, m] = mes.split("-");
  return new Date(Date.UTC(Number(a), Number(m) - 1, 1)).toLocaleDateString("es-PA", { month: "short", year: "numeric", timeZone: "UTC" });
};

function TablaMeses({ filas }: { filas: FilaMes[] }) {
  const celda = (n: number | null, f: (x: number) => string) => (n === null ? "—" : f(n));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Mes</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Gasto</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Compras</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">CTR</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Hook</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">CPM</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Clic a visita</th>
            <th scope="col" className="py-1.5 pl-2 text-right font-medium">CVR</th>
          </tr>
        </thead>
        <tbody>
          {[...filas].reverse().map((f) => (
            <tr key={f.mes} className="border-b border-border last:border-b-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium capitalize">{NOMBRE_MES(f.mes)}</th>
              <td className="px-2 py-1.5 text-right tabular-nums">{dolares(f.gasto)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{entero(f.compras)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.cpa, dolares)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.ctr, (n) => `${n.toFixed(2)} %`)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.hook, (n) => `${n.toFixed(1)} %`)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.cpm, dolares)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{celda(f.efectividad, (n) => `${n.toFixed(1)} %`)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{celda(f.cvr, (n) => `${n.toFixed(2)} %`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeccionMeses({ a }: { a: AnalisisHistorico }) {
  const [producto, setProducto] = useState("");
  if (a.meses.length === 0) return null;
  const filas = producto ? (a.mesesPorProducto.find((p) => p.nombre === producto)?.filas ?? []) : a.meses;
  return (
    <TarjetaMeta
      titulo="Mes a mes"
      id="meses"
      derecha={
        a.mesesPorProducto.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Ver
            <select value={producto} onChange={(e) => setProducto(e.target.value)} className="min-h-8 rounded-md border border-border-control bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              <option value="">Todas las campañas</option>
              {a.mesesPorProducto.map((p) => (
                <option key={p.nombre} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      <p className="m-0 mb-2 text-xs text-muted-foreground">El mes en curso está incompleto: compáralo con otro mes por CPA, CTR, hook, CPM o CVR, no por gasto ni compras totales.</p>
      <TablaMeses filas={filas} />
    </TarjetaMeta>
  );
}

function SeccionTendencias({ filas }: { filas: FilaTendencia[] }) {
  const [ventana, setVentana] = useState<"mes" | "semana">("mes");
  const lista = filas.filter((f) => f.ventana === ventana && f.cambio.sentido !== "poca").sort((a, b) => (a.cambio.sentido === b.cambio.sentido ? b.gastoRec - a.gastoRec : a.cambio.sentido === "baja" ? -1 : b.cambio.sentido === "baja" ? 1 : a.cambio.sentido === "mejora" ? -1 : 1));
  const NOMBRE = { baja: "Empeora", mejora: "Mejora", estable: "Estable", poca: "Poca data" } as const;
  const CLASE = { baja: "text-destructive", mejora: "text-success", estable: "text-muted-foreground", poca: "text-muted-foreground" } as const;
  return (
    <TarjetaMeta
      titulo="Cómo va frente a antes"
      id="tendencias"
      derecha={
        <div role="group" aria-label="Comparar" className="flex overflow-hidden rounded-md border border-border-control">
          {(["mes", "semana"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={ventana === v} onClick={() => setVentana(v)} className={`px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${ventana === v ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}>
              {v === "mes" ? "Último mes" : "Última semana"}
            </button>
          ))}
        </div>
      }
    >
      <p className="m-0 mb-2 text-xs text-muted-foreground">
        {ventana === "mes" ? "El último mes contra el mes anterior" : "La última semana contra las tres anteriores"}, con al menos {dolares(ventana === "mes" ? UMBRALES_HISTORICO.gastoMes : UMBRALES_HISTORICO.gastoSemana)} gastados en cada periodo. El CPA tiene que moverse {pct(UMBRALES_HISTORICO.cpaCambio)} y {dolares(UMBRALES_HISTORICO.cpaCambioDolares)} para contar.
      </p>
      {lista.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Nada con gasto suficiente en los dos periodos para comparar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">Qué</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">Compras antes → ahora</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">CPA antes → ahora</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Cómo va</th>
                <th scope="col" className="py-1.5 pl-2 font-medium">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={`${f.nivel}:${f.nombre}`} className="border-b border-border align-top last:border-b-0">
                  <th scope="row" className="max-w-[16rem] py-1.5 pr-3 text-left font-medium">
                    <span className="line-clamp-2">{f.nombre}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{f.nivel}</span>
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entero(f.comprasPrev)} → {entero(f.comprasRec)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{f.cambio.cpaPrev === null ? "—" : dolares(f.cambio.cpaPrev)} → {f.cambio.cpaRec === null ? "—" : dolares(f.cambio.cpaRec)}</td>
                  <td className={`px-2 py-1.5 text-xs font-medium ${CLASE[f.cambio.sentido]}`}>{NOMBRE[f.cambio.sentido]}</td>
                  <td className="py-1.5 pl-2 text-xs text-muted-foreground">{f.cambio.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TarjetaMeta>
  );
}

/**
 * Anuncios Meta › Hallazgos (24 nov 2026): lo que dicen los datos de todo el historial, sin necesidad de la calculadora: qué nunca funcionó, qué funciona mejor, qué empieza a empeorar y por qué, la entrega por producto
 * y qué genera más ventas. Arriba, la interpretación con IA de esas mismas estadísticas.
 */
export function HallazgosVista({ analisis, interpretacion, iaConectada, tiendas, pedidos, preparando }: { analisis: AnalisisHistorico; interpretacion: InterpretacionGuardada | null; iaConectada: boolean; tiendas: string[]; pedidos: number; preparando: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("atender");
  const a = analisis;
  if (!tieneHistorialSuficiente(a)) {
    return <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía hay muy poco historial (menos de {UMBRALES_HISTORICO.minUnidades} campañas con gasto suficiente) para sacar conclusiones. Cuando se lea más historial en «Cuentas › Traer historial», aparecen aquí.</p>;
  }
  const visibles = a.hallazgos.filter((h) => (filtro === "todo" ? true : filtro === "atender" ? h.tono === "alerta" : h.categoria === filtro));
  const cuenta = (f: Filtro) => a.hallazgos.filter((h) => (f === "todo" ? true : f === "atender" ? h.tono === "alerta" : h.categoria === f)).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Historial analizado" valor={`${entero(a.resumen.campanas)} campañas`} apoyo={`${a.resumen.desde ?? "—"} al ${a.resumen.hasta ?? "—"}`} />
        <Cifra titulo="Gastado y vendido" valor={dolares(a.resumen.gasto)} apoyo={`${entero(a.resumen.compras)} compras`} />
        <Cifra titulo="Campañas que funcionaron" valor={pct(a.resumen.tasaFuncionaron)} apoyo={`de ${entero(a.resumen.campanasMedibles)} con gasto suficiente`} />
        <Cifra titulo="Tasa de entrega" valor={pct(a.resumen.tasaEntrega)} apoyo={a.resumen.tasaEntrega === null ? "sin pedidos suficientes" : "de lo que se resolvió"} nivel={a.resumen.tasaEntrega === null ? undefined : a.resumen.tasaEntrega >= 0.7 ? "bueno" : a.resumen.tasaEntrega >= 0.55 ? "medio" : "malo"} />
      </div>

      <ChatHallazgos iaConectada={iaConectada} />

      <InterpretacionVista guardada={interpretacion} preparando={preparando} />

      <TarjetaMeta titulo="Lo que dicen los datos" id="hallazgos" derecha={`${entero(a.hallazgos.length)} hallazgos`}>
        <div role="group" aria-label="Filtrar hallazgos" className="mb-3 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className={`min-h-8 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${filtro === f.id ? "border-transparent bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
              {f.texto} <span className="tabular-nums opacity-80">({cuenta(f.id)})</span>
            </button>
          ))}
        </div>
        {visibles.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{filtro === "atender" ? "Nada que atender: ningún hallazgo pide acción ahora." : "No hay hallazgos de este tipo."}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
            {visibles.slice(0, 40).map((h) => (
              <TarjetaHallazgo key={h.id} h={h} />
            ))}
          </ul>
        )}
        <p className="m-0 mt-2 text-xs text-muted-foreground">«Funcionó» = tuvo al menos {dolares(100)} de gasto y su CPA quedó dentro del CPA tope de su producto (el de «Cuentas›Topes»). No usa la calculadora de costos. Los hallazgos que piden atención también salen como sugerencias en el Resumen.</p>
      </TarjetaMeta>

      <TablaEntrega filas={a.entrega} promedio={a.resumen.tasaEntrega} tiendas={tiendas} pedidos={pedidos} />
      <SeccionVentas a={a} />
      <SeccionMeses a={a} />
      <SeccionTendencias filas={a.tendencias} />
      <SeccionBandas a={a} />
    </div>
  );
}
