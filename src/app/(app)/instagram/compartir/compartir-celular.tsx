"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { avisarActualizacionInstagram } from "@/lib/instagram/canal";
import { enlaceDeApp, type Plataforma } from "@/lib/instagram/plataformas";
import { etiquetaPlataforma, numeroInstagram } from "../def-instagram";
import { compartirDesdeCelular, type ResultadoCompartido } from "../compartir-actions";

type Compartido = { title: string; text: string; url: string };
type Estado = { tipo: "inicio" } | { tipo: "confirmar"; compartido: Compartido } | { tipo: "guardando" } | { tipo: "sin_datos" } | { tipo: "listo"; r: ResultadoCompartido };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const PASOS = ["Recibiendo lo compartido", "Abriendo el enlace", "Leyendo el texto y las cifras", "Guardando el archivo", "Terminando la captura"];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enlaceBoton = `inline-flex items-center self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/**
 * Después de guardar: volver a la app de donde se compartió (o «Cerrar» si no se sabe cuál) y ver las capturas. Volver cierra esta
 * ventana, que es la que abrió la hoja de compartir sobre la app (en una app instalada se cierra y se queda donde estabas); si no se
 * puede cerrar (una pestaña del navegador, como en iPhone), abre la app de la red.
 */
function Acciones({ plataforma }: { plataforma?: Plataforma }) {
  function volver() {
    window.close();
    if (plataforma) setTimeout(() => (window.closed ? undefined : void (window.location.href = enlaceDeApp(plataforma, navigator.userAgent))), 400);
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={volver} className={enlaceBoton}>
        {plataforma ? `Volver a ${etiquetaPlataforma(plataforma)}` : "Cerrar"}
      </button>
      <Link href="/instagram" className={enlaceBoton}>
        Ver capturas
      </Link>
    </div>
  );
}

/**
 * Guarda lo que llegó de la hoja de «Compartir en…» de Instagram y dice en qué captura quedó. Los datos compartidos se borran de la
 * dirección en cuanto se leen: recargar la página no vuelve a guardar lo mismo (y la acción tampoco lo duplica en los siguientes minutos).
 * Si la página se abrió desde un enlace de otra página (`directo` falso), primero pregunta «¿Guardar esto en Fuentes?».
 */
export function CompartirDesdeCelular({ puedeEscribir, directo }: { puedeEscribir: boolean; directo: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  // Al llegar la respuesta la barra se completa un instante antes de mostrar el resultado.
  const [terminado, setTerminado] = useState(false);
  const iniciada = useRef(false);

  function guardar(compartido: Compartido) {
    setEstado({ tipo: "guardando" });
    void compartirDesdeCelular(compartido)
      .catch((): ResultadoCompartido => ({ error: "No se pudo guardar. Inténtalo de nuevo." }))
      .then(async (r) => {
        setTerminado(true);
        if (!r.error) avisarActualizacionInstagram();
        await esperar(450);
        setEstado({ tipo: "listo", r });
      });
  }

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const p = new URLSearchParams(window.location.search);
    const compartido = { title: p.get("title") ?? "", text: p.get("text") ?? "", url: p.get("url") ?? "" };
    window.history.replaceState(null, "", window.location.pathname);
    // Sin nada que guardar (no llegó nada o no hay permiso) se muestra al instante. El estado cambia después del efecto, no dentro.
    void Promise.resolve().then(() => {
      if (!puedeEscribir || !(compartido.title || compartido.text || compartido.url)) setEstado({ tipo: "sin_datos" });
      else if (directo) guardar(compartido);
      else setEstado({ tipo: "confirmar", compartido });
    });
  }, [puedeEscribir, directo]);

  if (estado.tipo === "inicio") return null;
  if (estado.tipo === "confirmar") {
    const { compartido } = estado;
    return (
      <div className="flex flex-col gap-3">
        <div className={`${caja} flex flex-col gap-1`}>
          <span className="font-medium">¿Guardar esto en Fuentes?</span>
          <span className="break-all text-muted-foreground">{(compartido.url || compartido.text || compartido.title).slice(0, 300)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => guardar(compartido)}>
            Guardar
          </Button>
          <Link href="/instagram" className={enlaceBoton}>
            Cancelar
          </Link>
        </div>
      </div>
    );
  }
  if (estado.tipo === "guardando") return <ProgresoEstimado pasos={PASOS} estimadoMs={9000} terminado={terminado} etiqueta="Guardando lo compartido en Fuentes" />;
  if (estado.tipo === "sin_datos") {
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0 text-muted-foreground`}>{puedeEscribir ? "No llegó nada para guardar. Compártelo desde Instagram, Facebook o TikTok con «Ecomfive Fuentes»." : "Tu rol solo puede ver Instagram: no puede guardar lo que compartas."}</p>
        <Acciones />
      </div>
    );
  }

  const { r } = estado;
  if (r.error || r.numero === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={`${caja} m-0 text-destructive`}>
          {r.error ?? "No se pudo guardar."}
        </p>
        <Acciones />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div role="status" className={`${caja} flex flex-wrap items-center gap-x-3 gap-y-1`}>
        <span className="font-medium tabular-nums">{numeroInstagram(r.numero)}</span>
        <Badge tone={r.nueva ? "success" : "info"}>{r.nueva ? "Guardada" : `Compartida ${r.veces} ${r.veces === 1 ? "vez" : "veces"}`}</Badge>
        {r.plataforma && <span className="text-muted-foreground">{etiquetaPlataforma(r.plataforma)}</span>}
        {r.nombrePagina && <span className="text-muted-foreground">{r.nombrePagina}</span>}
        <span className="text-muted-foreground">{r.tieneArchivo ? "Con archivo" : "Sin archivo"}</span>
      </div>
      {r.leida === false && (
        <p role="status" className={`${caja} m-0`}>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
          No se pudo leer la página pública: la captura quedó con el enlace. En su ficha, «Completar desde el enlace» lo intenta de nuevo.
        </p>
      )}
      <Acciones plataforma={r.plataforma} />
    </div>
  );
}
