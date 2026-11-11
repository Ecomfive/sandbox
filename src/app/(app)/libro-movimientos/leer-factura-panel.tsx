"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClass, labelClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { dinero, porcentaje } from "@/lib/af4/formato";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { AdjuntoIcon, CalendarioIcon, ExtractoIcon, TiendaIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { crearMovimientoDeFactura, descartarFactura, leerFactura, prepararSubidaFactura, type LecturaFactura } from "./factura-actions";

const ACEPTA = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf";
const MAX = 15 * 1024 * 1024;

interface Datos {
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
  monto: string;
  mes: string;
  fecha_pago: string;
  cuenta_id: string;
  factura_numero: string;
  ruc: string;
  dv: string;
  en_eerr: boolean;
  en_flujo: boolean;
}

const botonBarra = `inline-flex min-h-8 items-center gap-1.5 !rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted ${anilloFoco}`;

/**
 * «Leer factura»: se sube un PDF o una foto, la API de Anthropic lee proveedor, RUC, fecha, monto e ITBMS, el sistema
 * sugiere la tienda y el tipo, y la persona revisa todo antes de guardar. La factura queda como comprobante del
 * movimiento. Sin `ANTHROPIC_API_KEY` el panel lo avisa y no hace nada.
 */
export function LeerFacturaPanel({ disponible, tiendas, tipos, cuentas, mes }: { disponible: boolean; tiendas: Opcion[]; tipos: Opcion[]; cuentas: Opcion[]; mes: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<"elegir" | "leyendo" | "revisar">("elegir");
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<{ ruta: string; nombre: string } | null>(null);
  const [lectura, setLectura] = useState<LecturaFactura | null>(null);
  const [d, setD] = useState<Datos | null>(null);
  const [pendiente, empezar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const cambiar = (c: Partial<Datos>) => setD((x) => (x ? { ...x, ...c } : x));

  function reiniciar() {
    setPaso("elegir");
    setError(null);
    setArchivo(null);
    setLectura(null);
    setD(null);
  }

  function cerrar() {
    if (archivo && paso !== "elegir") void descartarFactura(archivo.ruta);
    reiniciar();
    setAbierto(false);
  }

  async function subirYLeer(f: File) {
    setError(null);
    if (f.size > MAX) {
      setError("El archivo pesa más de 15 MB.");
      return;
    }
    setPaso("leyendo");
    const permiso = await prepararSubidaFactura(f.name).catch(() => ({ error: "Se cortó la conexión." }));
    if ("error" in permiso) {
      setError(permiso.error);
      setPaso("elegir");
      return;
    }
    const { error: e } = await supabase.storage.from("fin-comprobantes").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type || "application/octet-stream" });
    if (e) {
      setError("No se pudo subir el archivo.");
      setPaso("elegir");
      return;
    }
    setArchivo({ ruta: permiso.ruta, nombre: f.name });
    const r = await leerFactura(permiso.ruta).catch(() => ({ error: "Se cortó la conexión." }));
    if ("error" in r) {
      setError(r.error);
      await descartarFactura(permiso.ruta);
      setArchivo(null);
      setPaso("elegir");
      return;
    }
    const fa = r.factura;
    setLectura(r);
    setD({
      unidad_id: r.sugerencia.unidad_id ?? "",
      tipo_id: r.sugerencia.tipo_id ?? "",
      descripcion: r.descripcion,
      monto: fa.total !== null ? Math.abs(fa.total).toFixed(2) : "",
      mes: (fa.fecha ?? mes).slice(0, 7),
      fecha_pago: fa.fecha ?? "",
      cuenta_id: "",
      factura_numero: fa.numero ?? "",
      ruc: fa.ruc ?? "",
      dv: fa.dv ?? "",
      en_eerr: true,
      en_flujo: true,
    });
    setPaso("revisar");
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    setError(null);
    const f = new FormData();
    for (const [k, v] of Object.entries(d)) f.set(k, typeof v === "boolean" ? (v ? "si" : "") : v);
    if (archivo) {
      f.set("ruta", archivo.ruta);
      f.set("nombre_archivo", archivo.nombre);
    }
    empezar(async () => {
      const r = await crearMovimientoDeFactura(f).catch(() => ({ error: "No se pudo guardar." }) as { error?: string; aviso?: string });
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(r.aviso ?? "Movimiento registrado desde la factura", r.aviso ? "destructive" : undefined);
      reiniciar();
      setAbierto(false);
      router.refresh();
    });
  }

  const ruc = d?.ruc.trim() ? validarRucDv(d.ruc, d.dv) : null;
  const tienda = tiendas.find((t) => t.id === lectura?.sugerencia.unidad_id);
  const tipo = tipos.find((t) => t.id === lectura?.sugerencia.tipo_id);

  return (
    <>
      <button type="button" className={botonBarra} onClick={() => setAbierto(true)}>
        <ExtractoIcon className="h-4 w-4" />
        Leer factura
      </button>
      <Ventana abierto={abierto} alCerrar={() => !pendiente && cerrar()} lado="derecha" ancho="lg" titulo={<span className="text-lg font-semibold">Leer factura</span>}>
        <div className="flex flex-col gap-4 p-5">
          {!disponible && (
            <p role="alert" className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
              La lectura de facturas está apagada: falta configurar ANTHROPIC_API_KEY en el servidor.
            </p>
          )}
          {disponible && paso === "elegir" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="factura-archivo" className={labelClass}>
                Factura o recibo (PDF o foto)
              </label>
              <input
                ref={entrada}
                id="factura-archivo"
                type="file"
                accept={ACEPTA}
                data-enfocar
                className={fieldClass}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void subirYLeer(f);
                }}
              />
            </div>
          )}
          {paso === "leyendo" && <ProgresoCarga mensaje="Leyendo la factura…" />}
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {error}
            </p>
          )}
          {paso === "revisar" && d && lectura && (
            <form onSubmit={guardar} className="flex flex-col divide-y divide-border">
              <Seccion icono={AdjuntoIcon} titulo="Lo que se leyó">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {(
                    [
                      ["Proveedor", lectura.factura.proveedor ?? "—"],
                      ["Subtotal", lectura.factura.subtotal !== null ? dinero(lectura.factura.subtotal, lectura.factura.moneda, { decimales: 2 }) : "—"],
                      ["ITBMS", lectura.factura.itbms !== null ? dinero(lectura.factura.itbms, lectura.factura.moneda, { decimales: 2 }) : "—"],
                      ["Total", lectura.factura.total !== null ? dinero(lectura.factura.total, lectura.factura.moneda, { decimales: 2 }) : "—"],
                    ] as const
                  ).map(([t, v]) => (
                    <div key={t} className="flex flex-col gap-0.5">
                      <dt className="text-xs text-muted-foreground">{t}</dt>
                      <dd className={`font-medium ${t === "Proveedor" ? "" : claseCifra}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                {lectura.factura.moneda !== "USD" && (
                  <p className="flex items-center gap-1.5 text-sm">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                    La factura está en {lectura.factura.moneda}: escribe el monto en dólares.
                  </p>
                )}
                {lectura.sugerencia.confianza !== null && (tienda || tipo) && (
                  <p className="text-sm text-muted-foreground">
                    Sugerido: {[tienda?.nombre, tipo?.nombre].filter(Boolean).join(" · ")} ({porcentaje(lectura.sugerencia.confianza, { decimales: 0 })} de confianza)
                  </p>
                )}
              </Seccion>
              <Seccion icono={TiendaIcon} titulo="Movimiento">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Tienda</span>
                    <select value={d.unidad_id} onChange={(e) => cambiar({ unidad_id: e.target.value })} required className={`${fieldClass} w-full`}>
                      <option value="" disabled>
                        Elegir tienda
                      </option>
                      {tiendas.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Tipo</span>
                    <select value={d.tipo_id} onChange={(e) => cambiar({ tipo_id: e.target.value })} required className={`${fieldClass} w-full`}>
                      <option value="" disabled>
                        Elegir tipo
                      </option>
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Descripción</span>
                  <input value={d.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} required maxLength={500} className={`${fieldClass} w-full`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Monto (USD)</span>
                  <input type="number" inputMode="decimal" step="0.01" min="0.01" required value={d.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder="Ej: 107.00" className={`${fieldClass} w-full tabular-nums`} />
                </label>
              </Seccion>
              <Seccion icono={CalendarioIcon} titulo="Fechas y pago">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Mes del EERR</span>
                    <input type="month" required value={d.mes} onChange={(e) => cambiar({ mes: e.target.value })} className={`${fieldClass} w-full`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Fecha de pago</span>
                    <input type="date" value={d.fecha_pago} onChange={(e) => cambiar({ fecha_pago: e.target.value })} className={`${fieldClass} w-full`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Forma de pago</span>
                    <select value={d.cuenta_id} onChange={(e) => cambiar({ cuenta_id: e.target.value })} className={`${fieldClass} w-full`}>
                      <option value="">Sin forma de pago</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Seccion>
              <Seccion icono={ExtractoIcon} titulo="Factura">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>N° de factura</span>
                    <input value={d.factura_numero} onChange={(e) => cambiar({ factura_numero: e.target.value })} maxLength={80} className={`${fieldClass} w-full`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>RUC</span>
                    <input value={d.ruc} onChange={(e) => cambiar({ ruc: e.target.value })} maxLength={40} aria-invalid={ruc?.error ? true : undefined} className={`${fieldClass} w-full`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>DV</span>
                    <input value={d.dv} onChange={(e) => cambiar({ dv: e.target.value })} maxLength={2} inputMode="numeric" className={`${fieldClass} w-full`} />
                  </label>
                </div>
                {ruc && (
                  <p className="flex items-center gap-1.5 text-xs">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ruc.error ? "bg-destructive" : "bg-success"}`} />
                    {ruc.error ?? `RUC válido · DV ${ruc.dv}`}
                  </p>
                )}
              </Seccion>
              <Seccion icono={TiendaIcon} titulo="Dónde entra">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.en_eerr} onChange={(e) => cambiar({ en_eerr: e.target.checked })} className="h-4 w-4" />
                  Entra al Estado de resultados
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={d.en_flujo} onChange={(e) => cambiar({ en_flujo: e.target.checked })} className="h-4 w-4" />
                  Entra al flujo de caja
                </label>
              </Seccion>
              <div className="flex flex-wrap gap-2 pt-4">
                <button type="submit" disabled={pendiente || !!ruc?.error} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
                  {pendiente ? "Guardando..." : "Registrar movimiento"}
                </button>
                <button type="button" onClick={cerrar} disabled={pendiente} className={`rounded-md border border-border px-4 py-2 text-sm hover:bg-muted ${anilloFoco}`}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </Ventana>
    </>
  );
}
