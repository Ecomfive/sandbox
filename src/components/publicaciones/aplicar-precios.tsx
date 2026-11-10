"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { ORIGEN_PLATAFORMA, VERSION_FAVORITO_PRECIOS, type PlataformaPrecios } from "@/lib/publicaciones/marcador-aplicar-precios";
import { montoConSimbolo } from "@/lib/moneda/simbolo";
import { cambiosParaAplicar, guardarPreciosLeidosDrop, guardarResultadosPrecios, type CambioParaAplicar } from "@/lib/publicaciones/precios-plataforma-actions";

type Resultado = { id: string; ok: boolean; error?: string; aviso?: string };
type Estado =
  | { tipo: "cargando"; leyendo: boolean }
  | { tipo: "sin_plataforma"; mensaje: string }
  | { tipo: "elegir"; cambios: CambioParaAplicar[]; leidos: number | null }
  | { tipo: "aplicando"; cambios: CambioParaAplicar[]; hechos: number }
  | { tipo: "listo"; cambios: CambioParaAplicar[]; resultados: Resultado[]; guardado: string | null; leidos: number | null };

const NOMBRE: Record<PlataformaPrecios, string> = { drop: "Drop", dunamixfy: "Dunamixfy" };
const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const claseBoton = `inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`;
const clasePrincipal = `inline-flex w-fit items-center rounded-md bg-primario px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 ${anilloFoco}`;
const colones = (n: number | null) => (n === null ? "—" : montoConSimbolo(n, "CRC"));

/**
 * La ventana que abre el favorito «Aplicar precios» desde la pestaña de Drop o de Dunamixfy (solo habla con esa ventana y su origen). Al cargar le avisa que
 * está lista; en Drop recibe los precios de todos los productos y los guarda. Muestra los cambios pendientes, y «Aplicar» se los manda al favorito, que los
 * aplica con la sesión de su pestaña (que nunca llega aquí); recibe el avance y los resultados, y los guarda.
 */
