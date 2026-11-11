"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ETIQUETA_ESTADO_CIERRE } from "@/lib/deliverys/cargar";
import { ETIQUETA_ORIGEN_EFECTIVO } from "@/lib/deliverys/efectivo";
import { ETIQUETA_METODO, METODOS_PAGO, TASA_OBJETIVO, sentidoNeto, textoSemana, type MetodoPago } from "@/lib/deliverys/liquidacion";
import { fechaCorta } from "@/lib/af4/fecha";
import { CalendarioIcon, CerradoIcon, CheckIcon, ExtractoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, TiendaIcon, WalletIcon } from "@/lib/nav-icons";
import { cerrarSemanaDelivery, guardarAjustesCierre, obtenerCierre, reabrirSemanaDelivery, registrarPagoDelivery, type DetalleCierre } from "./actions";
import { TONO_ESTADO_CIERRE } from "./estado-cierre";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero2, entero, fraccion } from "@/lib/af4/formato";

const claseBoton = `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50 ${anilloFoco}`;
const clasePrincipal = `${claseBoton} bg-foreground text-background hover:bg-foreground/85`;
const claseSecundario = `${claseBoton} border border-border-control bg-card hover:bg-muted`;

/**
 * Ficha de un cierre (repartidor + semana): el panel a la derecha que abre su fila. Muestra el resumen, lo de cada tienda
 * y cada día, los ajustes (adelantos y descuentos) mientras está abierto, y las acciones: cerrar la semana, volver a
 * abrirla, registrar el pago (que genera el recibo) y ver el recibo. Sin permiso de escritura solo se lee.
 */
