"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { CerrarIcon, CheckIcon, LapizIcon } from "@/lib/nav-icons";
import { montoConMoneda } from "@/lib/publicaciones/fulfillment-pais";
import { guardarFulfillmentPlataforma } from "./fulfillment-actions";

const NOMBRE_MONEDA: Record<string, string> = { USD: "Dólares (US$)", CRC: "Colones (₡)", MXN: "Pesos (MX$)" };

/**
 * El fulfillment por pedido de una plataforma del país, editable en la misma celda (Configuración, 31 oct 2026), en la moneda en que lo factura
 * (dólares o la del país: Costa Rica cobra y paga en colones). Debajo, cuánto es en la otra moneda (`equivalente`). En Dropi, guardarlo lo pone en
 * todas las publicaciones del país de Gestión de IDs Dropi: se confirma antes.
 */
export function CeldaFulfillment({
  id,
  plataforma,
  nombrePais,
  valor,
  moneda,
  monedas,
  equivalente,
  esDropi,
  puedeEscribir,
}: {
  id: string;
  plataforma: string;
  nombrePais: string;
  valor: number | null;
  /** La moneda del monto guardado. */
  moneda: string;
  /** Las que se pueden elegir: dólares y la del país. */
  monedas: string[];
  /** «≈ ₡1 011»: el mismo monto en la otra moneda del país, o null. */
  equivalente: string | null;
  esDropi: boolean;
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  // Sin monto todavía, se propone la moneda del país (la última de la lista).
  const [monedaElegida, setMonedaElegida] = useState(valor === null ? monedas[monedas.length - 1] : moneda);
  const [mostrado, setMostrado] = useState<{ valor: number | null; moneda: string; equivalente: string | null }>({ valor, moneda, equivalente });
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function abrir() {
    setTexto(mostrado.valor === null ? "" : String(mostrado.valor));
    if (mostrado.valor !== null) setMonedaElegida(mostrado.moneda);
    setError(null);
    setEditando(true);
  }

  function guardar() {
    const nuevo = texto.trim();
    if (nuevo === (mostrado.valor === null ? "" : String(mostrado.valor)) && monedaElegida === mostrado.moneda) return setEditando(false);
    if (esDropi) {
      const aviso = nuevo
        ? `El fulfillment de Dropi en ${nombrePais} pasa a ${montoConMoneda(Number(nuevo.replace(",", ".").replace(/^[^\d]+/, "")), monedaElegida)} y se pone en todas las publicaciones de ${nombrePais} en Gestión de IDs Dropi (cambia su margen). ¿Seguir?`
        : `Dropi en ${nombrePais} se queda sin fulfillment fijo: se vuelve a escribir en cada publicación. ¿Seguir?`;
      if (!confirm(aviso)) return;
    }
    setError(null);
    empezar(async () => {
      const r = await guardarFulfillmentPlataforma(id, nuevo, monedaElegida).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) return void setError(r.error);
      setMostrado({ valor: r.valor, moneda: r.moneda, equivalente: r.equivalente });
      setEditando(false);
      mostrarToast(
        r.valor === null
          ? `${plataforma} en ${nombrePais}: sin fulfillment fijo.`
          : `Fulfillment de ${plataforma} en ${nombrePais}: ${montoConMoneda(r.valor, r.moneda)}${esDropi ? (r.cambiadas ? ` · se cambió en ${r.cambiadas} ${r.cambiadas === 1 ? "publicación" : "publicaciones"}` : " · todas las publicaciones ya lo tenían") : ""}.`,
      );
    });
  }

  if (editando)
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {monedas.length > 1 ? (
            <select
              value={monedaElegida}
              onChange={(e) => setMonedaElegida(e.target.value)}
              disabled={pendiente}
              aria-label={`Moneda del fulfillment de ${plataforma}`}
              className={`${fieldClassSm} w-auto`}
            >
              {monedas.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MONEDA[m] ?? m}
                </option>
              ))}
            </select>
          ) : (
            <span aria-hidden="true" className="text-xs text-muted-foreground">
              US$
            </span>
          )}
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
            placeholder={monedaElegida === "USD" ? "Ej: 2.00" : "Ej: 1000"}
            disabled={pendiente}
            aria-label={`Fulfillment por pedido de ${plataforma}, en ${(NOMBRE_MONEDA[monedaElegida] ?? monedaElegida).toLowerCase()}`}
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
      <span className="tabular-nums">{mostrado.valor === null ? <span className="text-muted-foreground">—</span> : montoConMoneda(mostrado.valor, mostrado.moneda)}</span>
      {mostrado.valor !== null && mostrado.equivalente && <span className="text-xs text-muted-foreground tabular-nums">{mostrado.equivalente}</span>}
    </span>
  );
  if (!puedeEscribir) return contenido;
  return (
    <Tooltip texto="Cambiar fulfillment">
      <button
        type="button"
        onClick={abrir}
        aria-label={`Fulfillment de ${plataforma}: ${montoConMoneda(mostrado.valor, mostrado.moneda)}. Cambiar`}
        className={`group -mx-1.5 inline-flex min-h-8 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted ${anilloFoco}`}
      >
        {contenido}
        <LapizIcon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    </Tooltip>
  );
}
