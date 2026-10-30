"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { anilloFoco } from "@/components/ui/field";
import { entregasPor, MIN_CERRADOS, sumarEntregas, TASA_BUENA, tonoEntrega, type FilaEntregas } from "@/lib/crm/automatizar";
import { duracionCorta, META_RESPUESTA_MIN, tonoRespuesta } from "@/lib/crm/equipo";
import { ETIQUETA_ESTADO_STOCK } from "@/lib/crm/productos";
import { ETIQUETA_ALERTA, ETIQUETA_SEGMENTO, nPedidos, type Segmento, type TipoAlerta } from "@/lib/crm/salud";
import type { DatosDireccion, FilaDireccion } from "./datos-direccion";
import type { ProductoCartera } from "@/lib/crm/productos";
import { Barra, Cifra, Cifras, Insignia, Tarjeta, type TonoDireccion } from "./piezas-direccion";
import { rutaVista } from "./ruta";
import { TONO_STOCK } from "./vista-productos";

/** El stock que se acaba, ya resumido en el servidor: cuántos productos, a cuántos clientes afecta y los 5 que más se piden. */
export interface ResumenStock {
  productos: number;
  clientes: number;
  top: Omit<ProductoCartera, "clientes">[];
}

/** Lo de la atención por WhatsApp de los últimos 7 días (`whatsapp_kpis`, por área). */
export interface ResumenAtencion {
  medianaMin: number | null;
  consultas: number;
  en15: number;
  sinResponder: number;
}

const SEGMENTOS: { s: Segmento; color: string; tono: TonoDireccion }[] = [
  { s: "activo", color: "var(--success)", tono: "exito" },
  { s: "riesgo", color: "var(--warning)", tono: "aviso" },
  { s: "dormido", color: "var(--destructive)", tono: "peligro" },
  { s: "perdido", color: "var(--foreground)", tono: "neutro" },
  { s: "sin_pedidos", color: "var(--border-control)", tono: "neutro" },
];
const TIPOS: { tipo: TipoAlerta; tono: TonoDireccion }[] = [
  { tipo: "caida", tono: "peligro" },
  { tipo: "dormido", tono: "aviso" },
  { tipo: "devoluciones", tono: "aviso" },
  { tipo: "sin_primer_pedido", tono: "info" },
];
const ejes = { tick: { fontSize: 11, fill: "var(--muted-foreground)" }, axisLine: false, tickLine: false } as const;
const estiloTooltip = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };
const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const cambio = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const textoCambio = (c: number | null) => (c === null ? "—" : `${c >= 0 ? "+" : "−"}${Math.abs(Math.round(c))} %`);
const diasDesde = (iso: string | null, hoy: string) => (iso ? Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null);

