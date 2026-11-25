"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { agregarAjuste, anularFirma, enviarSemana, guardarDatosDelivery, guardarNota, quitarAjuste, reabrirSemana } from "@/app/(app)/despacho-ciudad/control/actions";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { diaConNombre, diaCorto, FORMAS_PAGO_RECIBO, nombreTienda, type Ajuste, type FormaPagoRecibo, type ResumenDelivery, type totalesSemana } from "@/lib/despacho/control-envios";
import { plata, sumarDias } from "@/lib/despacho/panel-repartidor";

// Envíos Delivery › Control de envíos (25 nov 2026), como las pantallas 2 y 7 del prototipo aprobado: la tabla de la semana por delivery, el selector
// para trabajar uno por uno (día por día, cómo se calcula, propinas, ajustes, nota y sus datos del recibo) y los recibos firmados del mes.

export interface FilaControl extends ResumenDelivery {
  semanaId: string | null;
  estado: "abierta" | "enviada" | "firmada";
  ajustesLista: Ajuste[];
  nota: string;
  firmadaEn: string | null;
  anulados: number;
  datos: { nombreCompleto: string; cedula: string; formaPago: FormaPagoRecibo; activo: boolean } | null;
}

interface Recibo {
  id: string;
  semana: string;
  delivery: string;
  total: number | null;
  estado: "abierta" | "enviada" | "firmada";
  firmadaEn: string | null;
  pdf: boolean;
}

const claveDe = (f: FilaControl) => f.deliveryId ?? `c:${f.nombre}`;
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", " ·");
const chip = "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap";
const ESTADOS = {
  abierta: ["Semana abierta", "bg-primario-suave text-primario"],
  enviada: ["Por firmar", "bg-warning-soft text-warning"],
  firmada: ["Firmado", "bg-success-soft text-success"],
} as const;
const campo = "min-h-9 rounded-md border border-border-control bg-card px-2 text-[13px]";
const botonSec = `inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-[13px] font-semibold text-foreground-soft hover:bg-muted disabled:opacity-60 ${anilloFoco}`;
const botonPri = `inline-flex min-h-9 items-center justify-center rounded-lg bg-primario px-3.5 text-[13px] font-bold text-white disabled:opacity-60 ${anilloFoco}`;