export function AplicarPrecios({ plataforma, puedeEscribir }: { plataforma: PlataformaPrecios; puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando", leyendo: false });
  const iniciada = useRef(false);
  const enviados = useRef<CambioParaAplicar[]>([]);
  const nombre = NOMBRE[plataforma];
  const origen = ORIGEN_PLATAFORMA[plataforma];

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const ventana = window.opener as Window | null;
    const version = new URLSearchParams(window.location.search).get("v");
    const motivo = !puedeEscribir
      ? `Tu rol solo puede ver Gestión de IDs ${nombre}: no puede aplicar cambios de precio.`
      : !ventana
        ? `Esta ventana se abre con el favorito «Aplicar precios», pulsado con ${nombre} abierto.`
        : version !== VERSION_FAVORITO_PRECIOS
          ? `Tu favorito «Aplicar precios» está desactualizado (${version ? `versión ${version}` : "sin versión"}; la actual es la ${VERSION_FAVORITO_PRECIOS}). Abre Gestión de IDs ${nombre} › «Cómo aplicar en ${nombre}», arrastra el favorito nuevo a la barra (reemplaza el viejo) y vuelve a pulsarlo. No se aplicó nada.`
          : null;
    // Fuera del cuerpo del efecto (no se cambia el estado mientras se dibuja).
    if (motivo || !ventana) return void queueMicrotask(() => setEstado({ tipo: "sin_plataforma", mensaje: motivo ?? "" }));

    const cargarCambios = async (leidos: number | null) => {
      const r = await cambiosParaAplicar(plataforma).catch(() => ({ error: "No se pudieron leer los cambios pendientes.", cambios: undefined }));
      if (r.error || !r.cambios) return setEstado({ tipo: "sin_plataforma", mensaje: r.error ?? "No se pudieron leer los cambios pendientes." });
      if (!r.cambios.length) return setEstado({ tipo: "listo", cambios: [], resultados: [], guardado: null, leidos });
      setEstado({ tipo: "elegir", cambios: r.cambios, leidos });
    };

    const alRecibir = async (e: MessageEvent) => {
      if (e.origin !== origen || e.source !== ventana || !e.data) return;
      if (e.data.tipo === "precios") {
        let leidos: number | null = null;
        if (plataforma === "drop" && Array.isArray(e.data.productos) && e.data.productos.length) {
          setEstado({ tipo: "cargando", leyendo: true });
          const g = await guardarPreciosLeidosDrop(e.data.productos).catch(() => ({ error: "x", guardados: undefined }));
          leidos = g.error ? null : (g.guardados ?? null);
        }
        return void cargarCambios(leidos);
      }
      if (e.data.tipo === "progreso") return setEstado((s) => (s.tipo === "aplicando" ? { ...s, hechos: Number(e.data.hechos) || 0 } : s));
      if (e.data.tipo !== "resultados") return;
      window.removeEventListener("message", alRecibir);
      const resultados = (Array.isArray(e.data.resultados) ? e.data.resultados : []) as Resultado[];
      const cambios = enviados.current;
      setEstado({ tipo: "listo", cambios, resultados, guardado: "Guardando…", leidos: null });
      const r = await guardarResultadosPrecios(plataforma, resultados).catch(() => ({ error: "No se pudieron guardar los resultados." }));
      setEstado({ tipo: "listo", cambios, resultados, guardado: r.error ?? null, leidos: null });
    };
    window.addEventListener("message", alRecibir);
    // Le avisa al favorito que ya puede mandar los precios (en Drop) y esperar los cambios.
    ventana.postMessage({ tipo: "listo" }, origen);
    return () => window.removeEventListener("message", alRecibir);
  }, [plataforma, puedeEscribir, nombre, origen]);

  function aplicar(cambios: CambioParaAplicar[]) {
    const ventana = window.opener as Window | null;
    if (!ventana || ventana.closed) return void setEstado({ tipo: "sin_plataforma", mensaje: `La pestaña de ${nombre} se cerró: vuelve a pulsar «Aplicar precios» con ${nombre} abierto.` });
    enviados.current = cambios;
    setEstado({ tipo: "aplicando", cambios, hechos: 0 });
    ventana.postMessage({ tipo: "pendientes", cambios: cambios.map(({ id, externo, precio, sugerido }) => ({ id, externo, precio, sugerido })) }, origen);
  }

  const cerrar = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => window.close()} className={claseBoton}>
        Cerrar
      </button>
      <Link href={`/publicaciones-${plataforma}`} className={claseBoton}>
        Ir a Gestión de IDs {nombre}
      </Link>
    </div>
  );
  const linea = (c: CambioParaAplicar) =>
    [c.precio !== null && `precio ${colones(c.precioAntes)} → ${colones(c.precio)}`, c.sugerido !== null && `sugerido ${colones(c.sugeridoAntes)} → ${colones(c.sugerido)}`].filter(Boolean).join(" · ");

  if (estado.tipo === "cargando") return <p className={`${caja} m-0 text-muted-foreground`}>{estado.leyendo ? `Guardando los precios leídos de ${nombre}…` : `Esperando a ${nombre}…`}</p>;
  if (estado.tipo === "sin_plataforma")
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={`${caja} m-0 text-destructive`}>
          {estado.mensaje}
        </p>
        {cerrar}
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 text-lg font-semibold">Aplicar precios en {nombre}</h1>
      {"leidos" in estado && estado.leidos !== null && <p className="m-0 text-xs text-muted-foreground">Se leyeron de {nombre} los precios de {estado.leidos} productos.</p>}
      {estado.tipo === "listo" && !estado.cambios.length && <p className={`${caja} m-0`}>Ningún cambio de precio espera para {nombre}.</p>}
      {estado.cambios.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {estado.cambios.map((c) => {
            const r = estado.tipo === "listo" ? estado.resultados.find((x) => x.id === c.id) : undefined;
            return (
              <li key={c.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                <span className="font-medium">{c.nombre}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{linea(c)}</span>
                {estado.tipo === "elegir" && c.estado === "error" && c.error && <span className="text-xs text-destructive">La vez anterior: {c.error}</span>}
                {r && <span className={`text-xs ${r.ok ? "text-success" : "text-destructive"}`}>{r.ok ? `Aplicado en ${nombre}.${r.aviso ? ` ${r.aviso}` : ""}` : `No se aplicó: ${r.error ?? "error desconocido"}`}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {estado.tipo === "elegir" && (
        <button type="button" className={clasePrincipal} onClick={() => aplicar(estado.cambios)}>
          Aplicar {estado.cambios.length === 1 ? "el cambio" : `los ${estado.cambios.length} cambios`} en {nombre}
        </button>
      )}
      {estado.tipo === "aplicando" && (
        <p role="status" className={`${caja} m-0 text-muted-foreground`}>
          Aplicando en {nombre}: {estado.hechos} de {estado.cambios.length}…
        </p>
      )}
      {estado.tipo === "listo" && estado.guardado && (
        <p role={estado.guardado === "Guardando…" ? "status" : "alert"} className={`m-0 text-xs ${estado.guardado === "Guardando…" ? "text-muted-foreground" : "text-destructive"}`}>
          {estado.guardado}
        </p>
      )}
      {estado.tipo === "listo" && cerrar}
    </div>
  );
}
