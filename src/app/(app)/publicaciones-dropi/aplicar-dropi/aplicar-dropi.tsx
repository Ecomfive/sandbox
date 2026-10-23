"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { origenDropi } from "@/lib/publicaciones/marcador-aplicar-dropi";
import { guardarResultadosDropi, pendientesParaDropi, type CambioParaDropi } from "../aplicar-actions";

type Resultado = { id: string; ok: boolean; error?: string };
type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin_dropi"; mensaje: string }
  | { tipo: "aplicando"; cambios: CambioParaDropi[]; hechos: number }
  | { tipo: "listo"; cambios: CambioParaDropi[]; resultados: Resultado[]; guardado: string | null };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";

/**
 * Habla con la pestaña de Dropi que la abrió (solo con esa ventana y su origen, `https://app.dropi.<país>`): le manda los cambios
 * pendientes, recibe el avance y los resultados, y los guarda. La sesión de Dropi nunca llega aquí.
 */
export function AplicarDropi({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const iniciada = useRef(false);

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const pais = (new URLSearchParams(window.location.search).get("p") ?? "").toLowerCase();
    const origen = origenDropi(pais);
    const dropi = window.opener as Window | null;
    if (!puedeEscribir) return void setEstado({ tipo: "sin_dropi", mensaje: "Tu rol solo puede ver Gestión de IDs Dropi: no puede aplicar cambios." });
    if (!origen || !dropi) return void setEstado({ tipo: "sin_dropi", mensaje: "Esta ventana se abre con el favorito «Aplicar en Dropi», pulsado con Dropi abierto." });
    let cambios: CambioParaDropi[] = [];
    const alRecibir = async (e: MessageEvent) => {
      if (e.origin !== origen || e.source !== dropi || !e.data) return;
      if (e.data.tipo === "progreso") setEstado((s) => (s.tipo === "aplicando" ? { ...s, hechos: Number(e.data.hechos) || 0 } : s));
      if (e.data.tipo !== "resultados") return;
      window.removeEventListener("message", alRecibir);
      const resultados = (Array.isArray(e.data.resultados) ? e.data.resultados : []) as Resultado[];
      setEstado({ tipo: "listo", cambios, resultados, guardado: "Guardando…" });
      const r = await guardarResultadosDropi(pais, resultados).catch(() => ({ error: "No se pudieron guardar los resultados." }));
      setEstado({ tipo: "listo", cambios, resultados, guardado: r.error ?? null });
    };
    window.addEventListener("message", alRecibir);
    void pendientesParaDropi(pais)
      .catch(() => ({ error: "No se pudieron leer los cambios pendientes.", cambios: undefined }))
      .then((r) => {
        if (r.error || !r.cambios) {
          window.removeEventListener("message", alRecibir);
          return setEstado({ tipo: "sin_dropi", mensaje: r.error ?? "No se pudieron leer los cambios pendientes." });
        }
        cambios = r.cambios;
        if (!cambios.length) {
          window.removeEventListener("message", alRecibir);
          return setEstado({ tipo: "listo", cambios: [], resultados: [], guardado: null });
        }
        setEstado({ tipo: "aplicando", cambios, hechos: 0 });
        dropi.postMessage({ tipo: "pendientes", cambios: cambios.map(({ id, producto, nombre, guia, precio, sugerido }) => ({ id, producto, nombre, guia, precio, sugerido })) }, origen);
      });
    return () => window.removeEventListener("message", alRecibir);
  }, [puedeEscribir]);

  const cerrar = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => window.close()} className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
        Cerrar
      </button>
      <Link href="/publicaciones-dropi" className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
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
        {estado.guardado && <p className={`m-0 ${estado.guardado === "Guardando…" ? "text-muted-foreground" : "text-destructive"}`}>{estado.guardado}</p>}
      </div>
      {estado.cambios.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0 text-sm">
          {estado.cambios.map((c) => {
            const r = porId.get(c.id);
            return (
              <li key={c.id} className="flex flex-col gap-0.5 px-4 py-2.5">
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
                <span className={`text-xs font-medium ${r?.ok ? "text-success" : "text-destructive"}`}>{r ? (r.ok ? "Cambiado en Dropi" : `No se pudo: ${r.error ?? "sin detalle"}`) : "Sin respuesta de Dropi"}</span>
              </li>
            );
          })}
        </ul>
      )}
      {cerrar}
    </div>
  );
}
