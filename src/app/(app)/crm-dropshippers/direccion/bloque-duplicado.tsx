"use client";

import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { ETIQUETA_MOTIVO } from "@/lib/crm/automatizar";
import type { DuplicadoDeCliente } from "./datos-fase4";
import { Insignia } from "./piezas-direccion";

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "sin fecha");

const IconoDuplicado = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="8" y="8" width="13" height="13" rx="2.5" />
    <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" />
  </svg>
);

/**
 * El bloque «Posible duplicado» de la ficha de un cliente (3 nov 2026, pedido de Hernán: antes era la pestaña «Duplicados»): por qué se parece a otros
 * (mismo WhatsApp, correo, tienda o nombre) y las otras fichas, para abrirlas. Los números no se muestran. Unirlos o corregirlos se hace a mano desde la ficha.
 * `abrirAqui` dice si esa otra ficha está en esta lista (se abre al lado) o solo en el CRM (un enlace).
 */
export function BloqueDuplicado({ d, abrirAqui, alAbrir }: { d: DuplicadoDeCliente; abrirAqui: (id: string) => boolean; alAbrir: (id: string) => void }) {
  const total = d.otros.length;
  return (
    <section aria-label="Posible duplicado" className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${d.fuerte ? "border-warning" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${d.fuerte ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
          <IconoDuplicado />
        </span>
        <h3 className="m-0 text-sm font-semibold">Posible duplicado</h3>
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? "ficha parecida" : "fichas parecidas"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {d.motivos.map((m) => (
          <Insignia key={m} tono={m === "nombre" ? "neutro" : "aviso"}>
            {ETIQUETA_MOTIVO[m]}
          </Insignia>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {d.otros.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{o.nombre}</span>
              <span className="block text-xs text-muted-foreground">
                {o.codigo} · {o.cuentas ? `${o.cuentas} ${o.cuentas === 1 ? "cuenta" : "cuentas"} de Dropi` : "sin cuenta"}
                {o.tieneChat ? " · con chat" : ""} · entró {fecha(o.ingreso)}
              </span>
            </div>
            {abrirAqui(o.id) ? (
              <button type="button" onClick={() => alAbrir(o.id)} className={`inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted ${anilloFoco}`}>
                Ver ficha
              </button>
            ) : (
              <Link href={`/crm-dropshippers?abrir=${o.id}`} className={`inline-flex min-h-9 items-center rounded-lg border border-border bg-card px-3 text-[13px] font-semibold hover:bg-muted ${anilloFoco}`}>
                Abrir en el CRM
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
