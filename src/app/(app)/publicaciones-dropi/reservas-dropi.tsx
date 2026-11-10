"use client";

import { useId, useState, useTransition, type KeyboardEvent } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Seccion } from "@/components/ui/seccion-ficha";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CandadoAbiertoIcon, CorreoIcon, LapizIcon, PapeleraIcon } from "@/lib/nav-icons";
import { MAX_UNIDADES_RESERVA, type ReservaDropi } from "@/lib/publicaciones/reservas-dropi";
import { cambiarReservaDropi } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

/** El nombre de quien tiene la reserva: el de Dropi, si no su correo. */
export const quienReserva = (r: { nombre: string | null; correo: string | null; usuario?: number | null }) => r.nombre ?? r.correo ?? (r.usuario ? `Usuario ${r.usuario}` : "Sin correo");

const botonClaro = `inline-flex items-center justify-center border border-border-control bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60 ${anilloFoco} !rounded-md`;
const botonOscuro = `inline-flex items-center justify-center border border-transparent bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco} !rounded-md`;
const botonIcono = `inline-flex h-7 w-7 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco} !rounded-md`;

/** Enter guarda, Escape cancela; nada de esto envía el formulario de la ficha. */
const teclas = (guardar: () => void, cancelar: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter") {
    e.preventDefault();
    guardar();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelar();
  }
};

/** Deja pendiente el cambio y avisa; devuelve el error si lo hubo. */
function usePedirReserva(p: FilaPublicacion) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const pedir = (datos: { correo: string; unidades: number; nombre?: string | null }, listo: () => void, alError: (e: string) => void) =>
    empezar(async () => {
      const r = await cambiarReservaDropi(p.id, datos).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return alError(r.error);
      listo();
      mostrarToast(r.detalle ?? "Reserva pendiente para Dropi");
    });
  return { pendiente, pedir };
}

