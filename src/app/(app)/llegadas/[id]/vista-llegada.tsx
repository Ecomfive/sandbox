"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { etiquetaEtapa } from "../../compras/def-compras";
import { textoProductos, totalesDeLlegada, type FilaLlegada, type TipoLlegada } from "@/lib/compras/llegadas-avisos";
import type { EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { registrarPagoLlegada, registrarPagoTotalLlegada } from "../actions";

const entero = (n: number) => n.toLocaleString("es-PA");
const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * La lista de una llegada de compras. En «Llegada a Puerto» (Logística): cada compra con su producto, unidades, cajas y etiqueta de las cajas, y los totales. En «En Bodega» (Pagos): cada
 * compra con el monto de su segundo pago, el total a pagar y «Registrar pago» (la compra pasa a Completado).
 */
export function VistaLlegada({
  llegadaId,
  tipo,
  filas,
  etiquetas,
  verMontos,
  puedePagar,
  hoy,
  avisadaPor,
  avisadaEn,
}: {
  llegadaId: string;
  tipo: TipoLlegada;
  filas: FilaLlegada[];
  etiquetas: Record<string, EtiquetaPedido[]>;
  verMontos: boolean;
  puedePagar: boolean;
  hoy: string;
  avisadaPor: string | null;
  avisadaEn: string;
}) {
  const t = totalesDeLlegada(filas);
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null);
  const puerto = tipo === "puerto";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h2 className="m-0 text-base font-semibold tracking-tight">{puerto ? "Llega a puerto" : "Llegó a bodega"}</h2>
        <p className="m-0 text-sm text-muted-foreground">
          Avisado {avisadaPor ? `por ${avisadaPor} ` : ""}el {fechaHora(avisadaEn)}.
        </p>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Dato nombre="Compras" valor={entero(t.compras)} />
          <Dato nombre="Unidades" valor={entero(t.unidades)} />
          {puerto ? (
            <Dato nombre="Cajas" valor={t.sinCajas ? `${entero(t.cajas)} (${entero(t.sinCajas)} sin anotar)` : entero(t.cajas)} />
          ) : verMontos ? (
            <>
              <Dato nombre="Total a pagar" valor={dinero(t.porPagar)} fuerte />
              {t.pagado > 0 && <Dato nombre="Ya pagado" valor={dinero(t.pagado)} />}
              {t.sinMonto > 0 && <Dato nombre="Sin monto" valor={`${entero(t.sinMonto)} ${t.sinMonto === 1 ? "compra" : "compras"}`} />}
            </>
          ) : null}
        </dl>
        {!puerto && puedePagar && verMontos && t.pendientes > 0 && <PagoTotal llegadaId={llegadaId} compras={t.pendientes} monto={t.porPagar} sinMonto={t.sinMonto} hoy={hoy} />}
      </header>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">Esta llegada no tiene compras.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {filas.map((f) =>
            puerto ? (
              <FilaPuerto key={f.compraId} fila={f} etiquetas={etiquetas[f.compraId] ?? []} abrir={(e, alt) => setFoto({ src: e.url, alt })} />
            ) : (
              <FilaBodega key={f.compraId} llegadaId={llegadaId} fila={f} verMontos={verMontos} puedePagar={puedePagar} hoy={hoy} />
            ),
          )}
        </ul>
      )}
      <VisorImagen src={foto?.src ?? null} alt={foto?.alt} onClose={() => setFoto(null)} />
    </div>
  );
}

/** «Pago total»: la llegada se paga completa, así que se registran de una vez todas las compras que faltan, cada una con su monto de segundo pago y el mismo día. */
function PagoTotal({ llegadaId, compras, monto, sinMonto, hoy }: { llegadaId: string; compras: number; monto: number; sinMonto: number; hoy: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [diaPago, setDiaPago] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const registrar = () => {
    setError(null);
    startTransition(async () => {
      const r = await registrarPagoTotalLlegada(llegadaId, diaPago);
      if (r.error) {
        setError(r.error);
        if (r.pagadas) router.refresh();
        return;
      }
      mostrarToast(`Pago total registrado: ${r.pagadas} ${r.pagadas === 1 ? "compra pasó" : "compras pasaron"} a Completado.`);
      setAbierto(false);
      router.refresh();
    });
  };

  if (!abierto) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="min-h-10 cursor-pointer rounded-md bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Registrar pago total · {dinero(monto)}
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-md bg-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        registrar();
      }}
    >
      <p className="m-0 text-sm">
        Se registrará el pago de <b>{compras}</b> {compras === 1 ? "compra" : "compras"} por <b>{dinero(monto)}</b> (el segundo pago de cada una) y pasarán a Completado.
      </p>
      {sinMonto > 0 && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {sinMonto === 1 ? "Una compra no tiene" : `${sinMonto} compras no tienen`} monto de segundo pago: regístralas una por una con el monto que pagaste.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Día del pago
          <input type="date" required max={hoy} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} className={`${fieldClass} w-44`} />
        </label>
        <button type="submit" disabled={pendiente || sinMonto > 0} className="min-h-10 cursor-pointer rounded-md bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {pendiente ? "Registrando…" : "Registrar pago total y completar"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setAbierto(false)} className="min-h-10 cursor-pointer rounded-md border border-border bg-card px-3 text-sm hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

