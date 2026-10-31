"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon, CheckIcon, LapizIcon } from "@/lib/nav-icons";
import { guardarFulfillmentPlataforma } from "./fulfillment-actions";

/**
 * El fulfillment por pedido de una plataforma del país, en dólares, editable en la misma celda (Configuración, 31 oct 2026). Debajo, cuánto es en
 * la moneda del país (`equivalente`, si no es el dólar). En Dropi, guardarlo lo pone en todas las publicaciones del país de Gestión de IDs Dropi: se
 * confirma antes.
 */
export function CeldaFulfillment({
  id,
  plataforma,
  nombrePais,
  valor,
  equivalente,
  esDropi,
  puedeEscribir,
}: {
  id: string;
  plataforma: string;
  nombrePais: string;
  valor: number | null;
  /** «≈ ₡1 011»: el mismo monto en la moneda del país, o null. */
  equivalente: string | null;
  esDropi: boolean;
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [mostrado, setMostrado] = useState<{ valor: number | null; equivalente: string | null }>({ valor, equivalente });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function abrir() {
    setTexto(mostrado.valor === null ? "" : mostrado.valor.toFixed(2));
    setError(null);
    setEditando(true);
  }

  function guardar() {
    const nuevo = texto.trim();
    if (nuevo === (mostrado.valor === null ? "" : mostrado.valor.toFixed(2))) return setEditando(false);
    if (esDropi) {
      const aviso = nuevo
        ? `El fulfillment de Dropi en ${nombrePais} pasa a US$${Number(nuevo.replace(",", ".")).toFixed(2)} y se pone en todas las publicaciones de ${nombrePais} en Gestión de IDs Dropi (cambia su margen). ¿Seguir?`
        : `Dropi en ${nombrePais} se queda sin fulfillment fijo: se vuelve a escribir en cada publicación. ¿Seguir?`;
      if (!confirm(aviso)) return;
    }
    setError(null);
    empezar(async () => {
      const r = await guardarFulfillmentPlataforma(id, nuevo).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      setMostrado({ valor: r.valor, equivalente: r.enMoneda ? `≈ ${r.enMoneda}` : null });
      setEditando(false);
      mostrarToast(
        r.valor === null
          ? `${plataforma} en ${nombrePais}: sin fulfillment fijo.`
          : `Fulfillment de ${plataforma} en ${nombrePais}: US$${r.valor.toFixed(2)}${esDropi ? (r.cambiadas ? ` · se cambió en ${r.cambiadas} ${r.cambiadas === 1 ? "publicación" : "publicaciones"}` : " · todas las publicaciones ya lo tenían") : ""}.`,
      );
    });
  }

  if (editando)
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            US$
          </span>
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                guardar();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditando(false);
              }
            }}
            inputMode="decimal"
            placeholder="Ej: 2.00"
            disabled={pendiente}
            aria-label={`Fulfillment por pedido de ${plataforma}, en dólares`}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `error-fulfillment-${id}` : undefined}
            className={`${fieldClassSm} w-24 tabular-nums`}
          />
          <Tooltip texto="Guardar">
            <button type="button" onClick={guardar} disabled={pendiente} aria-label={`Guardar fulfillment de ${plataforma}`} className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background disabled:opacity-40 ${anilloFoco}`}>
              <CheckIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip texto="Cancelar">
            <button type="button" onClick={() => setEditando(false)} disabled={pendiente} aria-label="Cancelar" className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40 ${anilloFoco}`}>
              <CerrarIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        {error && (
          <p id={`error-fulfillment-${id}`} role="alert" className="m-0 max-w-64 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );

  const contenido = (
    <span className="flex flex-col items-start leading-tight">
      <span className="tabular-nums">{mostrado.valor === null ? <span className="text-muted-foreground">—</span> : `US$${mostrado.valor.toFixed(2)}`}</span>
      {mostrado.valor !== null && mostrado.equivalente && <span className="text-xs text-muted-foreground tabular-nums">{mostrado.equivalente}</span>}
    </span>
  );
  if (!puedeEscribir) return contenido;
  return (
    <Tooltip texto="Cambiar fulfillment">
      <button
        type="button"
        onClick={abrir}
        aria-label={`Fulfillment de ${plataforma}: ${mostrado.valor === null ? "sin dato" : `US$${mostrado.valor.toFixed(2)}`}. Cambiar`}
        className={`group -mx-1.5 inline-flex min-h-8 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted ${anilloFoco}`}
      >
        {contenido}
        <LapizIcon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    </Tooltip>
  );
}
