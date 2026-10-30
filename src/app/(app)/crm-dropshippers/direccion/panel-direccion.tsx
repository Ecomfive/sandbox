"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { BotonBarra, CabeceraTarjeta, MarcoTabla, Pastilla, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { ContenidoKpi, claseKpi, type Tono } from "@/components/ui/kpi-card";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { ETIQUETA_ALERTA, ETIQUETA_BANDA, ETIQUETA_SEGMENTO, SUGERENCIA_ALERTA, type Banda, type Prioridad, type Segmento, type TipoAlerta } from "@/lib/crm/salud";
import { asignarResponsable, atenderAlerta, crearTareaDeAlerta } from "./actions";
import type { AlertaDireccion, DatosDireccion, FilaDireccion } from "./datos-direccion";
import type { DatosProductos } from "./datos-productos";
import { descargarLista } from "./lista-csv";
import { TONO_STOCK, textoCamino } from "./vista-productos";
import { ETIQUETA_ESTADO_STOCK } from "@/lib/crm/productos";

type TonoPastilla = "neutro" | "exito" | "aviso" | "peligro" | "oscuro";

const TONO_BANDA: Record<Banda, TonoPastilla> = { sano: "exito", atencion: "aviso", critico: "peligro", sin_pedidos: "neutro" };
const BARRA_BANDA: Record<Banda, string> = { sano: "bg-success", atencion: "bg-warning", critico: "bg-destructive", sin_pedidos: "bg-border-control" };
const TONO_SEGMENTO: Record<Segmento, TonoPastilla> = { activo: "exito", riesgo: "aviso", dormido: "peligro", perdido: "oscuro", sin_pedidos: "neutro" };
const PRIORIDAD: Record<Prioridad, [string, TonoPastilla]> = { alta: ["Urgente", "peligro"], media: ["Hoy", "aviso"], baja: ["Cuando puedas", "neutro"] };
const TONO_ALERTA: Record<TipoAlerta, TonoPastilla> = { caida: "peligro", dormido: "aviso", devoluciones: "aviso", sin_primer_pedido: "neutro" };

type FiltroAlerta = "todas" | "urgentes" | TipoAlerta;
const FILTROS_ALERTA: { valor: FiltroAlerta; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "urgentes", etiqueta: "Urgentes" },
  { valor: "caida", etiqueta: "Caída" },
  { valor: "dormido", etiqueta: "Dormidos" },
  { valor: "devoluciones", etiqueta: "Devoluciones" },
  { valor: "sin_primer_pedido", etiqueta: "Sin primer pedido" },
];
const pasaFiltro = (a: AlertaDireccion, f: FiltroAlerta) => f === "todas" || (f === "urgentes" ? a.prioridad === "alta" : a.tipo === f);

type Orden = "salud" | "pedidos" | "caida";
const POR_PAGINA = 60;

const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", timeZone: "UTC" });

function diasDesde(iso: string | null, hoy: string): string {
  if (!iso) return "Nunca";
  const d = Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : `Hace ${d} días`;
}

/** «+18 %», «−42 %» o «—» si no hay 30 días anteriores con pedidos. */
function cambio(f: { pedidos30: number; pedidos30Antes: number }): number | null {
  return f.pedidos30Antes ? (f.pedidos30 / f.pedidos30Antes - 1) * 100 : null;
}
const textoCambio = (c: number | null) => (c === null ? "—" : `${c >= 0 ? "+" : "−"}${Math.abs(Math.round(c))} %`);

function TipoCliente({ nivel }: { nivel: string }) {
  if (nivel === "black") return <Pastilla tono="oscuro">BLACK</Pastilla>;
  if (nivel === "vip") return <Pastilla tono="aviso">VIP</Pastilla>;
  return null;
}

/** Una tarjeta de indicador que filtra la lista de clientes (aria-pressed). */
function Indicador({ titulo, valor, subtexto, tono, activo, alPulsar }: { titulo: string; valor: string | number; subtexto: string; tono: Tono; activo: boolean; alPulsar: () => void }) {
  return (
    <button type="button" aria-pressed={activo} onClick={alPulsar} className={`${claseKpi(tono, true, activo)} text-left ${anilloFoco}`}>
      <ContenidoKpi titulo={titulo} valor={valor} subtexto={subtexto} tono={tono} />
    </button>
  );
}

