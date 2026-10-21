"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Foto, Pestanas, Producto, TONO, Tarjeta, Vacio, VIA, botonNormal, botonPeligro, botonPrincipal, dinero, ent, fecha } from "@/components/proveedor/piezas-proveedor";
import { Indicador, Punto, claseTdLista, claseThLista } from "@/components/panel/piezas-panel";
import { Badge, type Tone } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambioDeUnidades } from "@/lib/proveedor/cotizacion";
import type { TonoCuota } from "@/lib/proveedor/cuotas";
import { clavePlazo, type PedidoPortal } from "@/lib/proveedor/datos";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { estadoTransito, textoPlazo, type Plazo } from "@/lib/proveedor/transito";
import { decidirPedido, guardarNotaProveedor, marcarLlegada, marcarNovedadesLeidas } from "./actions";
import { CuentaProveedor, type CuentaPortal } from "./cuenta-proveedor";

export interface Novedad {
  id: string;
  pedidoId: string | null;
  tipo: string;
  texto: string;
  detalle: string | null;
  leida: boolean;
  creadoEn: string;
}

export interface ResumenPais {
  clave: string;
  pais: string;
  nombre: string;
  via: "mar" | "aire";
  plazo: Plazo | null;
  real: { envios: number; mediana: number; min: number; max: number } | null;
}

type Tab = "novedades" | "decidir" | "cotizacion" | "transito" | "cuenta";

/**
 * Operación › Portal del proveedor: el lado de Ecomfive del portal de Chin (fase 2 de PORTAL-PROVEEDOR.md, la interfaz del
 * prototipo aprobado). Novedades (lo que cambió Chin), Por decidir (cotizaciones con la foto de referencia y la real), En cotización
 * y Tránsito contra el plazo prometido. Pagos llega en la fase 4.
 */
