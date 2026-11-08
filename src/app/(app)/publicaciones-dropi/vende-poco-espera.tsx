"use client";

import { useId, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { MAX_NOTA_ESPERA } from "@/lib/publicaciones/automatico";
import { esperarVendePoco } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

const dia = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" });

const botonClaro = `inline-flex items-center justify-center border border-border-control bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60 ${anilloFoco} !rounded-md`;
const botonOscuro = `inline-flex items-center justify-center border border-transparent bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60 ${anilloFoco} !rounded-md`;

/**
 * «Vende poco» en la ficha (8 nov 2026, pedido de Alcides): si después de analizarla se prefiere no cambiar el precio todavía, «Esperar un mes» la saca
 * de «Vende poco» por 30 días con una nota del porqué. Mientras espera se ve hasta cuándo, por qué y quién lo decidió, y se puede quitar la espera.
 * Va fuera del formulario de la ficha: su nota no enciende «Guardar cambios».
 */
export function VendePocoEspera({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const idNota = useId();
  const vende = p.acciones.includes("vende_poco");
  const espera = p.vendePocoEspera;
  // Solo se ve cuando sale en «Vende poco» o cuando alguien eligió esperar (la espera por un cambio de precio ya la dice la tarjeta).
  if (!vende && !espera) return null;

  const guardar = (valor: string | null) =>
    empezar(async () => {
      const r = await esperarVendePoco(p.id, valor).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? "Listo", r.error ? "destructive" : undefined);
      if (!r.error) {
        setAbierto(false);
        setNota("");
      }
    });

  const ventas = p.ventas?.netas30;
  return (
    <section aria-label="Vende poco" className="flex flex-col gap-3 border-b border-border px-5 py-3 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${espera ? "bg-success" : "bg-primario"}`} />
        <p className="m-0 min-w-0 flex-1">
          {espera ? (
            <>
              <span className="font-semibold">Esperando hasta el {dia(espera.hasta)}</span> sin cambiar el precio
              {espera.nota ? <>: {espera.nota}</> : "."}
              {espera.por && <span className="text-muted-foreground"> · {espera.por}</span>}
              {vende && " Ya vuelve a salir en «Vende poco»."}
            </>
          ) : (
            <>
              <span className="font-semibold">Vende poco</span>
              {ventas != null && <>: {ventas.toLocaleString("es-PA")} ventas en los últimos 30 días</>}.
            </>
          )}
        </p>
        {puedeEscribir && !abierto && (
          <button type="button" className={botonClaro} disabled={pendiente} onClick={() => (espera ? guardar(null) : setAbierto(true))}>
            {pendiente ? "Un momento..." : espera ? "Quitar la espera" : "Esperar un mes"}
          </button>
        )}
      </div>
      {abierto && (
        <div className="flex flex-col gap-2 pl-5">
          <label htmlFor={idNota} className="text-sm font-medium">
            ¿Por qué prefieres esperar?
          </label>
          <textarea
            id={idNota}
            autoFocus
            rows={2}
            maxLength={MAX_NOTA_ESPERA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej: esperando la temporada de diciembre"
            className={fieldClass}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={botonOscuro} disabled={pendiente || nota.trim().length < 3} onClick={() => guardar(nota)}>
              {pendiente ? "Guardando..." : "Esperar un mes"}
            </button>
            <button type="button" className={botonClaro} disabled={pendiente} onClick={() => setAbierto(false)}>
              Cancelar
            </button>
            <span className="text-xs text-muted-foreground">Sale de «Vende poco» por 30 días; si sigue vendiendo poco, vuelve sola.</span>
          </div>
        </div>
      )}
    </section>
  );
}
