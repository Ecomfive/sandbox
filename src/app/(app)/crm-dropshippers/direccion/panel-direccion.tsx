"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { TASA_BUENA, TASA_REGULAR } from "@/lib/crm/automatizar";
import { ETIQUETA_ESTADO_STOCK, type EstadoStock } from "@/lib/crm/productos";
import { ETIQUETA_ALERTA, ETIQUETA_BANDA, ETIQUETA_SEGMENTO, nPedidos, SUGERENCIA_ALERTA, type Banda, type Prioridad, type Segmento, type TipoAlerta } from "@/lib/crm/salud";
import { asignarResponsable, atenderAlerta, crearTareaDeAlerta } from "./actions";
import type { AlertaDireccion, DatosDireccion, FilaDireccion } from "./datos-direccion";
import type { DatosProductos } from "./datos-productos";
import { descargarLista } from "./lista-csv";
import { rutaVista } from "./ruta";
import { Barra, Boton, Chip, Cifra, Cifras, FONDO_TONO, Insignia, TEXTO_TONO, Tarjeta, tonoPuntaje, type TonoDireccion } from "./piezas-direccion";
import { textoCamino } from "./vista-productos";

const TONO_BANDA: Record<Banda, TonoDireccion> = { sano: "exito", atencion: "aviso", critico: "peligro", sin_pedidos: "neutro" };
const TONO_SEGMENTO: Record<Segmento, TonoDireccion> = { activo: "exito", riesgo: "aviso", dormido: "peligro", perdido: "peligro", sin_pedidos: "neutro" };
const PRIORIDAD: Record<Prioridad, [string, TonoDireccion]> = { alta: ["Urgente", "peligro"], media: ["Hoy", "aviso"], baja: ["Cuando puedas", "neutro"] };
const TONO_ALERTA: Record<TipoAlerta, TonoDireccion> = { caida: "peligro", dormido: "aviso", devoluciones: "aviso", sin_primer_pedido: "info" };
const TONO_STOCK: Record<EstadoStock, TonoDireccion> = { agotado: "peligro", se_acaba: "peligro", reponer: "aviso", ok: "exito", sin_dato: "neutro" };
const BORDE_TONO: Record<TonoDireccion, string> = { exito: "border-success", aviso: "border-warning", peligro: "border-destructive", info: "border-primario", neutro: "border-border" };

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

const SEGMENTOS: { valor: Segmento | "todos"; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "activo", etiqueta: "Activos" },
  { valor: "riesgo", etiqueta: "En riesgo" },
  { valor: "dormido", etiqueta: "Dormidos" },
  { valor: "sin_pedidos", etiqueta: "Sin pedidos" },
  { valor: "perdido", etiqueta: "Perdidos" },
];

type Orden = "salud" | "pedidos" | "caida";
const POR_PAGINA = 60;
const BANDAS: Banda[] = ["sano", "atencion", "critico", "sin_pedidos"];
const RANGO_BANDA: Record<Banda, string> = { sano: "70 o más", atencion: "40 a 69", critico: "menos de 40", sin_pedidos: "" };

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
/** El color de la entrega de un cliente, con los mismos cortes que la vista Entregas: verde desde 80 %, ámbar desde 65 %, rojo abajo. */
const tonoEntregaFila = (pct: number): TonoDireccion => (pct >= TASA_BUENA * 100 ? "exito" : pct >= TASA_REGULAR * 100 ? "aviso" : "peligro");
const textoCambio = (c: number | null) => (c === null ? "—" : `${c >= 0 ? "+" : "−"}${Math.abs(Math.round(c))} %`);

function TipoCliente({ nivel }: { nivel: string }) {
  if (nivel === "black") return <span className="inline-flex rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">BLACK</span>;
  if (nivel === "vip") return <Insignia tono="aviso">VIP</Insignia>;
  return null;
}

/**
 * El panel de Dirección con el diseño del prototipo, en sus dos pestañas (`modo`, separadas como en el prototipo desde el 30 oct 2026):
 *  - **Resumen**: las cifras de la cartera, la cola «Qué atender hoy», la salud de la cartera y los pedidos por semana. Una cifra lleva a
 *    Clientes con ese estado y «Ver cliente» abre su ficha allá (antes filtraban una lista que quedaba muy abajo y parecía que no hacían nada).
 *  - **Clientes**: los chips de estado, el buscador y la lista con la ficha al lado (salud, por qué, siguiente paso, quién lo lleva, lo que
 *    vende y qué recomendarle).
 */