export function FichaCierre({
  repartidorId,
  semana,
  puedeEscribir,
  anterior,
  siguiente,
  alCerrar,
}: {
  repartidorId: string;
  semana: string;
  puedeEscribir: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<DetalleCierre | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pagando, setPagando] = useState(false);
  const [pendiente, empezar] = useTransition();
  const pagoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vigente = true;
    obtenerCierre(repartidorId, semana)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setError(r.error);
        else setDatos(r);
      })
      .catch(() => vigente && setError("No se pudo abrir la ficha."));
    return () => {
      vigente = false;
    };
  }, [repartidorId, semana, version]);

  useEffect(() => {
    if (!pagando) return;
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pagoRef.current?.scrollIntoView({ behavior: reducir ? "auto" : "smooth", block: "start" });
    pagoRef.current?.querySelector<HTMLElement>("input, select")?.focus();
  }, [pagando]);

  const recargar = () => {
    setVersion((v) => v + 1);
    router.refresh();
  };
  const f = datos?.fila;

  function accion(fn: () => Promise<{ error?: string }>, exito: string) {
    setError(null);
    empezar(async () => {
      const r = await fn().catch(() => ({ error: "Se cortó la conexión." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(exito);
        recargar();
      }
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      navegacion={
        <>
          <BotonNavegar texto="Cierre anterior" icono={FlechaArribaIcon} alHacerClic={anterior} />
          <BotonNavegar texto="Cierre siguiente" icono={FlechaAbajoIcon} alHacerClic={siguiente} />
        </>
      }
      titulo={
        <>
          <span className="text-lg font-semibold">{f?.repartidor ?? "Cierre"}</span>
          {f && <Badge tone={TONO_ESTADO_CIERRE[f.estado]}>{ETIQUETA_ESTADO_CIERRE[f.estado]}</Badge>}
        </>
      }
    >
      <div className="flex flex-col divide-y divide-border p-5">
        <p className="pb-4 text-sm text-muted-foreground">Semana del {textoSemana(semana)}</p>
        {error && (
          <p role="alert" className="flex items-center gap-2 py-3 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            {error}
          </p>
        )}
        {!datos && !error && <ProgresoCarga mensaje="Abriendo el cierre…" />}
        {datos && f && (
          <>
            {puedeEscribir && (
              <div className="flex flex-wrap gap-2 py-4">
                {f.estado === "abierto" && (
                  <BotonAccion icono={CerradoIcon} tono="oscuro" disabled={pendiente || (f.enRuta === 0 && f.cobradoEfectivo === 0)} onClick={() => accion(() => cerrarSemanaDelivery(repartidorId, semana), "Semana cerrada")}>
                    Cerrar semana
                  </BotonAccion>
                )}
                {f.estado === "cerrado" && (
                  <>
                    <BotonAccion icono={WalletIcon} tono="exito" disabled={pendiente} aria-expanded={pagando} onClick={() => setPagando((p) => !p)}>
                      {sentidoNeto(f.neto) === "rendir" ? "Registrar entrega" : "Registrar pago"}
                    </BotonAccion>
                    <BotonAccion icono={CalendarioIcon} disabled={pendiente} onClick={() => accion(() => (f.cierreId ? reabrirSemanaDelivery(f.cierreId) : Promise.resolve({})), "Semana abierta otra vez")}>
                      Volver a abrir
                    </BotonAccion>
                  </>
                )}
                {f.estado === "pagado" && f.cierreId && (
                  <BotonAccion icono={ExtractoIcon} onClick={() => router.push(`/deliverys/cierres/${f.cierreId}/recibo`)}>
                    Ver recibo
                  </BotonAccion>
                )}
              </div>
            )}
            {!puedeEscribir && f.estado === "pagado" && f.cierreId && (
              <div className="py-4">
                <BotonAccion icono={ExtractoIcon} onClick={() => router.push(`/deliverys/cierres/${f.cierreId}/recibo`)}>
                  Ver recibo
                </BotonAccion>
              </div>
            )}

            <Seccion icono={GastoIcon} titulo="Liquidación">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Dato titulo="En ruta" valor={entero(f.enRuta)} />
                <Dato titulo="Entregadas" valor={entero(f.entregas)} />
                <Dato titulo="Tasa de entrega" valor={fraccion(f.tasaEntrega, { decimales: 0 })} alerta={f.tasaEntrega !== null && f.tasaEntrega < TASA_OBJETIVO} />
                <Dato titulo="Fallidas (se pagan)" valor={entero(f.fallidas)} />
                <Dato titulo="Devueltas" valor={entero(f.devueltas)} />
                <Dato titulo="Tarifas" valor={dinero2(f.tarifas)} />
                <Dato titulo="Propinas" valor={dinero2(f.propinas)} />
                <Dato titulo="A pagar" valor={dinero2(f.aPagar)} />
                <Dato titulo="Adelantos" valor={f.adelantos ? dinero2(-f.adelantos) : "—"} />
                <Dato titulo="Descuentos" valor={f.descuentos ? dinero2(-f.descuentos) : "—"} />
                <Dato titulo="Efectivo cobrado" valor={f.cobradoEfectivo ? dinero2(-f.cobradoEfectivo) : "—"} />
                <Dato titulo={sentidoNeto(f.neto) === "rendir" ? "Neto: debe entregar" : "Neto a pagar"} valor={dinero2(Math.abs(f.neto))} fuerte alerta={sentidoNeto(f.neto) === "rendir"} />
                {f.aparte > 0 && <Dato titulo="Clicksi (paga aparte)" valor={dinero2(f.aparte)} />}
              </dl>
            </Seccion>

            {pagando && f.estado === "cerrado" && f.cierreId && (
              <div ref={pagoRef}>
                <FormularioPago
                  cierreId={f.cierreId}
                  neto={f.neto}
                  cuentas={datos.cuentas}
                  puedeLibro={datos.puedeLibro}
                  alTerminar={(reciboId, aviso) => {
                    setPagando(false);
                    mostrarToast(aviso ?? "Pago registrado", aviso ? "destructive" : undefined);
                    recargar();
                    if (reciboId && f.cierreId) router.push(`/deliverys/cierres/${f.cierreId}/recibo`);
                  }}
                />
              </div>
            )}

            {datos.pago && (
              <Seccion icono={CheckIcon} titulo="Pago">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <Dato titulo="Fecha" valor={datos.pago.fecha ? fechaCorta(datos.pago.fecha) : "—"} />
                  <Dato titulo="Forma de pago" valor={datos.pago.metodo ? ETIQUETA_METODO[datos.pago.metodo] : "—"} />
                  <Dato titulo="Referencia" valor={datos.pago.referencia ?? "—"} />
                  <Dato titulo="Cuenta" valor={datos.pago.cuenta ?? "—"} />
                  <Dato titulo="Recibo" valor={f.reciboNumero ? `N.º ${String(f.reciboNumero).padStart(4, "0")}` : "—"} />
                  <Dato titulo="En el libro" valor={f.enLibro ? "Sí" : "No"} />
                </dl>
              </Seccion>
            )}

            {f.estado === "abierto" && puedeEscribir && (
              <Seccion icono={WalletIcon} titulo="Adelantos y descuentos">
                <FormularioAjustes
                  key={`${f.adelantos}-${f.descuentos}-${datos.nota ?? ""}`}
                  adelantos={f.adelantos}
                  descuentos={f.descuentos}
                  nota={datos.nota}
                  alGuardar={(d) => accion(() => guardarAjustesCierre(repartidorId, semana, d), "Cambios guardados")}
                  pendiente={pendiente}
                />
              </Seccion>
            )}
            {f.estado !== "abierto" && datos.nota && (
              <Seccion icono={WalletIcon} titulo="Nota">
                <p className="text-sm whitespace-pre-line">{datos.nota}</p>
              </Seccion>
            )}

            {(datos.efectivo.ordenes.length > 0 || datos.efectivo.origen === "manual") && (
              <Seccion icono={WalletIcon} titulo="Efectivo cobrado">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <Dato titulo="Origen" valor={ETIQUETA_ORIGEN_EFECTIVO[datos.efectivo.origen]} />
                  <Dato titulo="En el cierre" valor={dinero2(datos.efectivo.monto)} fuerte />
                  {datos.efectivo.origen === "manual" && datos.efectivo.deOrdenes > 0 && (
                    <Dato titulo="Según las órdenes" valor={dinero2(datos.efectivo.deOrdenes)} alerta={Math.abs(datos.efectivo.deOrdenes - datos.efectivo.monto) > 0.5} />
                  )}
                  {datos.efectivo.remesado !== null && <Dato titulo="Remesado en el Pipeline" valor={dinero2(datos.efectivo.remesado)} />}
                  {datos.efectivo.depositado !== null && <Dato titulo="Conciliado en el banco" valor={dinero2(datos.efectivo.depositado)} />}
                </dl>
                {datos.efectivo.ordenes.length > 0 && (
                  <div className="mt-3 max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Órdenes cobradas en efectivo</caption>
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 pr-3 font-medium">Orden</th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">Tienda</th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">Envío</th>
                          <th scope="col" className="py-1.5 text-right font-medium">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.efectivo.ordenes.map((o) => (
                          <tr key={`${o.tienda}-${o.orden}`} className="border-t border-border/60">
                            <th scope="row" className="py-1.5 pr-3 text-left font-normal tabular-nums">{o.orden}</th>
                            <td className="py-1.5 pr-3">{o.tienda}</td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">{fechaCorta(o.fecha)}</td>
                            <td className="py-1.5 text-right tabular-nums">{dinero2(o.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Seccion>
            )}

            <Seccion icono={TiendaIcon} titulo="Por tienda">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Liquidación por tienda</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Tienda</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Entregadas</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Fallidas</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Devueltas</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.porTienda.map((t) => (
                      <tr key={t.tienda} className="border-t border-border/60">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                          {t.tienda}
                          {t.pagoAparte && <span className="text-muted-foreground"> · aparte</span>}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{t.entregas}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{t.fallidas}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{t.devueltas}</td>
                        <td className={`py-1.5 text-right tabular-nums ${t.pagoAparte ? "text-muted-foreground" : ""}`}>{dinero2(t.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>

            <Seccion icono={CalendarioIcon} titulo="Por día">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Entregas de cada día</caption>
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Día</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Entregadas</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Fallidas</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Devueltas</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Tarifas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.dias.map((d) => (
                      <tr key={d.fecha} className="border-t border-border/60">
                        <th scope="row" className="py-1.5 pr-3 text-left font-normal whitespace-nowrap">{fechaCorta(d.fecha)}</th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.entregas}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.fallidas}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{d.devueltas}</td>
                        <td className="py-1.5 text-right tabular-nums">{dinero2(d.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Seccion>
          </>
        )}
      </div>
    </Ventana>
  );
}

function Dato({ titulo, valor, fuerte = false, alerta = false }: { titulo: string; valor: string; fuerte?: boolean; alerta?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {alerta && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
        {titulo}
      </dt>
      <dd className={`truncate tabular-nums ${fuerte ? "text-base font-semibold" : ""}`}>{valor}</dd>
    </div>
  );
}

function BotonNavegar({ texto, icono: Icono, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; alHacerClic?: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!alHacerClic}
        onClick={() => alHacerClic?.()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${alHacerClic ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

function FormularioAjustes({
  adelantos,
  descuentos,
  nota,
  pendiente,
  alGuardar,
}: {
  adelantos: number;
  descuentos: number;
  nota: string | null;
  pendiente: boolean;
  alGuardar: (d: { adelantos: string; descuentos: string; nota: string }) => void;
}) {
  const id = useId();
  const inicial = { adelantos: adelantos ? String(adelantos) : "", descuentos: descuentos ? String(descuentos) : "", nota: nota ?? "" };
  const [d, setD] = useState(inicial);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(inicial);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        alGuardar({ adelantos: d.adelantos || "0", descuentos: d.descuentos || "0", nota: d.nota });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Adelantos (USD)</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={d.adelantos} onChange={(e) => setD({ ...d, adelantos: e.target.value })} placeholder="Ej: 20.00" className={`${fieldClass} tabular-nums`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Descuentos (USD)</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={d.descuentos} onChange={(e) => setD({ ...d, descuentos: e.target.value })} placeholder="Ej: 5.00" className={`${fieldClass} tabular-nums`} />
        </label>
      </div>
      <label className="flex flex-col gap-1" htmlFor={`${id}-nota`}>
        <span className={labelClassSm}>Nota</span>
        <textarea id={`${id}-nota`} rows={2} maxLength={500} value={d.nota} onChange={(e) => setD({ ...d, nota: e.target.value })} placeholder="Ej: Adelanto entregado el lunes" className={fieldClass} />
      </label>
      {sinGuardar && (
        <div className="flex gap-2">
          <button type="submit" disabled={pendiente} className={clasePrincipal}>
            Guardar cambios
          </button>
          <button type="button" disabled={pendiente} onClick={() => setD(inicial)} className={claseSecundario}>
            Cancelar
          </button>
        </div>
      )}
    </form>
  );
}

function FormularioPago({
  cierreId,
  neto,
  cuentas,
  puedeLibro,
  alTerminar,
}: {
  cierreId: string;
  neto: number;
  cuentas: { id: string; nombre: string }[];
  puedeLibro: boolean;
  alTerminar: (reciboId: string | undefined, aviso?: string) => void;
}) {
  const [fecha, setFecha] = useState(hoyPanama());
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [referencia, setReferencia] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [enLibro, setEnLibro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const rendir = sentidoNeto(neto) === "rendir";
  const ofreceLibro = puedeLibro && sentidoNeto(neto) === "pagar";
  const listo = Boolean(fecha) && (!enLibro || Boolean(cuentaId));

  return (
    <Seccion icono={WalletIcon} titulo={rendir ? "Registrar entrega de efectivo" : "Registrar pago"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          setError(null);
          empezar(async () => {
            const r = await registrarPagoDelivery(cierreId, { fecha, metodo, referencia, cuentaId: cuentaId || null, enLibro: ofreceLibro && enLibro }).catch(() => ({ error: "Se cortó la conexión.", reciboId: undefined }));
            if (r.error && !r.reciboId) setError(r.error);
            else alTerminar(r.reciboId, r.error);
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Fecha</span>
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Forma de pago</span>
            <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={fieldClass}>
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_METODO[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Referencia</span>
            <input value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} placeholder="Ej: 004512339" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cuenta{enLibro ? " *" : ""}</span>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} aria-invalid={enLibro && !cuentaId ? true : undefined} className={fieldClass}>
              <option value="">Sin cuenta</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        {ofreceLibro && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={enLibro} onChange={(e) => setEnLibro(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              Registrar en el libro de movimientos
              <span className="block text-xs text-muted-foreground">Una línea por tienda, fuera del EERR. Si ya se cargó en el Excel del libro, quedaría dos veces.</span>
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            {error}
          </p>
        )}
        <button type="submit" disabled={pendiente || !listo} className={`${clasePrincipal} self-start`}>
          {pendiente ? "Registrando…" : `${rendir ? "Registrar entrega" : "Registrar pago"} de ${dinero2(Math.abs(neto))}`}
        </button>
      </form>
    </Seccion>
  );
}
