"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { totalesDeLlegada, type FilaLlegada, type TipoLlegada } from "@/lib/compras/llegadas-avisos";
import type { EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { Dato, FilaPuerto, Producto } from "./[id]/vista-llegada";

const entero = (n: number) => n.toLocaleString("es-PA");
const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });

/**
 * Todas las llegadas de un periodo en una sola lista (17 nov 2026, pedido de Logística: «una lista completa de lo que llegó a puerto», no un aviso por compra). A puerto: producto, unidades,
 * cajas y etiqueta de cada compra y los totales. A bodega: el segundo pago de cada una y si ya está pagado. Solo se mira: para registrar un pago se abre la llegada de la compra.
 */
export function ListaLlegadas({
  tipo,
  filas,
  etiquetas,
  verMontos,
  periodo,
}: {
  tipo: TipoLlegada;
  filas: FilaLlegada[];
  etiquetas: Record<string, EtiquetaPedido[]>;
  verMontos: boolean;
  periodo: string;
}) {
  const t = totalesDeLlegada(filas);
  const [foto, setFoto] = useState<{ src: string; alt: string } | null>(null);
  const puerto = tipo === "puerto";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h2 className="m-0 text-base font-semibold tracking-tight">{puerto ? "Llegó a puerto" : "Llegó a bodega"}</h2>
        <p className="m-0 text-sm text-muted-foreground">{periodo}</p>
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Dato nombre="Compras" valor={entero(t.compras)} />
          <Dato nombre="Unidades" valor={entero(t.unidades)} />
          {puerto ? (
            <Dato nombre="Cajas" valor={t.sinCajas ? `${entero(t.cajas)} (${entero(t.sinCajas)} sin anotar)` : entero(t.cajas)} />
          ) : verMontos ? (
            <>
              <Dato nombre="Por pagar" valor={dinero(t.porPagar)} fuerte />
              {t.pagado > 0 && <Dato nombre="Ya pagado" valor={dinero(t.pagado)} />}
              {t.sinMonto > 0 && <Dato nombre="Sin monto" valor={`${entero(t.sinMonto)} ${t.sinMonto === 1 ? "compra" : "compras"}`} />}
            </>
          ) : null}
        </dl>
      </header>

      {filas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No hay llegadas en este periodo.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          {filas.map((f) =>
            puerto ? (
              <FilaPuerto key={f.compraId} fila={f} etiquetas={etiquetas[f.compraId] ?? []} abrir={(e, alt) => setFoto({ src: e.url, alt })} />
            ) : (
              <FilaBodegaLectura key={f.compraId} fila={f} verMontos={verMontos} />
            ),
          )}
        </ul>
      )}
      <VisorImagen src={foto?.src ?? null} alt={foto?.alt} onClose={() => setFoto(null)} />
    </div>
  );
}

function FilaBodegaLectura({ fila, verMontos }: { fila: FilaLlegada; verMontos: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
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
      <div className="flex min-w-32 flex-col items-end gap-1">
        {fila.pagadoEn ? (
          <Badge tone="success">
            Pagado {fila.montoPagado != null && verMontos ? dinero(fila.montoPagado) : ""} · {dia(fila.pagadoEn)}
          </Badge>
        ) : (
          <>
            <Badge tone="warning">Por pagar</Badge>
            {fila.llegadaId && (
              <Link href={`/llegadas/${fila.llegadaId}`} className="text-xs font-medium text-primario underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Abrir para pagar
              </Link>
            )}
          </>
        )}
      </div>
    </li>
  );
}