/**
 * CRM › Dirección: indicadores de la cartera, la cola «Qué atender hoy», la salud por bandas, los pedidos por semana y la lista de clientes
 * con su salud (cada fila se abre para ver de qué sale el puntaje).
 */
export function PanelDireccion({
  datos,
  productos,
  codigoPais,
  escribe,
  usuarioId,
}: {
  datos: DatosDireccion;
  /** Lo que vende cada cliente y qué recomendarle (fase 3); null sin la migración 0200. */
  productos: DatosProductos | null;
  codigoPais: string;
  escribe: boolean;
  usuarioId: string;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [filtroAlerta, setFiltroAlerta] = useState<FiltroAlerta>("todas");
  const [segmento, setSegmento] = useState<Segmento | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | "vip" | "regular">("todos");
  const [orden, setOrden] = useState<Orden>("salud");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [tareaDe, setTareaDe] = useState<AlertaDireccion | null>(null);

  const { filas, hoy } = datos;
  const alertas = datos.alertas.filter((a) => !quitadas.has(a.clave));
  const visiblesAlerta = alertas.filter((a) => pasaFiltro(a, filtroAlerta));

  const cuenta = (s: Segmento) => filas.filter((f) => f.segmento === s).length;
  const pedidos30 = filas.reduce((s, f) => s + f.pedidos30, 0);
  const pedidos30Antes = filas.reduce((s, f) => s + f.pedidos30Antes, 0);
  const cambioTotal = pedidos30Antes ? (pedidos30 / pedidos30Antes - 1) * 100 : null;
  const vip = filas.filter((f) => f.nivel === "vip" || f.nivel === "black").length;
  const bandas = (["sano", "atencion", "critico", "sin_pedidos"] as Banda[]).map((b) => ({ banda: b, n: filas.filter((f) => f.salud.banda === b).length }));

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const esVip = (f: FilaDireccion) => f.nivel === "vip" || f.nivel === "black";
    const l = filas.filter(
      (f) =>
        (segmento === "todos" || f.segmento === segmento) &&
        (tipo === "todos" || (tipo === "vip") === esVip(f)) &&
        (!q || `${f.nombre} ${f.codigo} ${f.responsable ?? ""}`.toLowerCase().includes(q)),
    );
    const salud = (f: FilaDireccion) => f.salud.puntaje ?? 1000;
    return l.sort((a, b) =>
      orden === "pedidos" ? b.pedidos30 - a.pedidos30 : orden === "caida" ? (cambio(a) ?? 1e9) - (cambio(b) ?? 1e9) : salud(a) - salud(b) || b.pedidos30 - a.pedidos30,
    );
  }, [filas, segmento, tipo, busca, orden]);

  function descargar() {
    const nombre = [segmento === "todos" ? "todos" : ETIQUETA_SEGMENTO[segmento], tipo === "vip" ? "VIP o BLACK" : tipo === "regular" ? "regulares" : "", busca.trim() ? `«${busca.trim()}»` : ""].filter(Boolean).join(" · ");
    empezar(async () => {
      const r = await descargarLista(lista, nombre, `dropshippers-${segmento}`);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`Lista de ${lista.length} dropshippers descargada${r.conTelefono ? " con su WhatsApp" : ""}.`);
    });
  }

  const maxSemana = Math.max(1, ...datos.semanas.map((s) => s.pedidos));
  const elegirSegmento = (s: Segmento | "todos") => {
    setSegmento((x) => (x === s ? "todos" : s));
    setMostrar(POR_PAGINA);
  };

  function atender(a: AlertaDireccion) {
    empezar(async () => {
      const r = await atenderAlerta(a.dropshipperId, a.tipo);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setQuitadas((s) => new Set(s).add(a.clave));
      mostrarToast(`Atendida: ${a.nombre} no vuelve a salir en 7 días si sigue igual.`);
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-3 [&>*]:max-w-80 [&>*]:min-w-0 [&>*]:flex-[1_1_11rem]">
        <Indicador titulo="Cartera con Dropi" valor={filas.length} subtexto={datos.sinCuenta ? `${datos.sinCuenta} sin cuenta vinculada en ${codigoPais}` : `Con cuenta vinculada en ${codigoPais}`} tono="neutral" activo={segmento === "todos"} alPulsar={() => elegirSegmento("todos")} />
        <Indicador titulo="Activos" valor={cuenta("activo")} subtexto="Piden con normalidad" tono="success" activo={segmento === "activo"} alPulsar={() => elegirSegmento("activo")} />
        <Indicador titulo="En riesgo" valor={cuenta("riesgo")} subtexto="Bajaron sus pedidos o dejaron de pedir" tono="warning" activo={segmento === "riesgo"} alPulsar={() => elegirSegmento("riesgo")} />
        <Indicador titulo="Dormidos" valor={cuenta("dormido")} subtexto={cuenta("perdido") ? `De 21 a 59 días sin pedir · ${cuenta("perdido")} perdidos (60 o más)` : "De 21 a 59 días sin pedir"} tono="destructive" activo={segmento === "dormido"} alPulsar={() => elegirSegmento("dormido")} />
        <Indicador titulo="Sin pedidos" valor={cuenta("sin_pedidos")} subtexto="Con cuenta y sin pedidos registrados" tono="neutral" activo={segmento === "sin_pedidos"} alPulsar={() => elegirSegmento("sin_pedidos")} />
        <div className={claseKpi("info", false)}>
          <ContenidoKpi titulo="Pedidos en 30 días" valor={pedidos30.toLocaleString("es")} subtexto={`${textoCambio(cambioTotal)} frente a los 30 anteriores · ${vip} VIP o BLACK`} tono="info" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="t-atender" className="rounded-[10px] border border-border bg-card">
          <CabeceraTarjeta id="t-atender" titulo="Qué atender hoy">
            <span className="text-xs text-muted-foreground">
              {alertas.length} pendientes{datos.atendidas ? ` · ${datos.atendidas} atendidas esta semana` : ""}
            </span>
          </CabeceraTarjeta>
          <div className="flex flex-wrap gap-2 px-3.5 pt-3" role="group" aria-label="Filtrar alertas">
            {FILTROS_ALERTA.map((f) => (
              <BotonBarra key={f.valor} activo={filtroAlerta === f.valor} onClick={() => setFiltroAlerta(f.valor)}>
                {f.etiqueta} · {alertas.filter((a) => pasaFiltro(a, f.valor)).length}
              </BotonBarra>
            ))}
          </div>
          {visiblesAlerta.length === 0 ? (
            <p className="m-0 px-3.5 py-10 text-center text-sm text-muted-foreground">Nada pendiente en este filtro.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {visiblesAlerta.map((a) => (
                <li key={a.clave} className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3.5 py-3 last:border-b-0">
                  <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pastilla tono={TONO_ALERTA[a.tipo]}>{ETIQUETA_ALERTA[a.tipo]}</Pastilla>
                      <Pastilla tono={PRIORIDAD[a.prioridad][1]}>{PRIORIDAD[a.prioridad][0]}</Pastilla>
                    </div>
                    <p className="m-0 text-sm">
                      <span className="font-semibold">{a.nombre}</span> <span className="text-xs text-muted-foreground">{a.codigo}</span>
                    </p>
                    <p className="m-0 text-sm text-foreground">{a.texto}</p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {a.responsable ? `Lo lleva ${a.responsable}` : "Sin responsable"} · {SUGERENCIA_ALERTA[a.tipo]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/crm-dropshippers?abrir=${a.dropshipperId}`} className={`inline-flex h-[34px] items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}>
                      Ver ficha
                    </Link>
                    {escribe && (
                      <>
                        <BotonBarra onClick={() => setTareaDe(a)} disabled={pendiente}>
                          Crear tarea
                        </BotonBarra>
                        <BotonBarra onClick={() => atender(a)} disabled={pendiente} title="No vuelve a salir en 7 días si sigue igual">
                          Atendida
                        </BotonBarra>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="t-salud" className="rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="t-salud" titulo="Salud de la cartera" />
            <div className="flex flex-col gap-3 p-3.5">
              <div role="img" aria-label={bandas.map((b) => `${ETIQUETA_BANDA[b.banda]} ${b.n}`).join(", ")} className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
                {bandas.filter((b) => b.n).map((b) => (
                  <span key={b.banda} className={BARRA_BANDA[b.banda]} style={{ flex: `${b.n} 1 0` }} />
                ))}
              </div>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                {bandas.map((b) => (
                  <li key={b.banda} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${BARRA_BANDA[b.banda]}`} />
                      {ETIQUETA_BANDA[b.banda]}
                      <span className="text-xs text-muted-foreground">{b.banda === "sano" ? "70 o más" : b.banda === "atencion" ? "40 a 69" : b.banda === "critico" ? "menos de 40" : ""}</span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {b.n} <span className="font-normal text-muted-foreground">({filas.length ? Math.round((b.n / filas.length) * 100) : 0} %)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="t-semanas" className="rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="t-semanas" titulo="Pedidos por semana" />
            <div className="p-3.5">
              {datos.semanas.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">Sin pedidos en las últimas 8 semanas.</p>
              ) : (
                <>
                  <div role="img" aria-label={`Pedidos por semana: ${datos.semanas.map((s) => `${fechaCorta(s.semana)} ${s.pedidos}`).join(", ")}`} className="flex h-32 items-end gap-1.5 border-b border-border">
                    {datos.semanas.map((s, i) => (
                      <div key={s.semana} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[11px] text-muted-foreground tabular-nums">{s.pedidos}</span>
                        <span className={`w-full max-w-9 rounded-t ${i === datos.semanas.length - 1 ? "bg-primario/45" : "bg-primario"}`} style={{ height: `${Math.max(2, Math.round((s.pedidos / maxSemana) * 96))}px` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex gap-1.5">
                    {datos.semanas.map((s) => (
                      <span key={s.semana} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">
                        {fechaCorta(s.semana)}
                      </span>
                    ))}
                  </div>
                  <p className="m-0 mt-2 text-xs text-muted-foreground">Semanas de lunes a domingo; la última, más clara, va en curso. Sin cancelados.</p>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      <section aria-labelledby="t-clientes" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="t-clientes" className="m-0 text-base font-semibold">
            Clientes {segmento !== "todos" && <span className="font-normal text-muted-foreground">· {ETIQUETA_SEGMENTO[segmento]}</span>}
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1 sm:flex-none">
              <span className={labelClassSm}>Buscar</span>
              <input type="search" value={busca} onChange={(e) => (setBusca(e.target.value), setMostrar(POR_PAGINA))} placeholder="Nombre, código o responsable" className={`${fieldClass} w-full sm:w-64`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tipo</span>
              <select value={tipo} onChange={(e) => (setTipo(e.target.value as typeof tipo), setMostrar(POR_PAGINA))} className={fieldClass}>
                <option value="todos">Todos</option>
                <option value="vip">VIP o BLACK</option>
                <option value="regular">Regulares</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Ordenar</span>
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={fieldClass}>
                <option value="salud">Peor salud primero</option>
                <option value="caida">Mayor caída primero</option>
                <option value="pedidos">Más pedidos primero</option>
              </select>
            </label>
            {escribe && (
              <BotonBarra onClick={descargar} disabled={pendiente || lista.length === 0} title="Un CSV con los que se ven en la lista, para una difusión. No envía nada.">
                Descargar lista ({lista.length})
              </BotonBarra>
            )}
          </div>
        </div>
        <MarcoTabla ariaLabel="Clientes con su salud">
          <table className="w-full min-w-[60rem] border-collapse">
            <thead>
              <tr>
                {["Dropshipper", "Estado", "Salud", "Pedidos 30 días", "Frente a 30 anteriores", "Último pedido", "Lo lleva"].map((t) => (
                  <th key={t} scope="col" className={claseTh}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Ningún dropshipper coincide.
                  </td>
                </tr>
              ) : (
                lista.slice(0, mostrar).map((f) => {
                  const c = cambio(f);
                  const abiertoAqui = abierto === f.id;
                  return (
                    <Fragment key={f.id}>
                      <tr className={abiertoAqui ? "bg-muted" : "hover:bg-muted"}>
                        <td className={claseTd}>
                          <button type="button" aria-expanded={abiertoAqui} onClick={() => setAbierto(abiertoAqui ? null : f.id)} className={`flex flex-col items-start rounded text-left ${anilloFoco}`}>
                            <span className="flex items-center gap-1.5 font-medium">
                              {f.nombre} <TipoCliente nivel={f.nivel} />
                            </span>
                            <span className="text-xs text-muted-foreground">{f.codigo}</span>
                          </button>
                        </td>
                        <td className={claseTd}>
                          <Pastilla tono={TONO_SEGMENTO[f.segmento]}>{ETIQUETA_SEGMENTO[f.segmento]}</Pastilla>
                        </td>
                        <td className={claseTd}>
                          {f.salud.puntaje === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="w-7 font-semibold tabular-nums">{f.salud.puntaje}</span>
                              <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <span className={`block h-full ${BARRA_BANDA[f.salud.banda]}`} style={{ width: `${f.salud.puntaje}%` }} />
                              </span>
                              <span className="sr-only">{ETIQUETA_BANDA[f.salud.banda]}</span>
                            </span>
                          )}
                        </td>
                        <td className={`${claseTd} tabular-nums`}>{f.pedidos30}</td>
                        <td className={`${claseTd} tabular-nums ${c === null ? "text-muted-foreground" : c >= 0 ? "text-success" : "text-destructive"}`}>{textoCambio(c)}</td>
                        <td className={claseTd}>{diasDesde(f.ultimoPedido, hoy)}</td>
                        <td className={claseTd}>{f.responsable ?? <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                      {abiertoAqui && (
                        <tr>
                          <td colSpan={7} className="border-b border-border bg-card px-4 py-4">
                            <DetalleSalud f={f} personas={datos.personas} escribe={escribe} extra={productos?.porCliente[f.id]} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </MarcoTabla>
        {lista.length > mostrar && (
          <div className="flex justify-center">
            <BotonBarra onClick={() => setMostrar((m) => m + POR_PAGINA)}>
              Ver {Math.min(POR_PAGINA, lista.length - mostrar)} más de {lista.length - mostrar}
            </BotonBarra>
          </div>
        )}
      </section>

      {tareaDe && (
        <FormTarea
          alerta={tareaDe}
          personas={datos.personas}
          hoy={hoy}
          usuarioId={usuarioId}
          alCerrar={() => setTareaDe(null)}
          alCrear={(nombre) => {
            setQuitadas((s) => new Set(s).add(tareaDe.clave));
            setTareaDe(null);
            mostrarToast(`Tarea creada para ${nombre}. La alerta no vuelve a salir en 7 días si sigue igual.`);
          }}
        />
      )}
    </>
  );
}

/** «Lo lleva»: quién del equipo lleva a este dropshipper (de ahí sale su cartera en la vista Equipo). Solo Dirección con escritura lo cambia. */
function LoLleva({ f, personas, escribe }: { f: FilaDireccion; personas: { id: string; nombre: string }[]; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  if (!escribe) return <span className="text-sm text-muted-foreground">Lo lleva: {f.responsable ?? "nadie"}</span>;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Lo lleva</span>
      <select
        value={f.responsableId ?? ""}
        disabled={pendiente}
        onChange={(e) => {
          const id = e.target.value || null;
          empezar(async () => {
            const r = await asignarResponsable(f.id, id);
            if ("error" in r) return mostrarToast(r.error, "destructive");
            mostrarToast(id ? `${f.nombre} ahora lo lleva ${personas.find((p) => p.id === id)?.nombre ?? "esa persona"}.` : `${f.nombre} quedó sin responsable.`);
            router.refresh();
          });
        }}
        className={`${fieldClass} w-auto`}
      >
        <option value="">{!f.responsableId && f.responsable ? `Nadie (su chat lo tiene ${f.responsable})` : "Nadie"}</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

/** De qué sale el puntaje de un dropshipper: cada factor con su barra y su dato; y quién lo lleva. */
/** Lo que vende (con el stock de cada producto) y qué recomendarle. */
function VendeYRecomendados({ extra }: { extra: DatosProductos["porCliente"][string] | undefined }) {
  if (!extra) return null;
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-border pt-3 lg:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Lo que vende (30 días)</p>
        {extra.vende.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin pedidos en 30 días.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {extra.vende.map((v) => (
              <li key={v.productoId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="min-w-0">
                  {v.nombre} <span className="text-xs text-muted-foreground">· {v.pedidos} pedidos ({Math.round(v.parte * 100)} %)</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Pastilla tono={TONO_STOCK[v.estado]}>
                    {ETIQUETA_ESTADO_STOCK[v.estado]}
                    {v.diasInventario !== null && v.estado !== "agotado" ? ` · ${v.diasInventario} d` : ""}
                  </Pastilla>
                  {(v.estado === "agotado" || v.estado === "se_acaba" || v.estado === "reponer") && <span className="text-muted-foreground">En camino: {textoCamino(v.camino)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">Para recomendarle</p>
        {extra.recomendados.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Nada con stock que vendan otros y él no.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {extra.recomendados.map((r) => (
              <li key={r.productoId}>
                <span className="font-medium">{r.nombre}</span>
                {r.stock !== null && <span className="text-xs text-muted-foreground"> · {r.stock.toLocaleString("es")} u. en stock</span>}
                <span className="block text-xs text-muted-foreground">{r.razon}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DetalleSalud({
  f,
  personas,
  escribe,
  extra,
}: {
  f: FilaDireccion;
  personas: { id: string; nombre: string }[];
  escribe: boolean;
  extra: DatosProductos["porCliente"][string] | undefined;
}) {
  const enlace = (
    <Link href={`/crm-dropshippers?abrir=${f.id}`} className={`text-sm font-medium text-primario hover:underline ${anilloFoco}`}>
      Abrir su ficha
    </Link>
  );
  if (f.salud.puntaje === null)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Todavía no tiene pedidos en Dropi en este país: no hay salud que medir.</span>
        <div className="flex flex-wrap items-center gap-4">
          <LoLleva f={f} personas={personas} escribe={escribe} />
          {enlace}
        </div>
        <div className="w-full">
          <VendeYRecomendados extra={extra} />
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm">
          Salud <span className="font-semibold tabular-nums">{f.salud.puntaje}</span> · <Pastilla tono={TONO_BANDA[f.salud.banda]}>{ETIQUETA_BANDA[f.salud.banda]}</Pastilla>
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <LoLleva f={f} personas={personas} escribe={escribe} />
          {enlace}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {f.salud.factores.map((x) => (
          <div key={x.clave} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium">
                {x.etiqueta} <span className="font-normal text-muted-foreground">({x.peso} %)</span>
              </span>
              <span className="font-semibold tabular-nums">{x.valor ?? "—"}</span>
            </div>
            <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
              {x.valor !== null && <span className={`block h-full ${x.valor >= 70 ? "bg-success" : x.valor >= 40 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${x.valor}%` }} />}
            </span>
            <span className="text-xs text-muted-foreground">{x.detalle}</span>
          </div>
        ))}
      </div>
      <VendeYRecomendados extra={extra} />
    </div>
  );
}

/** «Crear tarea» desde una alerta: para quién y para cuándo; el título y el detalle salen de la alerta. */
function FormTarea({
  alerta,
  personas,
  hoy,
  usuarioId,
  alCerrar,
  alCrear,
}: {
  alerta: AlertaDireccion;
  personas: { id: string; nombre: string }[];
  hoy: string;
  usuarioId: string;
  alCerrar: () => void;
  alCrear: (nombre: string) => void;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const inicial = personas.find((p) => p.nombre === alerta.responsable)?.id ?? personas.find((p) => p.id === usuarioId)?.id ?? personas[0]?.id ?? "";
  const [para, setPara] = useState(inicial);
  const [vence, setVence] = useState(hoy);

  function crear() {
    if (!para) return mostrarToast("Elige para quién es la tarea.", "destructive");
    empezar(async () => {
      const r = await crearTareaDeAlerta({ dropshipperId: alerta.dropshipperId, tipo: alerta.tipo, responsableId: para, vence, texto: alerta.texto });
      if ("error" in r) return mostrarToast(r.error, "destructive");
      alCrear(personas.find((p) => p.id === para)?.nombre ?? "esa persona");
    });
  }

  return (
    <Ventana abierto alCerrar={alCerrar} titulo={`Tarea: ${alerta.nombre}`} ancho="sm">
      <div className="flex flex-col gap-4 p-1">
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <p className="m-0 font-medium">{ETIQUETA_ALERTA[alerta.tipo]}</p>
          <p className="m-0 mt-1">{alerta.texto}</p>
          <p className="m-0 mt-1 text-xs text-muted-foreground">{SUGERENCIA_ALERTA[alerta.tipo]}</p>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Para quién</span>
          <select data-enfocar value={para} onChange={(e) => setPara(e.target.value)} className={fieldClass}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.id === usuarioId ? " (yo)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Para cuándo</span>
          <input type="date" value={vence} min={hoy} onChange={(e) => setVence(e.target.value)} className={fieldClass} />
        </label>
        <p className="m-0 text-xs text-muted-foreground">Le llega el aviso en la campana y la ve en Tareas. Si el dropshipper tiene chat, la tarea queda en su chat.</p>
        <div className="flex justify-end gap-2">
          <BotonBarra onClick={alCerrar}>Cancelar</BotonBarra>
          <BotonBarra principal onClick={crear} disabled={pendiente || !vence}>
            {pendiente ? "Creando…" : "Crear tarea"}
          </BotonBarra>
        </div>
      </div>
    </Ventana>
  );
}
