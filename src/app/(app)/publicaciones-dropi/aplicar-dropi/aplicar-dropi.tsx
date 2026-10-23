"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { origenDropi } from "@/lib/publicaciones/marcador-aplicar-dropi";
import { guardarResultadosDropi, pendientesParaDropi, type CambioParaDropi } from "../aplicar-actions";

type Resultado = { id: string; ok: boolean; error?: string; nuevo?: number };
type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin_dropi"; mensaje: string }
  | { tipo: "elegir"; cambios: CambioParaDropi[] }
  | { tipo: "aplicando"; cambios: CambioParaDropi[]; hechos: number }
  | { tipo: "listo"; cambios: CambioParaDropi[]; resultados: Resultado[]; guardado: string | null; pospuestos: number };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const claseSecundario = `inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`;

/**
 * Habla con la pestaña de Dropi que la abrió (solo con esa ventana y su origen, `https://app.dropi.<país>`): primero muestra los
 * cambios pendientes para que la persona pueda posponer los que no quiera (siguen pendientes para la próxima vez); «Aplicar en Dropi»
 * le manda solo los demás, recibe el avance y los resultados, y los guarda. La sesión de Dropi nunca llega aquí.
 */
export function AplicarDropi({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const iniciada = useRef(false);
  // Lo que se mandó a Dropi esta vez y cuántos se pospusieron: lo necesita el listener cuando llegan los resultados.
  const enviados = useRef<{ cambios: CambioParaDropi[]; pospuestos: number }>({ cambios: [], pospuestos: 0 });

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const pais = (new URLSearchParams(window.location.search).get("p") ?? "").toLowerCase();
    const origen = origenDropi(pais);
    const dropi = window.opener as Window | null;
    if (!puedeEscribir) return void setEstado({ tipo: "sin_dropi", mensaje: "Tu rol solo puede ver Gestión de IDs Dropi: no puede aplicar cambios." });
    if (!origen || !dropi) return void setEstado({ tipo: "sin_dropi", mensaje: "Esta ventana se abre con el favorito «Aplicar en Dropi», pulsado con Dropi abierto." });
    const alRecibir = async (e: MessageEvent) => {
      if (e.origin !== origen || e.source !== dropi || !e.data) return;
      if (e.data.tipo === "progreso") setEstado((s) => (s.tipo === "aplicando" ? { ...s, hechos: Number(e.data.hechos) || 0 } : s));
      if (e.data.tipo !== "resultados") return;
      window.removeEventListener("message", alRecibir);
      const resultados = (Array.isArray(e.data.resultados) ? e.data.resultados : []) as Resultado[];
      const { cambios, pospuestos } = enviados.current;
      setEstado({ tipo: "listo", cambios, resultados, guardado: "Guardando…", pospuestos });
      const r = await guardarResultadosDropi(pais, resultados).catch(() => ({ error: "No se pudieron guardar los resultados." }));
      setEstado({ tipo: "listo", cambios, resultados, guardado: r.error ?? null, pospuestos });
    };
    window.addEventListener("message", alRecibir);
    void pendientesParaDropi(pais)
      .catch(() => ({ error: "No se pudieron leer los cambios pendientes.", cambios: undefined }))
      .then((r) => {
        if (r.error || !r.cambios) {
          window.removeEventListener("message", alRecibir);
          return setEstado({ tipo: "sin_dropi", mensaje: r.error ?? "No se pudieron leer los cambios pendientes." });
        }
        if (!r.cambios.length) {
          window.removeEventListener("message", alRecibir);
          return setEstado({ tipo: "listo", cambios: [], resultados: [], guardado: null, pospuestos: 0 });
        }
        setEstado({ tipo: "elegir", cambios: r.cambios });
      });
    return () => window.removeEventListener("message", alRecibir);
  }, [puedeEscribir]);

  /** Manda a Dropi solo los cambios elegidos (los no pospuestos); el favorito los aplica uno por uno. */
  function aplicar(cambios: CambioParaDropi[], pospuestos: number) {
    const dropi = window.opener as Window | null;
    const origen = origenDropi((new URLSearchParams(window.location.search).get("p") ?? "").toLowerCase());
    if (!dropi || !origen || dropi.closed) return void setEstado({ tipo: "sin_dropi", mensaje: "La pestaña de Dropi se cerró: vuelve a pulsar «Aplicar en Dropi» con Dropi abierto." });
    enviados.current = { cambios, pospuestos };
    setEstado({ tipo: "aplicando", cambios, hechos: 0 });
    dropi.postMessage({ tipo: "pendientes", cambios: cambios.map(({ id, tipo, nuevo, producto, nombre, guia, precio, sugerido }) => ({ id, tipo, nuevo, producto, nombre, guia, precio, sugerido })) }, origen);
  }

  const cerrar = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => window.close()} className={claseSecundario}>
        Cerrar
      </button>
      <Link href="/publicaciones-dropi" className={claseSecundario}>
        Ir a Gestión de IDs Dropi
      </Link>
    </div>
  );

  if (estado.tipo === "cargando") return <p className={`${caja} m-0 text-muted-foreground`}>Buscando los cambios pendientes…</p>;
  if (estado.tipo === "sin_dropi")
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={`${caja} m-0 text-muted-foreground`}>
          {estado.mensaje}
        </p>
        {cerrar}
      </div>
    );
  if (estado.tipo === "elegir") return <ElegirCambios cambios={estado.cambios} alAplicar={aplicar} cerrar={cerrar} />;
  if (estado.tipo === "aplicando")
    return (
      <div role="status" className={`${caja} flex flex-col gap-2`}>
        <p className="m-0 font-semibold">
          Aplicando en Dropi: {estado.hechos} de {estado.cambios.length}…
        </p>
        <p className="m-0 text-muted-foreground">No cierres esta ventana ni la pestaña de Dropi hasta que termine.</p>
      </div>
    );
  const porId = new Map(estado.resultados.map((r) => [r.id, r]));
  const aplicados = estado.resultados.filter((r) => r.ok).length;
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className={`${caja} flex flex-col gap-1`}>
        <p className="m-0 font-semibold">
          {estado.cambios.length === 0 ? "No hay cambios pendientes para Dropi." : `Listo: ${aplicados} de ${estado.cambios.length} cambiados en Dropi.`}
        </p>
        {estado.pospuestos > 0 && <p className="m-0 text-muted-foreground">{estado.pospuestos === 1 ? "1 cambio pospuesto sigue pendiente." : `${estado.pospuestos} cambios pospuestos siguen pendientes.`}</p>}
        {estado.guardado && <p className={`m-0 ${estado.guardado === "Guardando…" ? "text-muted-foreground" : "text-destructive"}`}>{estado.guardado}</p>}
      </div>
      {estado.cambios.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0 text-sm">
          {estado.cambios.map((c) => {
            const r = porId.get(c.id);
            return (
              <li key={c.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                <DetalleCambio c={c} />
                <span className={`text-xs font-medium ${r?.ok ? "text-success" : "text-destructive"}`}>
                  {r ? (r.ok ? (c.tipo === "republicar" ? `Republicada: ID nuevo ${r.nuevo ?? "—"}; la vieja quedó archivada y sin stock` : "Cambiado en Dropi") : `No se pudo: ${r.error ?? "sin detalle"}`) : "Sin respuesta de Dropi"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {cerrar}
    </div>
  );
}

/** Lo que cambia un cambio pendiente: el nombre o la publicación, el precio y el ID de Dropi. */
function DetalleCambio({ c }: { c: CambioParaDropi }) {
  if (c.tipo === "republicar")
    return (
      <>
        <span className="font-medium">Republicar: {c.publicacion}</span>
        <span className="text-xs">Un producto nuevo en Dropi con los mismos datos, fotos y stock; el ID {c.producto} queda archivado y sin stock.</span>
        <span className="text-xs text-muted-foreground">
          ID {c.producto}
          {c.nuevo ? ` · ya creado como ID ${c.nuevo}: sigue desde ahí` : ""}
        </span>
      </>
    );
  return (
    <>
      <span className="font-medium">{c.nombre ?? c.publicacion}</span>
      {(c.precio !== null || c.sugerido !== null) && (
        <span className="text-xs tabular-nums">
          {c.precio !== null && `Precio ${c.precioAntes !== null ? `$${c.precioAntes.toFixed(2)} → ` : ""}$${c.precio.toFixed(2)}`}
          {c.precio !== null && c.sugerido !== null && " · "}
          {c.sugerido !== null && `Sugerido ${c.sugeridoAntes !== null ? `$${c.sugeridoAntes.toFixed(2)} → ` : ""}$${c.sugerido.toFixed(2)}`}
        </span>
      )}
      <span className="text-xs text-muted-foreground">
        ID {c.producto}
        {c.guia ? ` · guía ${c.guia}` : ""}
        {c.nombre && c.publicacion && c.publicacion !== c.nombre ? ` · ${c.publicacion}` : ""}
      </span>
    </>
  );
}

/** Los cambios que esperan para Dropi, cada uno con «Posponer»; «Aplicar en Dropi» manda solo los que no se pospusieron. */
function ElegirCambios({ cambios, alAplicar, cerrar }: { cambios: CambioParaDropi[]; alAplicar: (elegidos: CambioParaDropi[], pospuestos: number) => void; cerrar: ReactNode }) {
  const [pospuestos, setPospuestos] = useState<Set<string>>(new Set());
  const elegidos = cambios.filter((c) => !pospuestos.has(c.id));
  const alternar = (id: string) =>
    setPospuestos((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(id)) ahora.delete(id);
      else ahora.add(id);
      return ahora;
    });
  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-sm font-semibold">
        {cambios.length === 1 ? "1 cambio para Dropi" : `${cambios.length} cambios para Dropi`}
        {pospuestos.size > 0 && <span className="font-normal text-muted-foreground"> · {pospuestos.size === 1 ? "1 pospuesto" : `${pospuestos.size} pospuestos`}</span>}
      </h2>
      <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0 text-sm">
        {cambios.map((c) => {
          const pospuesto = pospuestos.has(c.id);
          return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${pospuesto ? "opacity-60" : ""}`}>
                <DetalleCambio c={c} />
              </div>
              <button
                type="button"
                aria-pressed={pospuesto}
                aria-label={`${pospuesto ? "Incluir de nuevo" : "Posponer"}: ${c.tipo === "republicar" ? `republicar ${c.publicacion}` : (c.nombre ?? c.publicacion)}`}
                onClick={() => alternar(c.id)}
                className={`inline-flex min-h-9 shrink-0 items-center rounded-md border px-3 py-1.5 text-xs font-medium ${anilloFoco} ${pospuesto ? "border-foreground bg-accent text-foreground" : "border-border bg-card hover:bg-muted"}`}
              >
                {pospuesto ? "Pospuesto" : "Posponer"}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={elegidos.length === 0}
          onClick={() => alAplicar(elegidos, pospuestos.size)}
          className={`inline-flex min-h-10 w-fit items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}
        >
          {`Aplicar en Dropi${elegidos.length ? ` (${elegidos.length})` : ""}`}
        </button>
        {cerrar}
      </div>
    </div>
  );
}
