"use client";

import { useState } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { FALTAS_RAPIDAS, type DecisionRevision } from "@/lib/confirmacion-ia/revision";
import type { FilaAnalisis } from "@/lib/confirmacion-ia/servidor";
import { NOMBRE_ZONA } from "@/lib/confirmacion-ia/zonas";
import { tiempoEsperando } from "@/lib/tienda/confirmacion";
import { LineaModelo } from "./lineas-modelo";

/** Guarda lo que marcó la persona; devuelve el error en palabras (o null si quedó). */
export type AlElegir = (f: FilaAnalisis, d: DecisionRevision) => Promise<string | null>;

const BOTON = `inline-flex min-h-10 items-center justify-center rounded-md border border-border-control bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const CHIP = `inline-flex min-h-9 items-center rounded-full border border-border-control bg-card px-3 text-sm hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

/**
 * Los botones para marcar lo correcto de un pedido (16 nov 2026, pedido de Hernán): «Completa · Ciudad», «Completa · Interior», «Falta un dato» (con lo que suele faltar a un toque) y, si el
 * sistema ya había propuesto algo, «Está bien». Un toque guarda; lo marcado manda sobre lo que dijo la IA y le enseña para la próxima vez.
 */
export function BotonesVeredicto({ f, distingueZona, puedeConfirmar, alElegir }: { f: FilaAnalisis; distingueZona: boolean; puedeConfirmar: boolean; alElegir: AlElegir }) {
  const [faltando, setFaltando] = useState(false);
  const [otro, setOtro] = useState("");
  const [ciudad, setCiudad] = useState(f.ciudad ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const sinCiudad = ciudad.trim().length < 2;
  const pedirCiudad = !f.ciudad;

  async function elegir(d: DecisionRevision) {
    setEnviando(true);
    setError(null);
    const e = await alElegir(f, d);
    setEnviando(false);
    if (e) setError(e);
    else {
      setFaltando(false);
      setOtro("");
    }
  }
  const completa = (zona: "ciudad" | "interior" | null) => elegir({ completa: true, zona, ciudad: pedirCiudad ? ciudad : null });

  return (
    <div className="flex flex-col gap-3">
      {pedirCiudad && (
        <label className="flex flex-col gap-1 sm:max-w-xs">
          <span className={labelClass}>Ciudad o corregimiento *</span>
          <input value={ciudad} maxLength={120} onChange={(e) => setCiudad(e.target.value)} placeholder="Ej: Bella Vista" className={fieldClass} />
          <span className="text-xs text-muted-foreground">El pedido no la trae: escríbela para marcarlo completo.</span>
        </label>
      )}
      <div role="group" aria-label="Lo correcto para este pedido" className="flex flex-wrap items-center gap-2">
        {distingueZona ? (
          <>
            <button type="button" disabled={enviando || (pedirCiudad && sinCiudad)} onClick={() => completa("ciudad")} className={BOTON}>
              Completa · {NOMBRE_ZONA.ciudad}
            </button>
            <button type="button" disabled={enviando || (pedirCiudad && sinCiudad)} onClick={() => completa("interior")} className={BOTON}>
              Completa · {NOMBRE_ZONA.interior}
            </button>
          </>
        ) : (
          <button type="button" disabled={enviando || (pedirCiudad && sinCiudad)} onClick={() => completa(null)} className={BOTON}>
            Completa
          </button>
        )}
        <button type="button" aria-expanded={faltando} disabled={enviando} onClick={() => setFaltando((v) => !v)} className={`${BOTON} ${faltando ? "bg-muted" : ""}`}>
          Falta un dato
        </button>
        {puedeConfirmar && (
          <button type="button" disabled={enviando} onClick={() => elegir({ acierto: true })} className={`${BOTON} text-success`}>
            Está bien
          </button>
        )}
      </div>
      {faltando && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className={`${labelClass} m-0`}>¿Qué le falta? Toca lo que se le pediría al cliente</p>
          <div className="flex flex-wrap gap-2">
            {FALTAS_RAPIDAS.map((t) => (
              <button key={t} type="button" disabled={enviando} onClick={() => elegir({ completa: false, falta: t })} className={CHIP}>
                {t}
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (otro.trim().length >= 3) void elegir({ completa: false, falta: otro });
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Otra cosa que falta</span>
              <input value={otro} maxLength={200} onChange={(e) => setOtro(e.target.value)} placeholder="Otra cosa: ej. el color de la casa" className={fieldClass} />
            </label>
            <button type="submit" disabled={enviando || otro.trim().length < 3} className={BOTON}>
              Guardar
            </button>
          </form>
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const DE_A_LA_VEZ = 8;

/**
 * Los pedidos que las IA no pudieron decidir, uno debajo de otro con sus botones: se va marcando rápido, uno tras otro. Cada respuesta sale de la lista y le enseña a la IA.
 */
export function ColaRevision({ pendientes, distingueZona, ahora, mostrarTienda, alElegir }: { pendientes: FilaAnalisis[]; distingueZona: boolean; ahora: number; mostrarTienda: boolean; alElegir: AlElegir }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? pendientes : pendientes.slice(0, DE_A_LA_VEZ);
  if (pendientes.length === 0) {
    return <p className="m-0 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">No queda ningún pedido por revisar. Las respuestas que marcaste ya le sirven a la IA.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        {pendientes.length === 1 ? "1 pedido por decidir." : `${pendientes.length} pedidos por decidir.`} Marca lo correcto: sale de la lista y la IA aprende de cada respuesta.
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {visibles.map((f) => (
          <li key={f.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b className="text-sm">{f.numero ?? "Pedido"}</b>
              {mostrarTienda && f.tienda && <span className="text-xs text-muted-foreground">{f.tienda}</span>}
              <span className="text-xs tabular-nums text-muted-foreground">hace {tiempoEsperando(f.actualizadoEn, ahora)}</span>
              <Pastilla tono={f.estado === "error" ? "peligro" : "neutro"}>{f.estado === "error" ? "No se pudo analizar" : "Las IA no coinciden"}</Pastilla>
            </div>
            <div>
              <p className="m-0 text-xs text-muted-foreground">Ciudad o corregimiento: <b className="text-foreground">{f.ciudad ?? "no puso"}</b></p>
              <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm">{f.direccion ?? "Sin dirección"}</p>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {f.modelos.map((m) => (
                <LineaModelo key={m.proveedor} m={m} />
              ))}
            </ul>
            <BotonesVeredicto f={f} distingueZona={distingueZona} puedeConfirmar={false} alElegir={alElegir} />
          </li>
        ))}
      </ul>
      {!todas && pendientes.length > DE_A_LA_VEZ && (
        <button type="button" onClick={() => setTodas(true)} className={`self-center ${BOTON}`}>
          Ver los {pendientes.length - DE_A_LA_VEZ} que faltan
        </button>
      )}
    </div>
  );
}