/** Una reserva leída de Dropi: el lápiz cambia sus unidades y la papelera la quita (las dos quedan pendientes para «Aplicar en Dropi»). */
function FilaReserva({ p, r, editable }: { p: FilaPublicacion; r: ReservaDropi; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [valor, setValor] = useState(String(r.unidades));
  const [error, setError] = useState<string | null>(null);
  const { pendiente, pedir } = usePedirReserva(p);
  const id = useId();
  const cerrar = () => {
    setEditando(false);
    setQuitando(false);
    setError(null);
    setValor(String(r.unidades));
  };
  const guardar = () => {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n > MAX_UNIDADES_RESERVA) return setError("Escribe las unidades que deben quedar reservadas (1 o más; para quitarla, usa la papelera).");
    if (!r.correo) return setError("Dropi no dio el correo de esta reserva: cámbiala en Dropi.");
    pedir({ correo: r.correo, unidades: n, nombre: r.nombre }, cerrar, setError);
  };
  const quitar = () => {
    if (!r.correo) return setError("Dropi no dio el correo de esta reserva: quítala en Dropi.");
    pedir({ correo: r.correo, unidades: 0, nombre: r.nombre }, cerrar, setError);
  };
  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{quienReserva(r)}</span>
          {r.nombre && r.correo && <span className="truncate text-xs text-muted-foreground">{r.correo}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="font-semibold tabular-nums">{r.unidades.toLocaleString("es-PA")} u.</span>
          {editable && !editando && !quitando && (
            <>
              <Tooltip texto="Cambiar unidades">
                <button type="button" aria-label={`Cambiar las unidades reservadas a ${quienReserva(r)}`} className={botonIcono} onClick={() => setEditando(true)}>
                  <LapizIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip texto="Quitar reserva">
                <button type="button" aria-label={`Quitar la reserva de ${quienReserva(r)}`} className={botonIcono} onClick={() => setQuitando(true)}>
                  <PapeleraIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </>
          )}
        </span>
      </div>
      {editando && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-xs text-muted-foreground">
            Total reservado
          </label>
          <input id={id} type="number" min={1} max={MAX_UNIDADES_RESERVA} inputMode="numeric" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={teclas(guardar, cerrar)} className={`${fieldClassSm} w-24 text-right tabular-nums`} />
          <button type="button" className={botonOscuro} disabled={pendiente} onClick={guardar}>
            {pendiente ? "Guardando…" : "Dejar pendiente para Dropi"}
          </button>
          <button type="button" className={botonClaro} disabled={pendiente} onClick={cerrar}>
            Cancelar
          </button>
        </div>
      )}
      {quitando && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-2 text-xs">
          <span className="min-w-0 flex-1">
            ¿Quitar las {r.unidades.toLocaleString("es-PA")} u. reservadas a {quienReserva(r)}? Al quitar una reserva, Dropi puede descontar esas unidades del stock: el favorito lo revisa y te avisa.
          </span>
          <button type="button" className={botonOscuro} disabled={pendiente} onClick={quitar}>
            {pendiente ? "Guardando…" : "Quitar reserva"}
          </button>
          <button type="button" className={botonClaro} disabled={pendiente} onClick={cerrar}>
            Cancelar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

/** «Agregar correo»: un correo nuevo con sus unidades reservadas. */
function AgregarReserva({ p }: { p: FilaPublicacion }) {
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState("");
  const [unidades, setUnidades] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pendiente, pedir } = usePedirReserva(p);
  const idCorreo = useId();
  const idUnidades = useId();
  const cerrar = () => {
    setAbierto(false);
    setCorreo("");
    setUnidades("");
    setError(null);
  };
  const guardar = () => {
    const n = Number(unidades);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) return setError("Escribe el correo con que el dropshipper entra a Dropi.");
    if (!Number.isInteger(n) || n < 1 || n > MAX_UNIDADES_RESERVA) return setError("Escribe cuántas unidades se le reservan (1 o más).");
    pedir({ correo: correo.trim(), unidades: n }, cerrar, setError);
  };
  if (!abierto)
    return (
      <button type="button" className={`${botonClaro} self-start`} onClick={() => setAbierto(true)}>
        + Privatizar a un correo
      </button>
    );
  const enter = teclas(guardar, cerrar);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <label htmlFor={idCorreo} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Correo del dropshipper en Dropi
          <input id={idCorreo} type="email" autoFocus value={correo} onChange={(e) => setCorreo(e.target.value)} onKeyDown={enter} placeholder="Ej: tienda@correo.com" className={fieldClassSm} />
        </label>
        <label htmlFor={idUnidades} className="flex flex-col gap-1 text-xs text-muted-foreground">
          Total de unidades
          <input id={idUnidades} type="number" min={1} max={MAX_UNIDADES_RESERVA} inputMode="numeric" value={unidades} onChange={(e) => setUnidades(e.target.value)} onKeyDown={enter} placeholder="Ej: 20" className={`${fieldClassSm} text-right tabular-nums`} />
        </label>
      </div>
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botonOscuro} disabled={pendiente} onClick={guardar}>
          {pendiente ? "Guardando…" : "Dejar pendiente para Dropi"}
        </button>
        <button type="button" className={botonClaro} disabled={pendiente} onClick={cerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Por qué no se puede privatizar a un correo desde esta publicación (null = se puede). La misma regla que el bloque «Stock reservado por correo». */
export function motivoPrivatizarCorreo(p: FilaPublicacion, puedeEscribir: boolean): string | null {
  if (!puedeEscribir) return "No tienes permiso para modificar este módulo";
  if (p.stockPorId.some((x) => x.variable)) return "Tiene variaciones: la reserva es por variación y se hace en Dropi";
  if (!p.dropiId.trim()) return "No tiene ID de Dropi";
  if (p.sinPublicar) return "Todavía no está publicada en Dropi";
  if (p.archivada) return "Está archivada";
  if (p.duplicadaDe) return "Es una duplicada";
  if (p.tipoDropi === "privado") return "Es un producto privado: sus correos se cambian en «Stock reservado por correo»";
  return null;
}

/** La ventana de «Privatizar a un correo»: un correo (nuevo o de los que ya tienen reserva) y el **total** que debe quedar para él. */
function VentanaPrivatizarCorreo({ p, alCerrar }: { p: FilaPublicacion; alCerrar: () => void }) {
  const [correo, setCorreo] = useState("");
  const [unidades, setUnidades] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pendiente, pedir } = usePedirReserva(p);
  const idCorreo = useId();
  const idUnidades = useId();
  const guardar = () => {
    const n = Number(unidades);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) return setError("Escribe el correo con que el dropshipper entra a Dropi.");
    if (!Number.isInteger(n) || n < 1 || n > MAX_UNIDADES_RESERVA) return setError("Escribe el total de unidades que debe quedar reservado (1 o más).");
    pedir({ correo: correo.trim(), unidades: n }, alCerrar, setError);
  };
  const enter = teclas(guardar, alCerrar);
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Privatizar a un correo" ancho="md">
      <div className="flex flex-col gap-4 p-5 text-sm">
        <p className="m-0 truncate font-medium">
          {p.nombre} <span className="font-normal text-muted-foreground">· ID {p.dropiId}</span>
        </p>
        {p.reservas.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {p.reservas.map((r, i) => (
              <li key={r.id ?? `${r.correo}-${i}`}>
                <button
                  type="button"
                  className={`${botonClaro} gap-1.5`}
                  disabled={!r.correo}
                  aria-label={`Cambiar el total reservado a ${quienReserva(r)} (hoy ${r.unidades} unidades)`}
                  onClick={() => {
                    setCorreo(r.correo ?? "");
                    setUnidades(String(r.unidades));
                    setError(null);
                  }}
                >
                  {quienReserva(r)} · {r.unidades.toLocaleString("es-PA")} u.
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <label htmlFor={idCorreo} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Correo del dropshipper en Dropi
            <input id={idCorreo} type="email" autoFocus value={correo} onChange={(e) => setCorreo(e.target.value)} onKeyDown={enter} placeholder="Ej: tienda@correo.com" className={fieldClassSm} />
          </label>
          <label htmlFor={idUnidades} className="flex flex-col gap-1 text-xs text-muted-foreground">
            Total de unidades
            <input id={idUnidades} type="number" min={1} max={MAX_UNIDADES_RESERVA} inputMode="numeric" value={unidades} onChange={(e) => setUnidades(e.target.value)} onKeyDown={enter} placeholder="Ej: 99" className={`${fieldClassSm} text-right tabular-nums`} />
          </label>
        </div>
        {error && (
          <p role="alert" className="m-0 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botonOscuro} disabled={pendiente} onClick={guardar}>
            {pendiente ? "Guardando…" : "Dejar pendiente para Dropi"}
          </button>
          <button type="button" className={botonClaro} disabled={pendiente} onClick={alCerrar}>
            Cancelar
          </button>
        </div>
      </div>
    </Ventana>
  );
}

/** El botón de la barra de la ficha: abre la ventana para privatizar (reservar) a un correo con el total de unidades. */
export function BotonPrivatizarCorreo({ p, deshabilitado }: { p: FilaPublicacion; deshabilitado: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <BotonAccion icono={CorreoIcon} tono="neutro" disabled={deshabilitado} onClick={() => setAbierta(true)}>
        Privatizar a un correo
      </BotonAccion>
      {abierta && <VentanaPrivatizarCorreo p={p} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

/**
 * «Stock reservado por correo» de la ficha (8 nov 2026, pedido de Alcides): las unidades de esta publicación que Dropi tiene apartadas para el correo de un
 * dropshipper (la pestaña «Productos privados» de Dropi), con lo que leyó la última actualización. En una pública la publicación sigue en el catálogo; en un
 * producto privado, es a quién se le asignó. Con permiso de escritura se cambian, se quitan o se agregan: quedan pendientes para «Aplicar en Dropi».
 */
export function ReservasPublicacion({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  const variable = p.stockPorId.some((x) => x.variable);
  const editable = puedeEscribir && !variable && !!p.dropiId.trim() && !p.sinPublicar && !p.archivada && !p.duplicadaDe;
  const sePuedeAgregar = editable && p.tipoDropi !== "privado";
  if (!p.reservas.length && !p.reservasPendientes.length && !sePuedeAgregar) return null;
  const total = p.reservas.reduce((t, r) => t + r.unidades, 0);
  return (
    <Seccion icono={CandadoAbiertoIcon} titulo="Stock reservado por correo">
      {p.reservas.length > 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          {p.tipoDropi === "privado"
            ? "Producto privado en Dropi: solo lo ven estos correos."
            : `Publicación pública: sigue en el catálogo, pero ${total.toLocaleString("es-PA")} ${total === 1 ? "unidad está apartada" : "unidades están apartadas"} para estos correos.`}
        </p>
      )}
      {p.reservas.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {p.reservas.map((r, i) => (
            <FilaReserva key={r.id ?? `${r.correo}-${i}`} p={p} r={r} editable={editable} />
          ))}
        </ul>
      )}
      {p.reservasPendientes.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
          {p.reservasPendientes.map((r) => (
            <li key={r.correo} className="flex items-start gap-1.5">
              <span aria-hidden="true" className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${r.error ? "bg-destructive" : "bg-warning"}`} />
              <span>
                {r.unidades === 0 ? `Quitar la reserva de ${quienReserva({ ...r })}` : `${quienReserva({ ...r })}: ${r.unidades.toLocaleString("es-PA")} u. reservadas`}
                {r.error ? ` · no se pudo: ${r.error}` : " · pendiente para «Aplicar en Dropi»"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {variable && puedeEscribir && <p className="m-0 text-xs text-muted-foreground">Tiene variaciones: la reserva es por variación y por ahora se cambia en Dropi.</p>}
      {sePuedeAgregar && <AgregarReserva p={p} />}
    </Seccion>
  );
}