export function PortalProveedor({
  proveedor,
  pedidos,
  plazos,
  resumen,
  novedades,
  fotosReales,
  puedeEscribir,
  tabInicial,
  cuentaPortal,
}: {
  proveedor: { id: string; nombre: string };
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  resumen: ResumenPais[];
  novedades: Novedad[];
  fotosReales: Record<string, string>;
  puedeEscribir: boolean;
  tabInicial: Tab | null;
  /** Solo para un administrador: la cuenta con la que el proveedor entra a su portal. */
  cuentaPortal: { cuenta: CuentaPortal | null; entrada: string } | null;
}) {
  const [lista, setLista] = useState(pedidos);
  const [novs, setNovs] = useState(novedades);
  const hoy = useMemo(() => hoyPanama(), []);
  const sinLeer = novs.filter((n) => !n.leida).length;
  const [tab, setTab] = useState<Tab>(tabInicial ?? (sinLeer ? "novedades" : "decidir"));

  // La pestaña queda en la dirección para volver a ella o compartirla.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);

  const de = (e: PedidoPortal["etapa"]) => lista.filter((p) => p.etapa === e);
  const cambiar = (id: string, cambios: Partial<PedidoPortal>) => setLista((xs) => xs.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  const nombre = proveedor.nombre;

  const tabs: { clave: Tab; titulo: string; cuenta: number; viva?: boolean }[] = [
    { clave: "novedades", titulo: "Novedades del proveedor", cuenta: sinLeer, viva: true },
    { clave: "decidir", titulo: "Por decidir", cuenta: de("cotizado").length },
    { clave: "cotizacion", titulo: "En cotización", cuenta: de("por_cotizar").length },
    { clave: "transito", titulo: "Tránsito", cuenta: de("enviado").length },
    ...(cuentaPortal ? [{ clave: "cuenta" as const, titulo: `Cuenta de ${proveedor.nombre}`, cuenta: 0 }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Pestanas etiqueta={`Portal de ${nombre}`} tabs={tabs} valor={tab} alCambiar={setTab} />

      {tab === "novedades" && (
        <Novedades
          novedades={novs}
          nombre={nombre}
          puedeEscribir={puedeEscribir}
          alLeer={async () => {
            const r = await marcarNovedadesLeidas(proveedor.id);
            if (!r.error) setNovs((xs) => xs.map((n) => ({ ...n, leida: true })));
            return r;
          }}
        />
      )}
      {tab === "decidir" && <PorDecidir pedidos={de("cotizado")} fotosReales={fotosReales} nombre={nombre} puedeEscribir={puedeEscribir} alDecidir={(id, etapa) => cambiar(id, { etapa })} />}
      {tab === "cotizacion" && (
        <EnCotizacion
          pedidos={de("por_cotizar")}
          porDecidir={de("cotizado").length}
          enProduccion={de("produccion").length}
          nombre={nombre}
          puedeEscribir={puedeEscribir}
          alGuardarNota={(id, nota) => cambiar(id, { notaParaProveedor: nota || null })}
        />
      )}
      {tab === "cuenta" && cuentaPortal && <CuentaProveedor proveedor={proveedor} cuenta={cuentaPortal.cuenta} entrada={cuentaPortal.entrada} />}
      {tab === "transito" && (
        <Transito pedidos={de("enviado")} plazos={plazos} resumen={resumen} hoy={hoy} nombre={nombre} puedeEscribir={puedeEscribir} alLlegar={(id, f) => cambiar(id, { etapa: "llegado", fechaLlegada: f })} />
      )}
    </div>
  );
}

// ── Novedades ──
const ICONO_NOVEDAD: Record<string, { simbolo: string; tono: Tone }> = {
  cotizacion: { simbolo: "$", tono: "info" },
  foto: { simbolo: "▣", tono: "azul" },
  envio: { simbolo: "→", tono: "success" },
  pago: { simbolo: "✓", tono: "success" },
  llegada: { simbolo: "↓", tono: "warning" },
};

function Novedades({ novedades, nombre, puedeEscribir, alLeer }: { novedades: Novedad[]; nombre: string; puedeEscribir: boolean; alLeer: () => Promise<{ error?: string }> }) {
  const { mostrarToast } = useToast();
  const [leyendo, setLeyendo] = useState(false);
  const sinLeer = novedades.some((n) => !n.leida);
  return (
    <Tarjeta
      titulo={`Lo que cambió ${nombre}`}
      accion={
        puedeEscribir && sinLeer ? (
          <button
            type="button"
            disabled={leyendo}
            className={botonNormal}
            onClick={async () => {
              setLeyendo(true);
              const r = await alLeer();
              setLeyendo(false);
              if (r.error) mostrarToast(r.error, "destructive");
            }}
          >
            Marcar todo como leído
          </button>
        ) : undefined
      }
    >
      {novedades.length === 0 ? (
        <Vacio>Todavía no hay cambios de {nombre}. Cuando cotice, suba la foto real, marque un envío o confirme un pago, aparece aquí.</Vacio>
      ) : (
        <ul className="m-0 list-none p-0">
          {novedades.map((n) => {
            const icono = ICONO_NOVEDAD[n.tipo] ?? { simbolo: "•", tono: "neutral" as Tone };
            return (
              <li key={n.id} className={`grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0 ${n.leida ? "" : "bg-primario-suave/60"}`}>
                <span aria-hidden="true" className="pt-0.5">
                  <Badge tone={icono.tono}>{icono.simbolo}</Badge>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">
                    {!n.leida && <span className="sr-only">Sin leer: </span>}
                    {n.texto}
                  </span>
                  {n.detalle && <span className="block text-xs text-muted-foreground">{n.detalle}</span>}
                </span>
                <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {fecha(n.creadoEn.slice(0, 10))} · {new Date(n.creadoEn).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}

// ── Por decidir ──
function PorDecidir({
  pedidos,
  fotosReales,
  nombre,
  puedeEscribir,
  alDecidir,
}: {
  pedidos: PedidoPortal[];
  fotosReales: Record<string, string>;
  nombre: string;
  puedeEscribir: boolean;
  alDecidir: (id: string, etapa: "produccion" | "descartado") => void;
}) {
  return (
    <Tarjeta titulo={`Cotizado · esperan tu decisión`}>
      {pedidos.length === 0 ? (
        <Vacio>No hay cotizaciones esperando tu decisión.</Vacio>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-3 p-3">
          {pedidos.map((p) => (
            <TarjetaCotizacion key={p.id} p={p} fotoReal={fotosReales[p.id] ?? null} nombre={nombre} puedeEscribir={puedeEscribir} alDecidir={alDecidir} />
          ))}
        </div>
      )}
    </Tarjeta>
  );
}

function TarjetaCotizacion({ p, fotoReal, nombre, puedeEscribir, alDecidir }: { p: PedidoPortal; fotoReal: string | null; nombre: string; puedeEscribir: boolean; alDecidir: (id: string, etapa: "produccion" | "descartado") => void }) {
  const { mostrarToast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const cambio = cambioDeUnidades(p.unidadesPedidas, p.unidades);

  async function decidir(etapa: "produccion" | "descartado") {
    setOcupado(true);
    const r = await decidirPedido(p.id, etapa);
    setOcupado(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    alDecidir(p.id, etapa);
    mostrarToast(etapa === "produccion" ? `${p.producto} pasó a Producción. ${nombre} lo ve en «En producción».` : `${p.producto} se descartó.`);
  }

  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-[10px] border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{p.producto}</h3>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{p.paisCodigo ?? "—"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Foto url={p.fotoReferencia} nombre={p.producto} grande />
        <Foto url={fotoReal} nombre={p.producto} real grande />
      </div>
      <dl className="m-0 grid grid-cols-3 gap-1.5 text-xs text-muted-foreground">
        <div>
          <dt>Unidades</dt>
          <dd className="m-0 text-[15px] font-semibold text-foreground tabular-nums">{ent(p.unidades)}</dd>
          {cambio && (
            <dd className="m-0 mt-0.5">
              <Badge tone="warning">pediste {ent(cambio.pedidas)}</Badge>
            </dd>
          )}
        </div>
        <div>
          <dt>Por unidad</dt>
          <dd className="m-0 text-[15px] font-semibold text-foreground tabular-nums">{dinero(p.costoUnitario, 2)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd className="m-0 text-[15px] font-semibold text-foreground tabular-nums">{dinero(p.montoTotal)}</dd>
        </div>
      </dl>
      <p className="m-0 text-xs text-muted-foreground">
        {VIA[p.via]}
        {p.modalidad ? ` ${p.modalidad}` : ""}
        {p.referencia ? ` · ${p.referencia}` : ""}
        {p.cotizadoEn ? ` · cotizada el ${fecha(p.cotizadoEn.slice(0, 10))}` : ""}
        {p.comentarioProveedor ? ` · «${p.comentarioProveedor}»` : ""}
      </p>
      {puedeEscribir && (
        <div className="mt-auto flex flex-wrap justify-end gap-1.5">
          {confirmarDescarte ? (
            <>
              <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmarDescarte(false)}>
                No
              </button>
              <button type="button" className={botonPeligro} disabled={ocupado} onClick={() => decidir("descartado")}>
                Sí, descartar
              </button>
            </>
          ) : (
            <>
              <button type="button" className={botonPeligro} disabled={ocupado} onClick={() => setConfirmarDescarte(true)}>
                Descartar
              </button>
              <button type="button" className={botonPrincipal} disabled={ocupado} onClick={() => decidir("produccion")}>
                {ocupado ? "Guardando…" : "Pasar a Producción"}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

// ── En cotización ──
function EnCotizacion({
  pedidos,
  porDecidir,
  enProduccion,
  nombre,
  puedeEscribir,
  alGuardarNota,
}: {
  pedidos: PedidoPortal[];
  porDecidir: number;
  enProduccion: number;
  nombre: string;
  puedeEscribir: boolean;
  alGuardarNota: (id: string, nota: string) => void;
}) {
  return (
    <>
      <section aria-label="Indicadores" className="marco-neon overflow-hidden rounded-[10px] border border-border bg-card">
        <div className="flex flex-wrap">
          <Indicador titulo={`En Cotizar (los ve ${nombre})`} valor={ent(pedidos.length)} detalle="esperan su precio" />
          <Indicador titulo="Esperan tu decisión" punto={porDecidir ? "aviso" : undefined} valor={ent(porDecidir)} detalle={`ya cotizados por ${nombre}`} />
          <Indicador titulo="En producción" valor={ent(enProduccion)} detalle={`${nombre} los marca enviados al despacharlos`} />
        </div>
      </section>
      <Tarjeta
        titulo="Pedidos de cotización · llegan solos al poner la compra en «01 - Cotizar»"
        accion={
          puedeEscribir ? (
            <Link href={`/compras/lista?proveedor=${encodeURIComponent(nombre)}`} className={botonPrincipal}>
              Nueva compra en Cotizar
            </Link>
          ) : undefined
        }
      >
        {pedidos.length === 0 ? (
          <Vacio>No hay compras de {nombre} en «01 - Cotizar».</Vacio>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  <th scope="col" className={claseThLista}>Producto</th>
                  <th scope="col" className={claseThLista}>País</th>
                  <th scope="col" className={claseThLista}>Vía</th>
                  <th scope="col" className={`${claseThLista} text-right`}>Unidades</th>
                  <th scope="col" className={claseThLista}>Nota para {nombre}</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td className={claseTdLista}>
                      <Producto p={p} />
                    </td>
                    <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                    <td className={claseTdLista}>
                      {VIA[p.via]}
                      {p.modalidad ? ` ${p.modalidad}` : ""}
                    </td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{ent(p.unidades)}</td>
                    <td className={`${claseTdLista} min-w-[16rem] whitespace-normal`}>
                      <NotaEditable p={p} puedeEscribir={puedeEscribir} alGuardar={(nota) => alGuardarNota(p.id, nota)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}

function NotaEditable({ p, puedeEscribir, alGuardar }: { p: PedidoPortal; puedeEscribir: boolean; alGuardar: (nota: string) => void }) {
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(p.notaParaProveedor ?? "");
  const [guardando, setGuardando] = useState(false);
  if (!puedeEscribir) return <span className="text-muted-foreground">{p.notaParaProveedor ?? "—"}</span>;
  if (!editando)
    return (
      <button type="button" onClick={() => setEditando(true)} className={`w-full rounded text-left hover:underline ${anilloFoco} ${p.notaParaProveedor ? "" : "text-muted-foreground"}`} aria-label={`Editar la nota de ${p.producto}`}>
        {p.notaParaProveedor ?? "Agregar nota"}
      </button>
    );
  async function guardar() {
    if (guardando) return;
    if (texto.trim() === (p.notaParaProveedor ?? "")) return setEditando(false);
    setGuardando(true);
    const r = await guardarNotaProveedor(p.id, texto);
    setGuardando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    alGuardar(texto.trim());
    setEditando(false);
    mostrarToast("Nota guardada");
  }
  return (
    <input
      autoFocus
      value={texto}
      maxLength={600}
      disabled={guardando}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") guardar();
        if (e.key === "Escape") {
          setTexto(p.notaParaProveedor ?? "");
          setEditando(false);
        }
      }}
      placeholder="Ej: Por favor cotizar 500 units y confirmar"
      aria-label={`Nota para el proveedor de ${p.producto}`}
      className={`h-8 w-full rounded-md border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`}
    />
  );
}

// ── Tránsito ──
const ORDEN_TONO: Record<TonoCuota, number> = { peligro: 0, aviso: 1, neutro: 2, info: 3, exito: 4 };
const COLOR_BARRA: Record<TonoCuota, string> = { peligro: "bg-destructive", aviso: "bg-warning", exito: "bg-success", info: "bg-azul", neutro: "bg-border-control" };

function Transito({
  pedidos,
  plazos,
  resumen,
  hoy,
  nombre,
  puedeEscribir,
  alLlegar,
}: {
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  resumen: ResumenPais[];
  hoy: string;
  nombre: string;
  puedeEscribir: boolean;
  alLlegar: (id: string, fechaLlegada: string) => void;
}) {
  const filas = pedidos
    .filter((p) => p.fechaEnvio)
    .map((p) => ({ p, plazo: plazos[clavePlazo(p.paisCodigo, p.via)] ?? null, estado: estadoTransito(p.fechaEnvio!, null, plazos[clavePlazo(p.paisCodigo, p.via)] ?? null, hoy) }))
    .sort((a, b) => ORDEN_TONO[a.estado.tono] - ORDEN_TONO[b.estado.tono] || a.p.fechaEnvio!.localeCompare(b.p.fechaEnvio!));
  return (
    <>
      <Tarjeta titulo="Tránsito real contra lo prometido" accion={<span className="text-xs text-muted-foreground">Barra = rango real 2026 · franja verde = plazo · raya = mediana</span>}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(15rem,100%),1fr))] gap-3 p-3">
          {resumen.map((r) => (
            <ResumenTransito key={r.clave} r={r} pedidos={filas.filter((f) => clavePlazo(f.p.paisCodigo, f.p.via) === r.clave)} />
          ))}
        </div>
      </Tarjeta>
      <Tarjeta titulo={`Enviado por ${nombre} · ${filas.length}`} accion={<span className="text-xs text-muted-foreground">Días desde que salió. La llegada la marca bodega.</span>}>
        {filas.length === 0 ? (
          <Vacio>No hay nada en camino.</Vacio>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-[1] bg-card">
                <tr>
                  <th scope="col" className={claseThLista}>Producto</th>
                  <th scope="col" className={claseThLista}>País</th>
                  <th scope="col" className={claseThLista}>Enviado</th>
                  <th scope="col" className={`${claseThLista} text-right`}>Días</th>
                  <th scope="col" className={claseThLista}>Plazo</th>
                  <th scope="col" className={claseThLista}>Avance</th>
                  <th scope="col" className={claseThLista}>Estado</th>
                  {puedeEscribir && <th scope="col" className={`${claseThLista} text-right`}>Llegada</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ p, plazo, estado }) => (
                  <tr key={p.id}>
                    <td className={claseTdLista}>
                      <Producto p={p} />
                    </td>
                    <td className={`${claseTdLista} font-semibold tabular-nums`}>{p.paisCodigo ?? "—"}</td>
                    <td className={`${claseTdLista} tabular-nums`}>{fecha(p.fechaEnvio)}</td>
                    <td className={`${claseTdLista} text-right tabular-nums`}>{estado.dias} d</td>
                    <td className={`${claseTdLista} text-muted-foreground tabular-nums`}>{textoPlazo(plazo)}</td>
                    <td className={claseTdLista}>
                      <span aria-hidden="true" className="relative block h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                        <span className={`absolute inset-y-0 left-0 rounded-full ${COLOR_BARRA[estado.tono]}`} style={{ width: `${Math.min(100, (estado.dias / (plazo?.max ?? 90)) * 100)}%` }} />
                      </span>
                    </td>
                    <td className={claseTdLista}>
                      <Badge tone={TONO[estado.tono]}>{estado.texto}</Badge>
                    </td>
                    {puedeEscribir && (
                      <td className={`${claseTdLista} text-right`}>
                        <BotonLlegada p={p} alLlegar={alLlegar} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}

function ResumenTransito({ r, pedidos }: { r: ResumenPais; pedidos: { estado: { tono: TonoCuota } }[] }) {
  const max = r.plazo?.max ?? r.plazo?.min ?? null;
  const min = r.plazo?.min ?? max;
  const tope = Math.max(140, (r.real?.max ?? 0) + 10);
  const x = (v: number) => `${(v / tope) * 100}%`;
  const atrasados = pedidos.filter((f) => f.estado.tono === "peligro").length;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-sm">
          {r.nombre} · {VIA[r.via].toLowerCase()}
        </b>
        <span className="text-xs text-muted-foreground">{max == null ? "sin plazo acordado" : `prometido ${textoPlazo(r.plazo)}`}</span>
      </div>
      {r.real ? (
        <>
          <div
            role="img"
            aria-label={`Tránsito real en 2026: mediana de ${r.real.mediana} días, de ${r.real.min} a ${r.real.max}${max != null ? `; prometido ${textoPlazo(r.plazo)}` : ""}`}
            className="relative mt-1 h-6"
          >
            <span className="absolute inset-x-0 top-2.5 h-1 rounded-full bg-muted" />
            {max != null && min != null && <span className="absolute top-2 h-2 rounded-full border border-success bg-success-soft" style={{ left: x(min), width: `max(4px, ${((max - min) / tope) * 100}%)` }} />}
            <span className="absolute top-2.5 h-1 rounded-full bg-foreground/25" style={{ left: x(r.real.min), width: `${((r.real.max - r.real.min) / tope) * 100}%` }} />
            <span className="absolute top-0.5 h-5 w-[3px] rounded-sm bg-foreground" style={{ left: x(r.real.mediana) }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span>{Math.round(tope / 2)}</span>
            <span>{tope} d</span>
          </div>
          <p className="m-0 text-[13px]">
            Real en 2026: <b className="tabular-nums">{r.real.mediana} d</b> de mediana ({r.real.min}–{r.real.max}, {r.real.envios} envíos)
          </p>
        </>
      ) : (
        <p className="m-0 text-[13px] text-muted-foreground">Sin llegadas en 2026 para comparar.</p>
      )}
      <p className="m-0 flex items-center gap-1.5 text-[13px]">
        {pedidos.length} en camino
        {atrasados > 0 && (
          <>
            {" · "}
            <Punto tono="peligro" />
            {atrasados} atrasados
          </>
        )}
      </p>
    </div>
  );
}

function BotonLlegada({ p, alLlegar }: { p: PedidoPortal; alLlegar: (id: string, fechaLlegada: string) => void }) {
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  if (!confirmar)
    return (
      <button type="button" className={botonNormal} onClick={() => setConfirmar(true)}>
        Marcar llegada
      </button>
    );
  return (
    <span className="inline-flex gap-1.5">
      <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmar(false)}>
        No
      </button>
      <button
        type="button"
        className={botonPrincipal}
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          const r = await marcarLlegada(p.id);
          setOcupado(false);
          if (r.error || !r.fechaLlegada) return mostrarToast(r.error ?? "No se pudo marcar la llegada.", "destructive");
          alLlegar(p.id, r.fechaLlegada);
          mostrarToast(`${p.producto}: llegada marcada hoy. El saldo vence hoy.`);
        }}
      >
        {ocupado ? "Guardando…" : "Sí, llegó hoy"}
      </button>
    </span>
  );
}