export function ControlEnvios(p: {
  jueves: string;
  fin: string;
  actual: string;
  terminada: boolean;
  filas: FilaControl[];
  tiendas: string[];
  totales: ReturnType<typeof totalesSemana>;
  elegido: string | null;
  mes: string;
  recibos: Recibo[];
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [sel, setSel] = useState(() => p.filas.find((f) => claveDe(f) === p.elegido) ?? p.filas.find((f) => !f.prueba && f.asignados > 0) ?? p.filas[0]);
  const actual = p.filas.find((f) => claveDe(f) === (sel ? claveDe(sel) : "")) ?? p.filas[0];
  const correr = (accion: () => Promise<{ error?: string; aviso?: string }>, ok: string) =>
    empezar(async () => {
      const r = await accion();
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(r.aviso ?? ok);
      router.refresh();
    });
  const enCurso = p.jueves === p.actual;
  const porMandar = p.filas.filter((f) => f.deliveryId && f.estado === "abierta" && !f.prueba && (f.asignados > 0 || f.ajustesLista.length)).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/despacho-ciudad/control?semana=${sumarDias(p.jueves, -7)}`} aria-label="Semana anterior" className={`${botonSec} w-9 px-0 text-base`}>
          ‹
        </Link>
        <span className="inline-flex min-h-9 items-center rounded-lg border border-primario bg-primario-suave px-3 text-[13px] font-semibold text-primario">
          Semana jue {diaCorto(p.jueves)} – mié {diaCorto(p.fin)}/{p.fin.slice(0, 4)}
        </span>
        {enCurso ? (
          <span className={`${botonSec} w-9 px-0 text-base opacity-40`} aria-hidden="true">
            ›
          </span>
        ) : (
          <Link href={`/despacho-ciudad/control?semana=${sumarDias(p.jueves, 7)}`} aria-label="Semana siguiente" className={`${botonSec} w-9 px-0 text-base`}>
            ›
          </Link>
        )}
        <span className={`${chip} bg-primario-suave text-primario`}>{enCurso ? "En curso · solo cuenta pedidos cerrados" : p.terminada ? "Terminada · se paga el jueves" : "Abierta"}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <a href={`/despacho-ciudad/control/excel?semana=${p.jueves}`} className={botonSec}>
            Descargar Excel
          </a>
          {p.puedeEscribir && (
            <button
              type="button"
              disabled={pendiente || !p.terminada || porMandar === 0}
              title={!p.terminada ? "La semana se cierra a partir del jueves" : porMandar === 0 ? "No queda ninguna semana abierta por mandar" : undefined}
              onClick={() => correr(() => enviarSemana(p.jueves, null), "Semana mandada.")}
              className={botonPri}
            >
              Cerrar semana y enviar a los repartidores{porMandar ? ` (${porMandar})` : ""}
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Cifra titulo="Entregados (con cambios y retiros)" valor={String(p.totales.entregados + p.totales.cambios + p.totales.retiros)} />
        <Cifra titulo="Fallidos con evidencia" valor={String(p.totales.fallidos)} />
        <Cifra titulo="A pagar · Oceans" valor={plata(p.totales.totalOceans)} fuerte />
        <Cifra titulo="Paga ClickSi (aparte)" valor={plata(p.totales.clicksi)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50 text-right text-xs text-muted-foreground">
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">
                Repartidor
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Entregados
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Cambios y compl.
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Retiros
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Fallidos
              </th>
              {p.tiendas.map((t) => (
                <th key={t} scope="col" className="px-2 py-2 font-semibold">
                  {nombreTienda(t)}
                </th>
              ))}
              <th scope="col" className="px-2 py-2 font-semibold">
                Propinas y ajustes
              </th>
              <th scope="col" className="px-2 py-2 font-semibold text-primario">
                Total Oceans
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                ClickSi
              </th>
              <th scope="col" className="px-2.5 py-2 text-left font-semibold">
                Recibo
              </th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((f) => {
              const activa = actual && claveDe(f) === claveDe(actual);
              const [texto, clase] = f.deliveryId ? ESTADOS[f.estado] : ["Sin registrar", "bg-destructive-soft text-destructive"];
              return (
                <tr key={claveDe(f)} className={`border-t border-border/60 text-right ${activa ? "bg-primario-suave/40" : ""} ${f.prueba ? "text-muted-foreground" : ""}`}>
                  <td className="px-2.5 py-2 text-left">
                    <button type="button" onClick={() => setSel(f)} className={`text-left font-semibold hover:text-primario ${anilloFoco}`}>
                      {f.nombre}
                      {f.prueba && " (prueba)"}
                    </button>
                    <br />
                    <span className="text-[11px] text-muted-foreground">
                      {f.couriers.join(" + ")} · {plata(f.tarifas.entrega)} / {plata(f.tarifas.cambio)}
                    </span>
                  </td>
                  <td className="px-2 py-2">{f.entregados}</td>
                  <td className="px-2 py-2">{f.cambios}</td>
                  <td className="px-2 py-2">{f.retiros}</td>
                  <td className="px-2 py-2">{f.fallidos}</td>
                  {p.tiendas.map((t) => (
                    <td key={t} className="px-2 py-2">
                      {f.porTienda[t] ? plata(f.porTienda[t]) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2">{f.propinas + f.ajustes ? plata(f.propinas + f.ajustes) : "—"}</td>
                  <td className="px-2 py-2 font-bold text-primario">{plata(f.totalOceans)}</td>
                  <td className="px-2 py-2">{plata(f.clicksi)}</td>
                  <td className="px-2.5 py-2 text-left">
                    <span className={`${chip} ${clase}`}>{texto}</span>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-border bg-muted/50 text-right font-bold">
              <td className="px-2.5 py-2 text-left">Total</td>
              <td className="px-2 py-2">{p.totales.entregados}</td>
              <td className="px-2 py-2">{p.totales.cambios}</td>
              <td className="px-2 py-2">{p.totales.retiros}</td>
              <td className="px-2 py-2">{p.totales.fallidos}</td>
              {p.tiendas.map((t) => (
                <td key={t} className="px-2 py-2">
                  {plata(p.totales.porTienda[t] ?? 0)}
                </td>
              ))}
              <td className="px-2 py-2">{p.totales.propinasYAjustes ? plata(p.totales.propinasYAjustes) : "—"}</td>
              <td className="px-2 py-2 text-primario">{plata(p.totales.totalOceans)}</td>
              <td className="px-2 py-2">{plata(p.totales.clicksi)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="m-0 -mt-2 text-xs text-muted-foreground">El usuario de prueba sale para probar la app, pero no suma en los totales.</p>

      {actual && <Detalle key={claveDe(actual)} f={actual} filas={p.filas} onElegir={setSel} jueves={p.jueves} terminada={p.terminada} puedeEscribir={p.puedeEscribir} pendiente={pendiente} correr={correr} />}

      <Recibos mes={p.mes} recibos={p.recibos} jueves={p.jueves} puedeEscribir={p.puedeEscribir} pendiente={pendiente} correr={correr} />
    </>
  );
}

function Cifra({ titulo, valor, fuerte }: { titulo: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2.5 ${fuerte ? "border-primario/30 bg-primario-suave" : "border-border bg-card"}`}>
      <span className={`text-xs ${fuerte ? "text-primario" : "text-muted-foreground"}`}>{titulo}</span>
      <b className={`text-xl ${fuerte ? "text-primario" : ""}`}>{valor}</b>
    </div>
  );
}