export function Dato({ nombre, valor, fuerte = false }: { nombre: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className={`m-0 tabular-nums ${fuerte ? "text-base font-semibold" : "font-medium"}`}>{valor}</dd>
    </div>
  );
}

export function Producto({ fila }: { fila: FilaLlegada }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm font-medium">{textoProductos(fila)}</span>
      <span className="truncate text-xs text-muted-foreground">
        {fila.orden}
        {fila.codigo ? ` · ${fila.codigo}` : ""} · {etiquetaEtapa(fila.etapa)}
        {fila.llegadaEn ? ` · llegó ${fechaHora(fila.llegadaEn)}` : ""}
      </span>
    </div>
  );
}

export function FilaPuerto({ fila, etiquetas, abrir }: { fila: FilaLlegada; etiquetas: EtiquetaPedido[]; abrir: (e: EtiquetaPedido, alt: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      {fila.foto ? (
        <button
          type="button"
          onClick={() => abrir({ ruta: fila.foto!, url: fila.foto! }, `Foto de ${textoProductos(fila)}`)}
          className="h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Ver la foto de ${textoProductos(fila)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fila.foto} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-md border border-dashed border-border" />
      )}
      <Producto fila={fila} />
      <div className="flex gap-6 text-sm tabular-nums">
        <span>
          <span className="block text-xs text-muted-foreground">Unidades</span>
          {fila.unidades == null ? "—" : entero(fila.unidades)}
        </span>
        <span>
          <span className="block text-xs text-muted-foreground">Cajas</span>
          {fila.cajas == null ? <Badge tone="warning">Sin anotar</Badge> : entero(fila.cajas)}
        </span>
      </div>
      <div className="flex min-w-24 flex-wrap items-center gap-2">
        {etiquetas.length === 0 ? (
          <span className="text-xs text-muted-foreground">{fila.etiquetasRutas.length > 0 ? "No se pudo cargar la etiqueta" : "Sin etiqueta"}</span>
        ) : (
          etiquetas.map((e, i) => (
            <button
              key={e.ruta}
              type="button"
              onClick={() => abrir(e, `Etiqueta de las cajas de ${textoProductos(fila)}`)}
              className="h-14 w-14 cursor-pointer overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={`Ver la etiqueta ${i + 1} de las cajas de ${textoProductos(fila)}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))
        )}
      </div>
    </li>
  );
}

function FilaBodega({ llegadaId, fila, verMontos, puedePagar, hoy }: { llegadaId: string; fila: FilaLlegada; verMontos: boolean; puedePagar: boolean; hoy: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(fila.segundoPago == null ? "" : String(fila.segundoPago));
  const [diaPago, setDiaPago] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const pagada = !!fila.pagadoEn;

  const registrar = () => {
    setError(null);
    startTransition(async () => {
      const r = await registrarPagoLlegada(llegadaId, fila.compraId, monto, diaPago);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(`Pago registrado: ${fila.orden} pasó a Completado.`);
      setAbierto(false);
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Producto fila={fila} />
        <div className="flex gap-6 text-sm tabular-nums">
          <span>
            <span className="block text-xs text-muted-foreground">Unidades</span>
            {fila.unidades == null ? "—" : entero(fila.unidades)}
          </span>
          <span>
            <span className="block text-xs text-muted-foreground">Segundo pago</span>
            {!verMontos ? "—" : fila.segundoPago == null ? <Badge tone="warning">Sin monto</Badge> : dinero(fila.segundoPago)}
          </span>
        </div>
        <div className="flex min-w-32 items-center justify-end">
          {pagada ? (
            <Badge tone="success">
              Pagado {fila.montoPagado != null && verMontos ? dinero(fila.montoPagado) : ""} · {dia(fila.pagadoEn!)}
            </Badge>
          ) : puedePagar && !abierto ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="cursor-pointer rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Registrar pago
            </button>
          ) : null}
        </div>
      </div>
      {pagada && fila.pagadoPor && <p className="m-0 text-xs text-muted-foreground">Lo registró {fila.pagadoPor}.</p>}
      {abierto && !pagada && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-md bg-muted p-3"
          onSubmit={(e) => {
            e.preventDefault();
            registrar();
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium">
            Monto pagado
            <input type="number" inputMode="decimal" step="0.01" min="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} className={`${fieldClass} w-40 tabular-nums`} placeholder="Ej: 1500.00" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Día del pago
            <input type="date" required max={hoy} value={diaPago} onChange={(e) => setDiaPago(e.target.value)} className={`${fieldClass} w-44`} />
          </label>
          <button type="submit" disabled={pendiente} className="cursor-pointer rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {pendiente ? "Registrando…" : "Registrar y completar"}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className="cursor-pointer rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Cancelar
          </button>
          {error && (
            <p role="alert" className="m-0 basis-full text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