export function PanelDireccion({
  modo,
  segmentoInicial,
  clienteInicial,
  datos,
  productos,
  codigoPais,
  escribe,
  usuarioId,
}: {
  modo: "resumen" | "clientes";
  /** El estado con que abre la lista (el de la cifra que se tocó en el Resumen). */
  segmentoInicial: Segmento | null;
  /** El cliente cuya ficha abre (el de «Ver cliente» en el Resumen). */
  clienteInicial: string | null;
  datos: DatosDireccion;
  /** Lo que vende cada cliente y qué recomendarle (fase 3); null sin las migraciones 0198 y 0201. */
  productos: DatosProductos | null;
  codigoPais: string;
  escribe: boolean;
  usuarioId: string;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [filtroAlerta, setFiltroAlerta] = useState<FiltroAlerta>("todas");
  const [segmento, setSegmento] = useState<Segmento | "todos">(segmentoInicial ?? "todos");
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | "vip" | "regular">("todos");
  const [orden, setOrden] = useState<Orden>("salud");
  // La ficha de al lado empieza con el cliente de la primera alerta (como en el prototipo).
  const [sel, setSel] = useState<string | null>(clienteInicial ?? datos.alertas[0]?.dropshipperId ?? null);
  const [mostrar, setMostrar] = useState(POR_PAGINA);
  const [tareaDe, setTareaDe] = useState<AlertaDireccion | null>(null);

  const { filas, hoy } = datos;
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const alertas = datos.alertas.filter((a) => !quitadas.has(a.clave));
  const visiblesAlerta = alertas.filter((a) => pasaFiltro(a, filtroAlerta));

  const cuenta = (s: Segmento) => filas.filter((f) => f.segmento === s).length;
  const pedidos30 = filas.reduce((s, f) => s + f.pedidos30, 0);
  const pedidos30Antes = filas.reduce((s, f) => s + f.pedidos30Antes, 0);
  const cambioTotal = pedidos30Antes ? (pedidos30 / pedidos30Antes - 1) * 100 : null;
  const vip = filas.filter((f) => f.nivel === "vip" || f.nivel === "black").length;
  const bandas = BANDAS.map((b) => ({ banda: b, n: filas.filter((f) => f.salud.banda === b).length }));

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

  const maxSemana = Math.max(1, ...datos.semanas.map((s) => s.pedidos));
  const ultimas = datos.semanas.slice(-4);
  const bajaSemanas = ultimas.length >= 2 && ultimas[0].pedidos ? (ultimas[ultimas.length - 2].pedidos / ultimas[0].pedidos - 1) * 100 : null;

  const elegirSegmento = (s: Segmento | "todos") => {
    // En el Resumen no hay lista: la cifra lleva a Clientes con ese estado.
    if (modo === "resumen") return router.push(s === "todos" ? rutaVista("clientes") : rutaVista("clientes", { segmento: s }));
    setSegmento((x) => (x === s && s !== "todos" ? "todos" : s));
    setMostrar(POR_PAGINA);
  };
  function verCliente(id: string) {
    // Desde el Resumen, la ficha está en Clientes.
    if (modo === "resumen") return router.push(rutaVista("clientes", { cliente: id }));
    setSel(id);
    setTimeout(() => document.getElementById("ficha-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function atender(a: AlertaDireccion) {
    empezar(async () => {
      const r = await atenderAlerta(a.dropshipperId, a.tipo);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setQuitadas((s) => new Set(s).add(a.clave));
      mostrarToast(`Atendida: ${a.nombre} no vuelve a salir en 7 días si sigue igual.`);
    });
  }
  function descargar() {
    const nombre = [segmento === "todos" ? "todos" : ETIQUETA_SEGMENTO[segmento], tipo === "vip" ? "VIP o BLACK" : tipo === "regular" ? "regulares" : "", busca.trim() ? `«${busca.trim()}»` : ""].filter(Boolean).join(" · ");
    empezar(async () => {
      const r = await descargarLista(lista, nombre, `dropshippers-${segmento}`);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`Lista de ${lista.length} dropshippers descargada${r.conTelefono ? " con su WhatsApp" : ""}.`);
    });
  }

  const seleccionado = sel ? porId.get(sel) : undefined;

  return (
    <>
      {modo === "resumen" && (
      <>
      <Cifras>
        <Cifra
          titulo="Cartera con Dropi"
          valor={filas.length}
          nota={datos.sinCuenta ? `${datos.sinCuenta} sin cuenta vinculada` : `Con cuenta en ${codigoPais}`}
          tono={datos.sinCuenta ? "aviso" : "neutro"}
          alPulsar={() => elegirSegmento("todos")}
        />
        <Cifra titulo="Activos" valor={cuenta("activo")} nota="Piden con normalidad" tono="exito" alPulsar={() => elegirSegmento("activo")} />
        <Cifra titulo="En riesgo" valor={cuenta("riesgo")} nota="Bajaron o dejaron de pedir" tono="aviso" alPulsar={() => elegirSegmento("riesgo")} />
        <Cifra titulo="Dormidos" valor={cuenta("dormido")} nota="21 a 59 días sin pedir" tono="peligro" alPulsar={() => elegirSegmento("dormido")} />
        <Cifra titulo="Sin pedidos" valor={cuenta("sin_pedidos")} nota="Con cuenta, sin pedidos" tono="neutro" alPulsar={() => elegirSegmento("sin_pedidos")} />
        <Cifra
          titulo="Pedidos en 30 días"
          valor={pedidos30.toLocaleString("es")}
          nota={`${textoCambio(cambioTotal)} frente a los 30 anteriores · ${vip} VIP o BLACK`}
          tono={cambioTotal === null ? "neutro" : cambioTotal >= 0 ? "exito" : "peligro"}
        />
      </Cifras>

      <div className="flex flex-wrap items-start gap-5">
        <Tarjeta
          id="t-atender"
          titulo="Qué atender hoy"
          extra={`${alertas.length} pendientes${datos.atendidas ? ` · ${datos.atendidas} atendidas esta semana` : ""}`}
          className="flex-[999_1_560px]"
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar alertas">
            {FILTROS_ALERTA.map((f) => (
              <Chip key={f.valor} activo={filtroAlerta === f.valor} onClick={() => setFiltroAlerta(f.valor)}>
                {f.etiqueta} · {alertas.filter((a) => pasaFiltro(a, f.valor)).length}
              </Chip>
            ))}
          </div>
          {visiblesAlerta.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-muted-foreground">Nada pendiente en este filtro.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {visiblesAlerta.map((a) => (
                <li key={a.clave} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3.5">
                  <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Insignia tono={TONO_ALERTA[a.tipo]}>{ETIQUETA_ALERTA[a.tipo]}</Insignia>
                      <Insignia tono={PRIORIDAD[a.prioridad][1]}>{PRIORIDAD[a.prioridad][0]}</Insignia>
                    </div>
                    <p className="m-0 text-[15px] leading-snug">
                      <span className="font-semibold">{a.nombre}</span> <span className="text-xs text-muted-foreground">{a.codigo}</span> — {a.texto}
                    </p>
                    <p className="m-0 text-[13px] text-muted-foreground">
                      {a.responsable ? `Lo lleva ${a.responsable}` : "Sin responsable"} · {SUGERENCIA_ALERTA[a.tipo]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Boton onClick={() => verCliente(a.dropshipperId)}>Ver cliente</Boton>
                    {escribe && (
                      <>
                        <Boton onClick={() => setTareaDe(a)} disabled={pendiente}>
                          Crear tarea
                        </Boton>
                        <Boton principal onClick={() => atender(a)} disabled={pendiente} title="No vuelve a salir en 7 días si sigue igual">
                          Atendida
                        </Boton>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <Tarjeta id="t-salud" titulo="Salud de la cartera">
            <div role="img" aria-label={bandas.map((b) => `${ETIQUETA_BANDA[b.banda]} ${b.n}`).join(", ")} className="flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-muted">
              {bandas
                .filter((b) => b.n)
                .map((b) => (
                  <span key={b.banda} className={FONDO_TONO[TONO_BANDA[b.banda]]} style={{ flex: `${b.n} 1 0` }} />
                ))}
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {bandas.map((b) => (
                <li key={b.banda} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${FONDO_TONO[TONO_BANDA[b.banda]]}`} />
                    {ETIQUETA_BANDA[b.banda]}
                    {RANGO_BANDA[b.banda] && <span className="text-xs text-muted-foreground">{RANGO_BANDA[b.banda]}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {b.n} <span className="font-normal text-muted-foreground">({filas.length ? Math.round((b.n / filas.length) * 100) : 0} %)</span>
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>

          <Tarjeta id="t-semanas" titulo="Pedidos de la cartera por semana">
            {datos.semanas.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Sin pedidos en las últimas 8 semanas.</p>
            ) : (
              <>
                <div
                  role="img"
                  aria-label={`Pedidos por semana: ${datos.semanas.map((s) => `${fechaCorta(s.semana)} ${s.pedidos}`).join(", ")}`}
                  className="flex h-32 items-end gap-2 border-b border-border"
                >
                  {datos.semanas.map((s, i) => (
                    <div key={s.semana} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[11px] text-muted-foreground tabular-nums">{s.pedidos.toLocaleString("es")}</span>
                      <span
                        className={`w-full max-w-9 rounded-t ${i === datos.semanas.length - 1 ? "bg-primario/40" : i >= datos.semanas.length - 3 && bajaSemanas !== null && bajaSemanas < 0 ? "bg-warning" : "bg-primario"}`}
                        style={{ height: `${Math.max(2, Math.round((s.pedidos / maxSemana) * 96))}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{datos.semanas.length === 1 ? fechaCorta(datos.semanas[0].semana) : `Hace ${datos.semanas.length - 1} semanas`}</span>
                  <span>Esta semana (en curso)</span>
                </div>
                {bajaSemanas !== null && (
                  <p className={`m-0 text-sm font-semibold ${bajaSemanas < 0 ? "text-warning" : "text-success"}`}>
                    {bajaSemanas < 0 ? `Bajó ${Math.abs(Math.round(bajaSemanas))} % en las últimas semanas: revisar «En riesgo».` : `Subió ${Math.round(bajaSemanas)} % en las últimas semanas.`}
                  </p>
                )}
              </>
            )}
          </Tarjeta>
        </div>
      </div>
      </>
      )}

      {modo === "clientes" && (
      <section aria-labelledby="t-clientes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2.5">
            <h2 id="t-clientes" className="m-0 text-lg font-semibold">
              Clientes
            </h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
              {SEGMENTOS.map((s) => (
                <Chip key={s.valor} activo={segmento === s.valor} onClick={() => elegirSegmento(s.valor)}>
                  {s.etiqueta} · {s.valor === "todos" ? filas.length : cuenta(s.valor)}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1 sm:flex-none">
              <span className={labelClassSm}>Buscar cliente</span>
              <input type="search" value={busca} onChange={(e) => (setBusca(e.target.value), setMostrar(POR_PAGINA))} placeholder="Nombre, código o responsable" className={`${fieldClass} w-full sm:w-60`} />
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
              <Boton onClick={descargar} disabled={pendiente || lista.length === 0} title="Un CSV con los que se ven en la lista, para una difusión. No envía nada.">
                Descargar lista ({lista.length})
              </Boton>
            )}
          </div>
        </div>

        {/* La ficha del cliente, más ancha que la lista (30 oct 2026, pedido de Hernán): en pantalla grande toma el 42 % (mínimo 460 px) y se
            queda a la vista al bajar por la lista. */}
        <div className={`grid grid-cols-1 items-start gap-5 ${seleccionado ? "xl:grid-cols-[minmax(0,1fr)_minmax(460px,42%)]" : ""}`}>
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted text-left text-xs tracking-[0.04em] text-muted-foreground uppercase">
                    {["Cliente", "Estado", "Salud", "Pedidos 30 d", "Tendencia", "Último pedido", "Entrega", "Lo lleva"].map((t, i) => (
                      <th key={t} scope="col" className={`px-3 py-3 font-semibold ${i === 0 ? "pl-4" : ""} ${i === 3 || i === 4 || i === 6 ? "text-right" : ""}`}>
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        Ningún cliente coincide.
                      </td>
                    </tr>
                  ) : (
                    lista.slice(0, mostrar).map((f) => {
                      const c = cambio(f);
                      const activo = sel === f.id;
                      const tono = tonoPuntaje(f.salud.puntaje);
                      return (
                        <tr key={f.id} className={`border-t border-border ${activo ? "bg-accent" : "hover:bg-muted/60"}`}>
                          <td className="py-1.5 pr-3 pl-4">
                            <button type="button" aria-pressed={activo} onClick={() => verCliente(f.id)} className={`flex min-h-11 flex-col items-start justify-center rounded text-left ${anilloFoco}`}>
                              <span className="flex items-center gap-1.5 font-semibold">
                                {f.nombre} <TipoCliente nivel={f.nivel} />
                              </span>
                              <span className="text-xs text-muted-foreground">{f.codigo}</span>
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <Insignia tono={TONO_SEGMENTO[f.segmento]}>{ETIQUETA_SEGMENTO[f.segmento]}</Insignia>
                          </td>
                          <td className="px-3 py-1.5">
                            {f.salud.puntaje === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <span className={`w-7 font-bold tabular-nums ${TEXTO_TONO[tono]}`}>{f.salud.puntaje}</span>
                                <span className="w-16">
                                  <Barra valor={f.salud.puntaje} tono={tono} />
                                </span>
                                <span className="sr-only">{ETIQUETA_BANDA[f.salud.banda]}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{f.pedidos30.toLocaleString("es")}</td>
                          <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${c === null ? "text-muted-foreground" : c >= 0 ? "text-success" : "text-destructive"}`}>{textoCambio(c)}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{diasDesde(f.ultimoPedido, hoy)}</td>
                          <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${f.entrega === null ? "text-muted-foreground" : TEXTO_TONO[tonoEntregaFila(f.entrega)]}`} title={f.entrega === null ? "Menos de 5 pedidos cerrados en 60 días" : "Entregados de los pedidos cerrados en 60 días"}>
                            {f.entrega === null ? "—" : `${f.entrega} %`}
                          </td>
                          <td className="px-3 py-1.5">{f.responsable ?? <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {lista.length > mostrar && (
              <div className="flex justify-center border-t border-border p-3">
                <Boton onClick={() => setMostrar((m) => m + POR_PAGINA)}>
                  Ver {Math.min(POR_PAGINA, lista.length - mostrar)} más de {lista.length - mostrar}
                </Boton>
              </div>
            )}
          </div>

          {seleccionado && (
            <FichaCliente
              f={seleccionado}
              alertas={alertas.filter((a) => a.dropshipperId === seleccionado.id)}
              extra={productos?.porCliente[seleccionado.id]}
              personas={datos.personas}
              escribe={escribe}
              pendiente={pendiente}
              alCerrar={() => setSel(null)}
              alTarea={setTareaDe}
              alAtender={atender}
            />
          )}
        </div>
      </section>
      )}

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

const PASO_SIN_ALERTA: Record<Segmento, string> = {
  activo: "Pide con normalidad: recomiéndale un producto que venden clientes parecidos (abajo).",
  riesgo: "Llamarle: preguntar qué cambió y revisar si se le agotó algo que vendía.",
  dormido: "Escribirle para reactivarlo y ofrecerle un producto ganador con stock.",
  perdido: "Hace más de 60 días que no pide: intentar recuperarlo con un producto nuevo.",
  sin_pedidos: "Acompañarle a publicar su primer producto.",
};

/** La ficha del cliente al lado de la lista: salud con su anillo, de qué sale, por qué, el siguiente paso, quién lo lleva, lo que vende y qué recomendarle. */
function FichaCliente({
  f,
  alertas,
  extra,
  personas,
  escribe,
  pendiente,
  alCerrar,
  alTarea,
  alAtender,
}: {
  f: FilaDireccion;
  alertas: AlertaDireccion[];
  extra: DatosProductos["porCliente"][string] | undefined;
  personas: { id: string; nombre: string }[];
  escribe: boolean;
  pendiente: boolean;
  alCerrar: () => void;
  alTarea: (a: AlertaDireccion) => void;
  alAtender: (a: AlertaDireccion) => void;
}) {
  const tono = tonoPuntaje(f.salud.puntaje);
  return (
    <aside id="ficha-cliente" aria-label={`Ficha de ${f.nombre}`} className="flex min-w-0 scroll-mt-4 flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-bold">{f.nombre}</h2>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            {f.codigo} <TipoCliente nivel={f.nivel} /> · {f.responsable ? `lo lleva ${f.responsable}` : "nadie lo lleva"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Insignia tono={TONO_SEGMENTO[f.segmento]}>{ETIQUETA_SEGMENTO[f.segmento]}</Insignia>
          <button type="button" onClick={alCerrar} aria-label="Cerrar la ficha" className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted ${anilloFoco}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[6px] ${BORDE_TONO[tono]}`}>
          <span className={`text-2xl font-bold tabular-nums ${TEXTO_TONO[tono]}`}>{f.salud.puntaje ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-muted-foreground">Salud del cliente</span>
          <span className={`text-base font-bold ${TEXTO_TONO[tono]}`}>{f.salud.puntaje === null ? "Sin pedidos en este país" : ETIQUETA_BANDA[f.salud.banda]}</span>
          <span className="text-xs text-muted-foreground">
            {nPedidos(f.pedidos30)} en 30 días · {textoCambio(cambio(f))}
          </span>
          {f.salud.tope && <span className="text-xs font-semibold text-warning">{f.salud.tope}</span>}
        </div>
      </div>

      {f.salud.factores.length > 0 && (
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {f.salud.factores.map((x) => (
            <div key={x.clave} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-[13px]">
                <span>
                  {x.etiqueta} <span className="text-muted-foreground">({x.peso} %)</span>
                </span>
                <span className="font-semibold tabular-nums">{x.valor ?? "—"}</span>
              </div>
              {x.valor !== null ? <Barra valor={x.valor} tono={tonoPuntaje(x.valor)} /> : <Barra valor={0} tono="neutro" />}
              <span className="text-xs text-muted-foreground">{x.detalle}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">Por qué</h3>
        {alertas.length ? (
          alertas.map((a) => (
            <p key={a.clave} className="m-0 text-sm leading-relaxed">
              {a.texto}
            </p>
          ))
        ) : (
          <p className="m-0 text-sm leading-relaxed text-muted-foreground">Sin alertas abiertas.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">Siguiente paso sugerido</h3>
        {alertas.length ? (
          alertas.map((a) => (
            <div key={a.clave} className="flex flex-col gap-2 rounded-lg border border-primario/25 bg-accent px-3.5 py-2.5">
              <span className="text-sm font-semibold text-primario">{SUGERENCIA_ALERTA[a.tipo]}</span>
              {escribe && (
                <span className="flex flex-wrap gap-2">
                  <Boton onClick={() => alTarea(a)} disabled={pendiente}>
                    Crear tarea
                  </Boton>
                  <Boton onClick={() => alAtender(a)} disabled={pendiente}>
                    Atendida
                  </Boton>
                </span>
              )}
            </div>
          ))
        ) : (
          <p className="m-0 rounded-lg border border-primario/25 bg-accent px-3.5 py-2.5 text-sm font-semibold text-primario">{PASO_SIN_ALERTA[f.segmento]}</p>
        )}
      </div>

      <LoLleva f={f} personas={personas} escribe={escribe} />

      {extra && (
        <div className="grid grid-cols-1 items-start gap-5 2xl:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-semibold">Lo que vende (30 días)</h3>
            {extra.vende.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Sin pedidos en 30 días.</p>
            ) : (
              extra.vende.map((v) => (
                <div key={v.productoId} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-sm font-semibold">{v.nombre}</span>
                    <Insignia tono={TONO_STOCK[v.estado]}>
                      {ETIQUETA_ESTADO_STOCK[v.estado]}
                      {v.diasInventario !== null && v.estado !== "agotado" ? ` · ${v.diasInventario} d` : ""}
                    </Insignia>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {nPedidos(v.pedidos)} ({Math.round(v.parte * 100)} % de lo que vende)
                    {(v.estado === "agotado" || v.estado === "se_acaba" || v.estado === "reponer") && ` · en camino: ${textoCamino(v.camino)}`}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="m-0 text-sm font-semibold">Para recomendarle</h3>
            {extra.recomendados.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Nada con stock que vendan otros y él no.</p>
            ) : (
              extra.recomendados.map((r) => (
                <div key={r.productoId} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{r.nombre}</div>
                    <div className="text-xs text-muted-foreground">{r.razon}</div>
                  </div>
                  {r.stock !== null && <span className="shrink-0 text-[13px] font-semibold whitespace-nowrap text-success">{r.stock.toLocaleString("es")} u.</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <Link href={`/crm-dropshippers?abrir=${f.id}`} className={`text-sm font-semibold text-primario hover:underline ${anilloFoco}`}>
        Abrir su ficha completa en el CRM
      </Link>
    </aside>
  );
}

/** «Lo lleva»: quién del equipo lleva a este dropshipper (de ahí sale su cartera en la vista Equipo). Solo Dirección con escritura lo cambia. */
function LoLleva({ f, personas, escribe }: { f: FilaDireccion; personas: { id: string; nombre: string }[]; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  if (!escribe) return <p className="m-0 text-sm text-muted-foreground">Lo lleva: {f.responsable ?? "nadie"}</p>;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold">Lo lleva</span>
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
        className={fieldClass}
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
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton principal onClick={crear} disabled={pendiente || !vence}>
            {pendiente ? "Creando…" : "Crear tarea"}
          </Boton>
        </div>
      </div>
    </Ventana>
  );
}