type Correr = (accion: () => Promise<{ error?: string; aviso?: string }>, ok: string) => void;

/** El delivery elegido: día por día, cómo se calcula (con propinas), ajustes y nota, y sus datos del recibo. */
function Detalle(p: { f: FilaControl; filas: FilaControl[]; onElegir: (f: FilaControl) => void; jueves: string; terminada: boolean; puedeEscribir: boolean; pendiente: boolean; correr: Correr }) {
  const { f } = p;
  const abierta = f.estado === "abierta";
  const editable = p.puedeEscribir && !!f.deliveryId && abierta;
  const [propina, setPropina] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<{ monto: string; motivo: string } | null>(null);
  const [nota, setNota] = useState(f.nota);
  const [anular, setAnular] = useState<string | null>(null);
  const subtotal = f.lineas.reduce((s, l) => s + l.total, 0);
  return (
    <section aria-labelledby="t-detalle" className="flex flex-col gap-3 rounded-xl border border-primario/30 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <b id="t-detalle" className="mr-1.5 text-sm">
          Detalle del delivery:
        </b>
        {p.filas.map((x) => {
          const activo = claveDe(x) === claveDe(f);
          return (
            <button
              key={claveDe(x)}
              type="button"
              aria-pressed={activo}
              onClick={() => p.onElegir(x)}
              className={`min-h-8 rounded-full px-3 text-[13px] ${anilloFoco} ${activo ? "border-2 border-primario bg-primario-suave font-semibold text-primario" : "border border-border bg-card font-medium text-foreground-soft hover:bg-muted"}`}
            >
              {x.nombre}
              {x.prueba ? " (prueba)" : ""}
            </button>
          );
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-2">
          <b className="text-sm">{f.nombre} · día por día</b>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-right text-xs text-muted-foreground">
                <th scope="col" className="py-1 text-left font-semibold">
                  Día
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Asignados
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Entregados
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Cambios y compl.
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Fallidos
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Retiros
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Pago
                </th>
              </tr>
            </thead>
            <tbody>
              {f.dias.length ? (
                f.dias.map((d) => (
                  <tr key={d.dia} className="border-t border-border/60 text-right">
                    <td className="py-1.5 text-left">{diaConNombre(d.dia)}</td>
                    <td className="py-1.5">{d.asignados}</td>
                    <td className="py-1.5">{d.entregados}</td>
                    <td className="py-1.5">{d.cambios}</td>
                    <td className="py-1.5">{d.fallidos}</td>
                    <td className="py-1.5">{d.retiros}</td>
                    <td className="py-1.5 font-semibold">{plata(d.pago)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-2 text-muted-foreground">
                    Sin pedidos esta semana.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {(f.pospuestos > 0 || f.fallidosSinEvidencia > 0 || f.enRuta > 0) && (
            <p className="m-0 text-xs text-muted-foreground">
              No se pagan: {f.pospuestos} pospuestos, {f.fallidosSinEvidencia} fallidos sin foto{f.enRuta ? ` y ${f.enRuta} sin cerrar` : ""}.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 text-[13px]">
          <b className="text-sm">Cómo se calcula</b>
          {f.lineas.map((l) => (
            <Linea key={l.concepto} texto={`${l.cantidad} ${l.texto} × ${plata(l.tarifa)}`} valor={plata(l.total)} />
          ))}
          <Linea
            texto={
              <>
                Propinas
                {editable && propina === null && (
                  <button type="button" onClick={() => setPropina("")} className={`ml-1.5 min-h-7 rounded-md border border-dashed border-primario/60 bg-card px-2 text-xs font-semibold text-primario ${anilloFoco}`}>
                    + Agregar
                  </button>
                )}
              </>
            }
            valor={plata(f.propinas)}
          />
          {propina !== null && (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                p.correr(async () => {
                  const r = await agregarAjuste(f.deliveryId!, p.jueves, "propina", propina, "");
                  if (!r.error) setPropina(null);
                  return r;
                }, "Propina agregada.");
              }}
            >
              <label className="sr-only" htmlFor="propina">
                Monto de la propina
              </label>
              <input id="propina" inputMode="decimal" autoFocus placeholder="$0.00" value={propina} onChange={(e) => setPropina(e.target.value)} className={`${campo} w-24`} />
              <button type="submit" disabled={p.pendiente} className={botonPri}>
                Agregar
              </button>
              <button type="button" onClick={() => setPropina(null)} className={botonSec}>
                Cancelar
              </button>
            </form>
          )}
          {f.ajustes !== 0 && <Linea texto="Ajustes" valor={plata(f.ajustes)} />}
          <Linea texto="Total de la semana" valor={plata(subtotal + f.propinas + f.ajustes)} borde />
          <Linea texto="Paga Oceans (Oferfy, Kenku, Nuvo)" valor={plata(f.totalOceans)} morado />
          <Linea texto="Paga ClickSi" valor={plata(f.clicksi)} />
          <span className="text-xs text-muted-foreground">
            Tarifas de {f.nombre}: entrega y fallido con evidencia {plata(f.tarifas.entrega)} · cambio, complemento y retiro {plata(f.tarifas.cambio)}. Se cambian en sus datos, abajo.
          </span>
        </div>

        <div className="flex flex-col gap-2 text-[13px]">
          <b className="text-sm">Propinas, ajustes y nota</b>
          {f.ajustesLista.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {f.ajustesLista.map((a, i) => (
                <li key={`${i}-${a.motivo}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
                  <span>
                    {a.tipo === "propina" ? "Propina" : a.motivo} · <b>{plata(a.monto)}</b>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      disabled={p.pendiente}
                      onClick={() => p.correr(() => quitarAjuste(f.deliveryId!, p.jueves, i), "Quitado.")}
                      className={`text-xs font-medium text-destructive ${anilloFoco}`}
                    >
                      Quitar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable &&
            (ajuste === null ? (
              <button type="button" onClick={() => setAjuste({ monto: "", motivo: "" })} className={`min-h-9 rounded-lg border border-dashed border-primario/60 bg-card text-[13px] font-semibold text-primario ${anilloFoco}`}>
                + Agregar ajuste (+ o −)
              </button>
            ) : (
              <form
                className="flex flex-col gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  p.correr(async () => {
                    const r = await agregarAjuste(f.deliveryId!, p.jueves, "ajuste", ajuste.monto, ajuste.motivo);
                    if (!r.error) setAjuste(null);
                    return r;
                  }, "Ajuste agregado.");
                }}
              >
                <span className="text-xs text-muted-foreground">Reconocimiento, descuento de préstamo o pago retenido. Con − si descuenta.</span>
                <div className="flex gap-1.5">
                  <label className="sr-only" htmlFor="aj-monto">
                    Monto
                  </label>
                  <input id="aj-monto" inputMode="decimal" placeholder="-50" value={ajuste.monto} onChange={(e) => setAjuste({ ...ajuste, monto: e.target.value })} className={`${campo} w-24`} />
                  <label className="sr-only" htmlFor="aj-motivo">
                    Motivo
                  </label>
                  <input id="aj-motivo" placeholder="Motivo" maxLength={200} value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} className={`${campo} min-w-0 flex-1`} />
                </div>
                <div className="flex gap-1.5">
                  <button type="submit" disabled={p.pendiente} className={botonPri}>
                    Agregar
                  </button>
                  <button type="button" onClick={() => setAjuste(null)} className={botonSec}>
                    Cancelar
                  </button>
                </div>
              </form>
            ))}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-foreground-soft">Nota para el repartidor</span>
            <textarea
              rows={3}
              value={nota}
              disabled={!editable}
              maxLength={1500}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. En unos minutos se te envía el comprobante del pago."
              className="resize-none rounded-md border border-border-control px-2 py-1.5 text-[13px] disabled:bg-muted/40"
            />
          </label>
          {editable && nota !== f.nota && (
            <button type="button" disabled={p.pendiente} onClick={() => p.correr(() => guardarNota(f.deliveryId!, p.jueves, nota), "Nota guardada.")} className={botonSec}>
              Guardar nota
            </button>
          )}
          {!f.deliveryId && <p className="m-0 text-xs text-destructive">«{f.nombre}» no es de ningún delivery registrado: pídele a un administrador que lo sume a sus nombres.</p>}
        </div>
      </div>

      {f.deliveryId && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className={`${chip} ${ESTADOS[f.estado][1]}`}>{ESTADOS[f.estado][0]}</span>
          {f.estado === "firmada" && f.firmadaEn && <span className="text-xs text-muted-foreground">Firmado el {fechaHora(f.firmadaEn)}</span>}
          {f.anulados > 0 && <span className="text-xs text-muted-foreground">· {f.anulados} firma(s) anulada(s), guardadas</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            {f.estado === "firmada" && f.semanaId && (
              <a href={`/despacho-ciudad/control/recibo/${f.semanaId}`} target="_blank" rel="noreferrer" className={botonSec}>
                Ver recibo firmado
              </a>
            )}
            {p.puedeEscribir && f.estado === "abierta" && (p.terminada || f.prueba) && (
              <button type="button" disabled={p.pendiente} onClick={() => p.correr(() => enviarSemana(p.jueves, f.deliveryId), "Semana mandada.")} className={botonPri}>
                Mandar solo a {f.nombre}
              </button>
            )}
            {p.puedeEscribir && f.estado === "enviada" && f.semanaId && (
              <button type="button" disabled={p.pendiente} onClick={() => p.correr(() => reabrirSemana(f.semanaId!), "Semana abierta otra vez.")} className={botonSec}>
                Volver a abrir para corregir
              </button>
            )}
            {p.puedeEscribir && f.estado === "firmada" && f.semanaId && anular === null && (
              <button type="button" onClick={() => setAnular("")} className={botonSec}>
                Anular firma para corregir
              </button>
            )}
          </span>
          {anular !== null && f.semanaId && (
            <form
              className="flex w-full flex-wrap gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                p.correr(() => anularFirma(f.semanaId!, anular), "Firma anulada: el recibo anterior queda guardado.");
              }}
            >
              <label className="sr-only" htmlFor="anular">
                Por qué se anula
              </label>
              <input id="anular" autoFocus placeholder="Por qué se anula (queda anotado)" value={anular} onChange={(e) => setAnular(e.target.value)} className={`${campo} min-w-[16rem] flex-1`} />
              <button type="submit" disabled={p.pendiente} className={botonPri}>
                Anular
              </button>
              <button type="button" onClick={() => setAnular(null)} className={botonSec}>
                Cancelar
              </button>
            </form>
          )}
        </div>
      )}

      {f.deliveryId && f.datos && <DatosRecibo key={f.deliveryId} id={f.deliveryId} datos={f.datos} tarifas={f.tarifas} puedeEscribir={p.puedeEscribir} pendiente={p.pendiente} correr={p.correr} />}
    </section>
  );
}

function Linea({ texto, valor, borde, morado }: { texto: ReactNode; valor: string; borde?: boolean; morado?: boolean }) {
  return (
    <span className={`flex items-center justify-between gap-2 ${borde ? "border-t border-border pt-1.5" : ""} ${morado ? "text-primario" : ""}`}>
      <span>{texto}</span>
      <b>{valor}</b>
    </span>
  );
}

/** Los datos del recibo del delivery (los completa Yiletsi) y sus tarifas. */
function DatosRecibo(p: { id: string; datos: NonNullable<FilaControl["datos"]>; tarifas: { entrega: number; cambio: number }; puedeEscribir: boolean; pendiente: boolean; correr: Correr }) {
  const [v, setV] = useState({ nombreCompleto: p.datos.nombreCompleto, cedula: p.datos.cedula, formaPago: p.datos.formaPago as string, tarifaEntrega: p.tarifas.entrega.toFixed(2), tarifaCambio: p.tarifas.cambio.toFixed(2) });
  const falta = !p.datos.nombreCompleto || !p.datos.cedula;
  return (
    <details open={falta} className="rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer text-[13px] font-semibold">
        Datos del recibo y tarifas {falta && <span className="ml-1 text-xs font-semibold text-warning">· falta nombre completo o cédula</span>}
      </summary>
      <form
        className="mt-2 flex flex-wrap items-end gap-2 text-[13px]"
        onSubmit={(e) => {
          e.preventDefault();
          p.correr(() => guardarDatosDelivery(p.id, v), "Datos guardados.");
        }}
      >
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium">Nombre completo</span>
          <input disabled={!p.puedeEscribir} maxLength={120} value={v.nombreCompleto} onChange={(e) => setV({ ...v, nombreCompleto: e.target.value })} className={campo} />
        </label>
        <label className="flex w-40 flex-col gap-1">
          <span className="text-xs font-medium">Cédula o pasaporte</span>
          <input disabled={!p.puedeEscribir} maxLength={40} value={v.cedula} onChange={(e) => setV({ ...v, cedula: e.target.value })} className={campo} />
        </label>
        <label className="flex w-36 flex-col gap-1">
          <span className="text-xs font-medium">Forma de pago</span>
          <select disabled={!p.puedeEscribir} value={v.formaPago} onChange={(e) => setV({ ...v, formaPago: e.target.value })} className={campo}>
            {Object.entries(FORMAS_PAGO_RECIBO).map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-28 flex-col gap-1">
          <span className="text-xs font-medium">Entrega y fallido</span>
          <input disabled={!p.puedeEscribir} inputMode="decimal" value={v.tarifaEntrega} onChange={(e) => setV({ ...v, tarifaEntrega: e.target.value })} className={campo} />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="text-xs font-medium">Cambio, compl., retiro</span>
          <input disabled={!p.puedeEscribir} inputMode="decimal" value={v.tarifaCambio} onChange={(e) => setV({ ...v, tarifaCambio: e.target.value })} className={campo} />
        </label>
        {p.puedeEscribir && (
          <button type="submit" disabled={p.pendiente} className={botonPri}>
            Guardar datos
          </button>
        )}
        <span className="w-full text-xs text-muted-foreground">Las tarifas nuevas cuentan para las semanas abiertas; lo ya mandado o firmado no cambia.</span>
      </form>
    </details>
  );
}

/** Los recibos del mes (pantalla 7 del prototipo): estado, firma y PDF; «Descargar todos» los junta en un PDF. */
function Recibos(p: { mes: string; recibos: Recibo[]; jueves: string; puedeEscribir: boolean; pendiente: boolean; correr: Correr }) {
  const [a, m] = p.mes.split("-").map(Number);
  const mesTexto = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" });
  const otro = (n: number) => {
    const d = new Date(Date.UTC(a, m - 1 + n, 15));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const firmados = p.recibos.filter((r) => r.estado === "firmada" && r.pdf).length;
  return (
    <section aria-labelledby="t-recibos" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="t-recibos" className="m-0 text-sm font-bold">
          Recibos firmados
        </h2>
        <span className="text-xs text-muted-foreground">Se guardan en el archivo privado del sistema al firmar; el delivery los ve en su app, en Mis pagos.</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Link href={`/despacho-ciudad/control?semana=${p.jueves}&mes=${otro(-1)}`} aria-label="Mes anterior" className={`${botonSec} w-9 px-0`}>
            ‹
          </Link>
          <span className="inline-flex min-h-9 items-center rounded-lg border border-primario bg-primario-suave px-3 text-[13px] font-semibold text-primario first-letter:uppercase">{mesTexto}</span>
          <Link href={`/despacho-ciudad/control?semana=${p.jueves}&mes=${otro(1)}`} aria-label="Mes siguiente" className={`${botonSec} w-9 px-0`}>
            ›
          </Link>
          {firmados > 0 && (
            <a href={`/despacho-ciudad/control/recibos?mes=${p.mes}`} className={botonSec}>
              Descargar todos ({firmados}) en un PDF
            </a>
          )}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-muted/50 text-left text-xs text-muted-foreground">
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Semana
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Repartidor
              </th>
              <th scope="col" className="px-2.5 py-2 text-right font-semibold">
                Oceans
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Estado
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                Firmado
              </th>
              <th scope="col" className="px-2.5 py-2 font-semibold">
                PDF
              </th>
            </tr>
          </thead>
          <tbody>
            {p.recibos.length ? (
              p.recibos.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-2.5 py-2">
                    {diaCorto(r.semana)} – {diaCorto(sumarDias(r.semana, 6))}
                  </td>
                  <td className="px-2.5 py-2 font-semibold">{r.delivery}</td>
                  <td className="px-2.5 py-2 text-right">{r.total === null ? "—" : plata(r.total)}</td>
                  <td className="px-2.5 py-2">
                    <span className={`${chip} ${ESTADOS[r.estado][1]}`}>{r.estado === "enviada" ? "Enviado, por firmar" : ESTADOS[r.estado][0]}</span>
                  </td>
                  <td className="px-2.5 py-2 text-muted-foreground">{r.firmadaEn ? fechaHora(r.firmadaEn) : "—"}</td>
                  <td className="px-2.5 py-2">
                    {r.estado === "firmada" && r.pdf ? (
                      <a href={`/despacho-ciudad/control/recibo/${r.id}`} target="_blank" rel="noreferrer" className="font-semibold text-primario">
                        Descargar
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-2.5 py-3 text-muted-foreground">
                  Todavía no hay semanas mandadas en este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
