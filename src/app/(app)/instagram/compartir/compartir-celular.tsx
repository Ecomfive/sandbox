"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { numeroInstagram } from "../def-instagram";
import { compartirDesdeCelular, type ResultadoCompartido } from "../compartir-actions";

type Estado = { tipo: "guardando" } | { tipo: "sin_datos" } | { tipo: "listo"; r: ResultadoCompartido };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const enlaceBoton = `inline-flex items-center self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/** Después de guardar: volver a la app de Instagram (su dirección `instagram://app` la abre en iPhone y Android) o ver las capturas. */
function Acciones() {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="instagram://app" className={enlaceBoton}>
        Volver a Instagram
      </a>
      <Link href="/instagram" className={enlaceBoton}>
        Ver capturas
      </Link>
    </div>
  );
}

/**
 * Guarda lo que llegó de la hoja de «Compartir en…» de Instagram y dice en qué captura quedó. Los datos compartidos se borran de la
 * dirección en cuanto se leen: recargar la página no vuelve a guardar lo mismo (y la acción tampoco lo duplica en los siguientes minutos).
 */
export function CompartirDesdeCelular({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "guardando" });
  const iniciada = useRef(false);

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const p = new URLSearchParams(window.location.search);
    const compartido = { title: p.get("title") ?? "", text: p.get("text") ?? "", url: p.get("url") ?? "" };
    window.history.replaceState(null, "", window.location.pathname);
    const resultado: Promise<Estado> =
      puedeEscribir && (compartido.title || compartido.text || compartido.url)
        ? compartirDesdeCelular(compartido)
            .catch((): ResultadoCompartido => ({ error: "No se pudo guardar. Inténtalo de nuevo." }))
            .then((r): Estado => ({ tipo: "listo", r }))
        : Promise.resolve<Estado>({ tipo: "sin_datos" });
    void resultado.then(setEstado);
  }, [puedeEscribir]);

  if (estado.tipo === "guardando") return <p role="status" className={`${caja} m-0 text-muted-foreground`}>Guardando en Fuentes…</p>;
  if (estado.tipo === "sin_datos") {
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0 text-muted-foreground`}>{puedeEscribir ? "No llegó nada para guardar. Compártelo desde Instagram con «Ecomfive Fuentes»." : "Tu rol solo puede ver Instagram: no puede guardar lo que compartas."}</p>
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
        {r.nombrePagina && <span className="text-muted-foreground">{r.nombrePagina}</span>}
        <span className="text-muted-foreground">{r.tieneArchivo ? "Con archivo" : "Sin archivo"}</span>
      </div>
      <Acciones />
    </div>
  );
}