/** Una fila de cliente que abre su ficha en Clientes. */
function FilaCliente({ f, derecha, children }: { f: FilaDireccion; derecha?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li>
      <Link href={rutaVista("clientes", { cliente: f.id })} className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted ${anilloFoco}`}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold">
            {f.nombre} <span className="text-xs font-normal text-muted-foreground">{f.codigo}</span>
          </span>
          {children}
        </span>
        {derecha}
      </Link>
    </li>
  );
}

/** Un enlace a otra pestaña, al pie de una tarjeta. */
function VerMas({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`mt-auto self-start text-sm font-semibold text-primario hover:underline ${anilloFoco}`}>
      {children} →
    </Link>
  );
}

/**
 * Dirección › Resumen (30 oct 2026, pedido de Hernán: «paneles con gráficas, sencillos de entender y rápidos para tomar decisiones», no una
 * lista de clientes). Las cifras clave, los pedidos por semana, el estado de la cartera, dónde está el riesgo, cuánto pesan los que más piden,
 * qué atender hoy, el stock que se acaba, cómo se entrega y cómo se atiende. Todo lleva a su pestaña; un cliente abre su ficha en Clientes.
 */
export function VistaResumen({
  datos,
  stock,
  entregas,
  atencion,
  codigoPais,
}: {
  datos: DatosDireccion;
  stock: ResumenStock | null;
  entregas: FilaEntregas[] | null;
  atencion: ResumenAtencion | null;
  codigoPais: string;
}) {
  const router = useRouter();
  const { filas, alertas, hoy } = datos;
  const cuenta = (s: Segmento) => filas.filter((f) => f.segmento === s).length;
  const pedidos30 = filas.reduce((s, f) => s + f.pedidos30, 0);
  const pedidos30Antes = filas.reduce((s, f) => s + f.pedidos30Antes, 0);
  const c30 = cambio(pedidos30, pedidos30Antes);
  const porId = new Map(filas.map((f) => [f.id, f]));

  // Entregas de 60 días.
  const totalEntregas = entregas ? sumarEntregas(entregas) : null;
  const transportadoras = entregas ? [...entregasPor(entregas, (f) => f.transportadora).entries()].sort((a, b) => b[1].pedidos - a[1].pedidos).slice(0, 5) : [];
  const tonoEnt = totalEntregas ? tonoEntrega(totalEntregas) : "neutro";

  // Atención de 7 días.
  const tonoAt = atencion ? tonoRespuesta(atencion.medianaMin) : "neutro";

  // Estado de la cartera, para la dona.
  const estado = SEGMENTOS.map((x) => ({ ...x, nombre: ETIQUETA_SEGMENTO[x.s], n: cuenta(x.s) })).filter((x) => x.n > 0);

  // Dónde está el riesgo: los que bajaron o dejaron de pedir y más pedidos movían.
  const riesgo = alertas
    .filter((a) => a.tipo === "caida" || a.tipo === "dormido")
    .slice(0, 6)
    .map((a) => ({ a, f: porId.get(a.dropshipperId) }))
    .filter((x): x is { a: (typeof alertas)[number]; f: FilaDireccion } => !!x.f);

  // Concentración: cuánto de los pedidos hacen los 10 que más piden.
  const top = [...filas].sort((a, b) => b.pedidos30 - a.pedidos30).slice(0, 10).filter((f) => f.pedidos30 > 0);
  const pedidosTop = top.reduce((s, f) => s + f.pedidos30, 0);
  const maxTop = Math.max(1, ...top.map((f) => f.pedidos30));

  // Qué atender hoy, por tipo, y lo más urgente.
  const porTipo = TIPOS.map((t) => ({ ...t, n: alertas.filter((a) => a.tipo === t.tipo).length }));
  const maxTipo = Math.max(1, ...porTipo.map((t) => t.n));
  const urgentes = alertas.filter((a) => a.prioridad === "alta").length;


  const semanas = datos.semanas.map((s, i) => ({ semana: fechaCorta(s.semana), pedidos: s.pedidos, enCurso: i === datos.semanas.length - 1 }));
  const ultimas = datos.semanas.slice(-4);
  const tendenciaSemanas = ultimas.length >= 3 && ultimas[0].pedidos ? (ultimas[ultimas.length - 2].pedidos / ultimas[0].pedidos - 1) * 100 : null;

  return (
    <>
      <Cifras>
        <Cifra
          titulo="Activos"
          valor={cuenta("activo")}
          nota={`de ${filas.length} con cuenta en ${codigoPais}`}
          tono="exito"
          alPulsar={() => router.push(rutaVista("clientes", { segmento: "activo" }))}
        />
        <Cifra titulo="En riesgo" valor={cuenta("riesgo")} nota="Bajaron o dejaron de pedir" tono="aviso" alPulsar={() => router.push(rutaVista("clientes", { segmento: "riesgo" }))} />
        <Cifra titulo="Dormidos" valor={cuenta("dormido")} nota="21 a 59 días sin pedir" tono="peligro" alPulsar={() => router.push(rutaVista("clientes", { segmento: "dormido" }))} />
        <Cifra titulo="Pedidos en 30 días" valor={pedidos30.toLocaleString("es")} nota={`${textoCambio(c30)} frente a los 30 anteriores`} tono={c30 === null ? "neutro" : c30 >= 0 ? "exito" : "peligro"} />
        <Cifra
          titulo="Entregado (60 días)"
          valor={pct(totalEntregas?.tasa ?? null)}
          nota={`Meta ${Math.round(TASA_BUENA * 100)} %`}
          tono={tonoEnt === "neutro" ? "neutro" : tonoEnt}
          alPulsar={() => router.push(rutaVista("entregas"))}
        />
        <Cifra
          titulo="1.ª respuesta (7 días)"
          valor={duracionCorta(atencion?.medianaMin ?? null)}
          nota={atencion ? `${atencion.sinResponder} sin responder · meta ${META_RESPUESTA_MIN} min` : "Sin datos"}
          tono={tonoAt}
          alPulsar={() => router.push(rutaVista("kpis"))}
        />
      </Cifras>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Tarjeta
          id="t-semanas"
          titulo="Pedidos por semana"
          extra={tendenciaSemanas === null ? undefined : `${textoCambio(tendenciaSemanas)} en las últimas semanas`}
          className="lg:col-span-2"
        >
          {semanas.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Sin pedidos en las últimas 8 semanas.</p>
          ) : (
            <div role="img" aria-label={`Pedidos por semana: ${semanas.map((s) => `${s.semana} ${s.pedidos}`).join(", ")}`} className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={semanas} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="semana" {...ejes} />
                  <YAxis {...ejes} width={48} />
                  <Tooltip contentStyle={estiloTooltip} cursor={{ fill: "var(--muted)" }} formatter={(v) => [Number(v).toLocaleString("es"), "Pedidos"]} labelFormatter={(l) => `Semana del ${l}`} />
                  <Bar dataKey="pedidos" radius={[6, 6, 0, 0]}>
                    {semanas.map((s) => (
                      <Cell key={s.semana} fill="var(--primario)" fillOpacity={s.enCurso ? 0.4 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="m-0 text-xs text-muted-foreground">Semanas de lunes a domingo, sin cancelados; la última, más clara, va en curso.</p>
        </Tarjeta>

        <Tarjeta id="t-estado" titulo="Estado de la cartera" extra={`${filas.length} con cuenta`}>
          <div className="flex items-center gap-4">
            <div role="img" aria-label={estado.map((e) => `${e.nombre} ${e.n}`).join(", ")} className="relative h-[150px] w-[150px] flex-none">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={estado} dataKey="n" nameKey="nombre" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {estado.map((e) => (
                      <Cell key={e.s} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={estiloTooltip} />
                </PieChart>
              </ResponsiveContainer>
              <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums">{cuenta("activo")}</span>
                <span className="text-[11px] text-muted-foreground">activos</span>
              </span>
            </div>
            <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1 p-0">
              {estado.map((e) => (
                <li key={e.s}>
                  <Link href={rutaVista("clientes", { segmento: e.s })} className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted ${anilloFoco}`}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: e.color }} />
                      {e.nombre}
                    </span>
                    <span className="font-semibold tabular-nums">{e.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="m-0 text-xs text-muted-foreground">Pulsa un estado para ver esos clientes.</p>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Tarjeta id="t-riesgo" titulo="Dónde está el riesgo" extra={`${cuenta("riesgo") + cuenta("dormido")} clientes`}>
          {riesgo.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Nadie con caída de pedidos ni dormido.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {riesgo.map(({ a, f }) => {
                const dias = diasDesde(f.ultimoPedido, hoy);
                return (
                  <FilaCliente key={a.clave} f={f} derecha={<Insignia tono={a.tipo === "caida" ? "peligro" : "aviso"}>{ETIQUETA_ALERTA[a.tipo]}</Insignia>}>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {a.texto}
                      {dias !== null && a.tipo === "caida" ? ` ${dias <= 0 ? "Pidió hoy." : dias === 1 ? "Pidió ayer." : `Último pedido hace ${dias} días.`}` : ""}
                    </span>
                  </FilaCliente>
                );
              })}
            </ul>
          )}
          <VerMas href={rutaVista("clientes", { segmento: "riesgo" })}>Ver todos en riesgo</VerMas>
        </Tarjeta>

        <Tarjeta id="t-top" titulo="Los que más piden" extra={pedidos30 ? `Top ${top.length}: ${Math.round((pedidosTop / pedidos30) * 100)} % de los pedidos` : undefined}>
          {top.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Sin pedidos en 30 días.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {top.map((f) => (
                <FilaCliente key={f.id} f={f} derecha={<span className="w-12 text-right text-sm font-bold tabular-nums">{f.pedidos30.toLocaleString("es")}</span>}>
                  <Barra valor={(f.pedidos30 / maxTop) * 100} tono={f.segmento === "riesgo" || f.segmento === "dormido" ? "aviso" : "info"} />
                </FilaCliente>
              ))}
            </ul>
          )}
          <p className="m-0 text-xs text-muted-foreground">Pedidos de 30 días. En ámbar, los que están en riesgo.</p>
        </Tarjeta>

        <Tarjeta id="t-atender" titulo="Qué atender hoy" extra={`${alertas.length} alertas · ${urgentes} urgentes`}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {porTipo.map((t) => (
              <li key={t.tipo} className="flex flex-col gap-1">
                <span className="flex justify-between text-sm">
                  <span>{ETIQUETA_ALERTA[t.tipo]}</span>
                  <span className="font-bold tabular-nums">{t.n}</span>
                </span>
                <Barra valor={(t.n / maxTipo) * 100} tono={t.tono} alto="h-2" />
              </li>
            ))}
          </ul>
          <p className="m-0 text-xs text-muted-foreground">Al abrir un cliente, su ficha trae el siguiente paso: crear una tarea o marcarla atendida.</p>
          <VerMas href={rutaVista("clientes")}>Ir a Clientes</VerMas>
        </Tarjeta>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Tarjeta id="t-stock" titulo="Stock que se acaba" extra={stock ? `${stock.productos} productos · ${stock.clientes} clientes` : undefined}>
          {!stock ? (
            <p className="m-0 text-sm text-muted-foreground">Sin datos de productos.</p>
          ) : stock.top.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Nada se está acabando.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {stock.top.map((p) => (
                <li key={p.productoId} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.dropshippers} {p.dropshippers === 1 ? "cliente" : "clientes"} · {nPedidos(p.pedidos)} en 30 d ·{" "}
                      {p.camino ? `vienen ${p.camino.unidades.toLocaleString("es")} u.${p.camino.llegada ? ` (${fechaCorta(p.camino.llegada)})` : ""}` : "nada en camino"}
                    </span>
                  </span>
                  <Insignia tono={TONO_STOCK[p.estado]}>{ETIQUETA_ESTADO_STOCK[p.estado]}</Insignia>
                </li>
              ))}
            </ul>
          )}
          <VerMas href={rutaVista("productos")}>Ver productos</VerMas>
        </Tarjeta>

        <Tarjeta id="t-entregas" titulo="Entregas por transportadora" extra="60 días">
          {transportadoras.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">Sin pedidos en 60 días.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {transportadoras.map(([t, e]) => {
                const tono = tonoEntrega(e);
                return (
                  <li key={t} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{t}</span>
                      <span className={`font-bold tabular-nums ${tono === "exito" ? "text-success" : tono === "aviso" ? "text-warning" : tono === "peligro" ? "text-destructive" : "text-muted-foreground"}`}>{pct(e.tasa)}</span>
                    </span>
                    <Barra valor={(e.tasa ?? 0) * 100} tono={tono === "neutro" ? "neutro" : tono} alto="h-2" />
                    <span className="text-xs text-muted-foreground">
                      {nPedidos(e.pedidos)} · {e.devueltos.toLocaleString("es")} devueltos
                      {e.entregados + e.devueltos < MIN_CERRADOS ? " · pocos cerrados" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <VerMas href={rutaVista("entregas")}>Ver entregas</VerMas>
        </Tarjeta>

        <Tarjeta id="t-atencion" titulo="Atención por WhatsApp" extra="7 días">
          {!atencion ? (
            <p className="m-0 text-sm text-muted-foreground">Sin datos de WhatsApp.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">1.ª respuesta</div>
                <div className={`text-xl font-bold ${tonoAt === "exito" ? "text-success" : tonoAt === "aviso" ? "text-warning" : tonoAt === "peligro" ? "text-destructive" : ""}`}>{duracionCorta(atencion.medianaMin)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">En {META_RESPUESTA_MIN} min</div>
                <div className="text-xl font-bold">{atencion.consultas ? `${Math.round((atencion.en15 / atencion.consultas) * 100)} %` : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sin responder</div>
                <div className={`text-xl font-bold ${atencion.sinResponder ? "text-destructive" : ""}`}>{atencion.sinResponder}</div>
              </div>
            </div>
          )}
          <p className="m-0 text-xs text-muted-foreground">{atencion ? `${atencion.consultas} consultas. Meta: responder en ${META_RESPUESTA_MIN} minutos.` : ""}</p>
          <VerMas href={rutaVista("kpis")}>Ver KPIs de atención</VerMas>
        </Tarjeta>
      </div>
    </>
  );
}
