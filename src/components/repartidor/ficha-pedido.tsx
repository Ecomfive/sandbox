"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { entregarPedido, noEntregarPedido } from "@/app/repartidor/actions";
import { useToast } from "@/components/ui/toast";
import type { PedidoRuta } from "@/lib/despacho/datos-repartidor";
import { FORMAS_PAGO, MOTIVOS, plata, type FormaPago } from "@/lib/despacho/panel-repartidor";
import { PastillaEstado, enlaceMapa, telefonoLimpio } from "./piezas";

/** La ubicación del celular, si la da en unos segundos (no frena la entrega si no). */
function pedirUbicacion(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolver) => {
    const tope = setTimeout(() => resolver(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(tope);
        resolver({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(tope);
        resolver(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

const textoEstado = (estado: string | null) => {
  const e = (estado ?? "").toUpperCase();
  if (e === "RECOLECTADO") return "recolectado en bodega";
  if (e === "ENTREGADO") return "entregado";
  if (e === "POSPUESTO") return "pospuesto";
  if (e === "FALLIDO") return "fallido";
  return "en ruta";
};

/** Cerrar (×) de las hojas. */
function Cerrar({ alCerrar }: { alCerrar: () => void }) {
  return (
    <button type="button" onClick={alCerrar} aria-label="Cerrar" className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[#3f3f46]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** La foto elegida (comprobante o evidencia), con su vista previa y el botón para tomarla. */
function Foto({ id, foto, alElegir, texto, tieneGuardadas }: { id: string; foto: File | null; alElegir: (f: File | null) => void; texto: string; tieneGuardadas: number }) {
  // La vista previa local de la foto; se suelta al cambiarla o al cerrar la hoja.
  const url = useMemo(() => (foto ? URL.createObjectURL(foto) : null), [foto]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2.5">
      <div className="flex h-[88px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#b38ad9] bg-primario-suave text-center text-[11px] text-[#5b2386]">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) de la foto que se va a subir */}
        {url ? <img src={url} alt="Foto elegida" className="h-full w-full object-cover" /> : tieneGuardadas ? `${tieneGuardadas} foto${tieneGuardadas === 1 ? "" : "s"} ya guardada${tieneGuardadas === 1 ? "" : "s"}` : "Sin foto"}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="flex min-h-10 cursor-pointer items-center justify-center rounded-[10px] border border-[#dcc6f3] bg-white text-[13px] font-semibold text-[#5b2386]">
          {foto ? "Tomar otra foto" : texto}
        </label>
        <input id={id} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => alElegir(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}

/** Hoja «Entregar #…» (pantalla 3 del prototipo): forma de pago, monto, comprobante y confirmar. */
function HojaEntregado({ pedido, alCerrar }: { pedido: PedidoRuta; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [forma, setForma] = useState<FormaPago>("efectivo");
  const [monto, setMonto] = useState(pedido.porCobrar !== null ? pedido.porCobrar.toFixed(2) : "");
  const [foto, setFoto] = useState<File | null>(null);
  const [numero, setNumero] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nombreForma = FORMAS_PAGO.find((f) => f.id === forma)!.nombre.replace(" (tarjeta)", "");
  const montoN = Number(monto.replace(",", "."));
  const igual = pedido.porCobrar !== null && Number.isFinite(montoN) && Math.abs(montoN - pedido.porCobrar) < 0.005;

  async function confirmar() {
    setEnviando(true);
    const d = new FormData();
    d.set("forma", forma);
    d.set("monto", monto);
    if (numero.trim()) d.set("numero", numero.trim());
    if (foto) d.append("foto", foto);
    const u = await pedirUbicacion();
    if (u) {
      d.set("lat", String(u.lat));
      d.set("lng", String(u.lng));
    }
    const r = await entregarPedido(pedido.itemId, d);
    setEnviando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast(`#${pedido.numero} entregado.`);
    router.push("/repartidor");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <b className="text-lg">Entregar #{pedido.numero}</b>
          <span className="text-xs text-[#636363]">
            {(pedido.tienda ?? "Sin tienda").toUpperCase()} · {pedido.cliente?.corregimiento?.trim() || "Sin zona"} · por cobrar {plata(pedido.porCobrar)}
          </span>
        </div>
        <Cerrar alCerrar={alCerrar} />
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-semibold text-[#3f3f46]">¿Cómo pagó el cliente?</legend>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGO.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={forma === f.id}
              onClick={() => setForma(f.id)}
              className={`min-h-12 rounded-xl text-[15px] font-semibold ${forma === f.id ? "border-2 border-primario bg-primario-suave text-[#5b2386]" : "border border-[#e3e3e3] bg-white text-[#3f3f46]"}`}
            >
              {f.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-[#3f3f46]">Monto cobrado</span>
        <span className="flex min-h-12 items-center rounded-[10px] border border-[#8a8a8a] px-3 text-lg font-bold">
          $
          <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" aria-label="Monto cobrado" className="ml-1 w-full border-0 bg-transparent text-lg font-bold outline-0" />
        </span>
        {pedido.porCobrar !== null && <span className={`text-xs ${igual ? "text-[#15803d]" : "text-[#b45309]"}`}>{igual ? "Igual a lo que había que cobrar" : `Había que cobrar ${plata(pedido.porCobrar)}`}</span>}
      </label>

      {forma !== "efectivo" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[#3f3f46]">
            Comprobante de {nombreForma} <span className="text-[#be123c]">*</span>
          </span>
          <Foto id={`comprobante-${pedido.itemId}`} foto={foto} alElegir={setFoto} texto="Tomar foto" tieneGuardadas={pedido.comprobantes} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[#636363]">N.º de comprobante (opcional)</span>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} placeholder="Ej. 8734521" className="min-h-9 rounded-lg border border-[#8a8a8a] px-2.5 text-sm" />
          </label>
        </div>
      )}

      <p className="m-0 rounded-[10px] bg-[#fafafa] px-2.5 py-2 text-xs text-[#636363]">
        Se guardan solas la hora de la entrega y tu ubicación. En Despacho ciudad el pedido pasa a{" "}
        <b>
          ENTREGADO · {FORMAS_PAGO.find((f) => f.id === forma)!.etiqueta.toUpperCase()} · PAGADO
        </b>{" "}
        al instante.
      </p>

      <button type="button" onClick={confirmar} disabled={enviando} className="min-h-[52px] rounded-xl bg-[#15803d] text-base font-bold text-white disabled:opacity-60">
        {enviando ? "Guardando…" : "Confirmar entrega"}
      </button>
    </div>
  );
}

/** Hoja «No se entregó #…» (pantalla 4 del prototipo): pospuesto o fallido, motivo, fecha, comentario y evidencia. */
function HojaNoEntregado({ pedido, inicial, fechas, alCerrar }: { pedido: PedidoRuta; inicial: "POSPUESTO" | "FALLIDO"; fechas: { iso: string; texto: string }[]; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [tipo, setTipo] = useState(inicial);
  const [motivo, setMotivo] = useState<string>(MOTIVOS[0]);
  const [fecha, setFecha] = useState(fechas[0]?.iso ?? "");
  const [otra, setOtra] = useState(false);
  const [comentario, setComentario] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const producto = pedido.productos[0] ?? "";

  async function guardar() {
    setEnviando(true);
    const d = new FormData();
    d.set("tipo", tipo);
    d.set("motivo", motivo);
    if (comentario.trim()) d.set("comentario", comentario.trim());
    if (tipo === "POSPUESTO") d.set("fecha", fecha);
    if (foto) d.append("foto", foto);
    const u = await pedirUbicacion();
    if (u) {
      d.set("lat", String(u.lat));
      d.set("lng", String(u.lng));
    }
    const r = await noEntregarPedido(pedido.itemId, d);
    setEnviando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast(tipo === "POSPUESTO" ? `#${pedido.numero} pospuesto.` : `#${pedido.numero} marcado fallido.`);
    router.push("/repartidor");
    router.refresh();
  }

  const chip = (activo: boolean) => `min-h-[38px] rounded-full px-3 text-[13px] ${activo ? "border-2 border-primario bg-primario-suave font-semibold text-[#5b2386]" : "border border-[#e3e3e3] bg-white font-medium text-[#3f3f46]"}`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-col">
          <b className="text-lg">No se entregó #{pedido.numero}</b>
          <span className="truncate text-xs text-[#636363]">
            {(pedido.tienda ?? "Sin tienda").toUpperCase()}
            {producto ? ` · ${producto}` : ""}
          </span>
        </div>
        <Cerrar alCerrar={alCerrar} />
      </div>

      <div role="group" aria-label="Qué pasó" className="grid grid-cols-2 rounded-xl border border-[#e3e3e3] bg-[#fafafa] p-[3px]">
        {(["POSPUESTO", "FALLIDO"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => setTipo(t)}
            className={`min-h-[42px] rounded-[9px] text-sm ${tipo === t ? "bg-white font-bold text-[#18181b] shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "bg-transparent font-semibold text-[#636363]"}`}
          >
            {t === "POSPUESTO" ? "Pospuesto" : "Fallido"}
          </button>
        ))}
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-xs font-semibold text-[#3f3f46]">Motivo</legend>
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={chip(motivo === m)}>
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      {tipo === "POSPUESTO" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-[#3f3f46]">¿Para cuándo queda?</span>
          <span className="flex gap-1.5">
            {fechas.map((f) => (
              <button
                key={f.iso}
                type="button"
                aria-pressed={!otra && fecha === f.iso}
                onClick={() => {
                  setOtra(false);
                  setFecha(f.iso);
                }}
                className={`min-h-10 flex-1 rounded-[10px] text-[13px] ${!otra && fecha === f.iso ? "border-2 border-primario bg-primario-suave font-semibold text-[#5b2386]" : "border border-[#e3e3e3] bg-white font-medium text-[#3f3f46]"}`}
              >
                {f.texto}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={otra}
              onClick={() => setOtra(true)}
              className={`min-h-10 flex-1 rounded-[10px] text-[13px] ${otra ? "border-2 border-primario bg-primario-suave font-semibold text-[#5b2386]" : "border border-[#e3e3e3] bg-white font-medium text-[#3f3f46]"}`}
            >
              Otra fecha
            </button>
          </span>
          {otra && <input type="date" aria-label="Otra fecha" value={fecha} min={fechas[0]?.iso} onChange={(e) => setFecha(e.target.value)} className="min-h-10 rounded-[10px] border border-[#8a8a8a] px-2.5 text-sm" />}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-[#3f3f46]">Comentario</span>
        <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} placeholder={motivo} className="resize-none rounded-[10px] border border-[#8a8a8a] px-2.5 py-2 text-sm" />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">
          Evidencia <span className="font-medium text-[#636363]">(obligatoria si es fallido)</span>
        </span>
        <Foto id={`evidencia-${pedido.itemId}`} foto={foto} alElegir={setFoto} texto="Tomar foto" tieneGuardadas={pedido.comprobantes} />
        <span className="text-xs text-[#636363]">Foto de la llamada, del chat o de la puerta. Un fallido con evidencia se te paga; un pospuesto, no.</span>
      </div>

      <p className="m-0 rounded-[10px] bg-[#fafafa] px-2.5 py-2 text-xs text-[#636363]">
        {tipo === "POSPUESTO"
          ? `Queda en Despacho ciudad con tu motivo, para que Atención al cliente de ${pedido.tiendaTitulo} hable con el cliente. El pedido pasa al día que elegiste.`
          : `Queda en Despacho ciudad con tu motivo y la evidencia, para que Atención al cliente de ${pedido.tiendaTitulo} hable con el cliente.`}
      </p>

      <button type="button" onClick={guardar} disabled={enviando} className="min-h-[52px] rounded-xl bg-primario text-base font-bold text-white disabled:opacity-60">
        {enviando ? "Guardando…" : tipo === "POSPUESTO" ? "Guardar pospuesto" : "Guardar fallido"}
      </button>
    </div>
  );
}

/** La ficha del pedido (pantalla 2 del prototipo) con sus dos hojas. */
export function FichaPedidoRepartidor({ pedido, fechas }: { pedido: PedidoRuta; fechas: { iso: string; texto: string }[] }) {
  const [hoja, setHoja] = useState<null | "entregado" | "POSPUESTO" | "FALLIDO">(null);
  const tel = telefonoLimpio(pedido.cliente?.telefono);
  const mapa = enlaceMapa(pedido.cliente?.direccion, pedido.cliente?.corregimiento);
  const cobrar = pedido.porCobrar ?? 0;
  const seccion = "text-[11px] font-semibold tracking-[0.04em] text-[#636363]";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2.5 border-b border-[#e3e3e3] bg-white px-4 py-3.5">
        <Link href="/repartidor" aria-label="Volver a mi ruta" className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[#18181b]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="flex flex-1 flex-col">
          <b className="text-[17px]">#{pedido.numero}</b>
          <span className="text-xs text-[#636363]">
            {(pedido.tienda ?? "Sin tienda").toUpperCase()} · {textoEstado(pedido.estado)}
          </span>
        </div>
        <PastillaEstado estado={pedido.estado} />
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <section className="flex items-center justify-between rounded-2xl bg-primario px-4 py-3.5 text-white">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs opacity-90">{pedido.seccion === "entregados" ? "Cobrado" : "Cobrar al entregar"}</span>
            <b className="text-[28px] leading-tight">{plata(pedido.seccion === "entregados" ? (pedido.cobrado ?? cobrar) : cobrar)}</b>
          </div>
          <span className="text-right text-xs opacity-95">
            {pedido.seccion === "entregados" && pedido.formaPago ? (
              pedido.formaPago
            ) : (
              <>
                Contra entrega
                <br />
                efectivo, Yappy o MiPOS
              </>
            )}
          </span>
        </section>

        <section className="flex flex-col gap-2.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className={seccion}>CLIENTE</span>
            <span className="text-[15px] font-semibold">{pedido.cliente?.nombre?.trim() || "Sin nombre en el pedido"}</span>
            <span className="text-[13px] text-[#3f3f46]">{pedido.cliente?.telefono ? `Tel. ${pedido.cliente.telefono}` : "Sin teléfono"}</span>
          </div>
          {tel && (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${tel.tel}`} className="flex min-h-11 items-center justify-center rounded-[10px] border border-[#dcc6f3] bg-primario-suave text-sm font-semibold text-[#5b2386] no-underline">
                Llamar
              </a>
              <a href={tel.wa} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-[10px] border border-[#dcc6f3] bg-primario-suave text-sm font-semibold text-[#5b2386] no-underline">
                WhatsApp
              </a>
            </div>
          )}
          <div className="h-px bg-[#e3e3e3]" />
          <div className="flex flex-col gap-0.5">
            <span className={seccion}>DIRECCIÓN</span>
            <span className="text-sm">{[pedido.cliente?.corregimiento?.trim(), pedido.cliente?.direccion?.trim()].filter(Boolean).join(" · ") || "Sin dirección en el pedido"}</span>
            {pedido.cliente?.notas?.trim() && <span className="text-xs text-[#636363]">{pedido.cliente.notas}</span>}
          </div>
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-[10px] border border-[#e3e3e3] bg-white text-sm font-semibold text-[#18181b] no-underline">
              Abrir en Google Maps o Waze
            </a>
          )}
        </section>

        <section className="flex flex-col gap-1.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-3">
          <span className={seccion}>LLEVAS</span>
          {pedido.productos.length ? pedido.productos.map((p, i) => <span key={i} className="text-sm">{p}</span>) : <span className="text-sm text-[#636363]">El pedido no tiene el detalle de productos en el sistema.</span>}
          <span className="text-xs text-[#636363]">Revisa que sea este producto antes de entregar.</span>
        </section>

        {pedido.notaEquipo && (
          <section className="flex flex-col gap-0.5 rounded-[14px] border border-[#f4d58a] bg-[#fef3c7] px-3.5 py-2.5">
            <span className="text-[11px] font-semibold tracking-[0.04em] text-[#8a4b08]">NOTA DE ATENCIÓN AL CLIENTE</span>
            <span className="text-[13px] text-[#3f3f46]">{pedido.notaEquipo}</span>
          </section>
        )}

        {pedido.comentario && pedido.seccion !== "ruta" && (
          <section className="flex flex-col gap-0.5 rounded-[14px] border border-[#e3e3e3] bg-white px-3.5 py-2.5">
            <span className={seccion}>LO QUE ANOTASTE</span>
            <span className="text-[13px] text-[#3f3f46]">{pedido.comentario}</span>
          </section>
        )}
      </div>

      <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-[#e3e3e3] bg-white px-3.5 pt-3 pb-4">
        <button type="button" onClick={() => setHoja("entregado")} className="col-span-2 flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#15803d] text-base font-bold text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
          Entregado
        </button>
        <button type="button" onClick={() => setHoja("POSPUESTO")} className="min-h-[46px] rounded-xl border border-[#e3e3e3] bg-white text-sm font-semibold text-[#3f3f46]">
          Pospuesto
        </button>
        <button type="button" onClick={() => setHoja("FALLIDO")} className="min-h-[46px] rounded-xl border border-[#f3b4c2] bg-[#ffe4e6] text-sm font-semibold text-[#be123c]">
          Fallido
        </button>
      </div>

      {hoja && (
        <div role="dialog" aria-modal="true" aria-label={hoja === "entregado" ? "Marcar entregado" : "No se entregó"} className="fixed inset-0 z-50 flex justify-center bg-[rgba(24,24,27,0.45)]">
          <div className="mt-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col gap-3.5 overflow-y-auto rounded-t-[22px] bg-white px-[18px] pt-2.5 pb-[18px]">
            <div className="h-[5px] w-11 self-center rounded-full bg-[#d4d4d8]" />
            {hoja === "entregado" ? (
              <HojaEntregado pedido={pedido} alCerrar={() => setHoja(null)} />
            ) : (
              <HojaNoEntregado key={hoja} pedido={pedido} inicial={hoja} fechas={fechas} alCerrar={() => setHoja(null)} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
