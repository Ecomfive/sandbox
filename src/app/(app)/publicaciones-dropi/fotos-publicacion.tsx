"use client";

import { useEffect, useState } from "react";
import { FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { formatearFecha } from "@/lib/formato";
import { obtenerFotosPublicacion, type FotoPublicacion } from "./fotos-actions";

/**
 * Las fotos de la publicación copiadas de Dropi al sistema (migración 0153): la principal primero y, al final y atenuadas, las que Dropi
 * ya no lista. Cada una se amplía con un clic. Se copian en la lectura de cada mañana; «Republicar» sube estas y no las de Dropi.
 */
export function FotosPublicacion({ id }: { id: string }) {
  const [datos, setDatos] = useState<FotoPublicacion[] | string | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerFotosPublicacion(id)
      .then((r) => vigente && setDatos("fotos" in r ? r.fotos : r.error))
      .catch(() => vigente && setDatos("No se pudieron leer las fotos."));
    return () => {
      vigente = false;
    };
  }, [id]);

  if (datos === null) return <p className="m-0 text-sm text-muted-foreground">Cargando…</p>;
  if (typeof datos === "string")
    return (
      <p role="alert" className="m-0 text-sm text-destructive">
        {datos}
      </p>
    );
  if (!datos.length) return <p className="m-0 text-sm text-muted-foreground">Todavía no se copiaron sus fotos de Dropi: se copian en la lectura de cada mañana.</p>;
  const copiadas = datos.reduce((m, f) => (f.copiadaEn > m ? f.copiadaEn : m), "");
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-3 p-0">
        {datos.map((f) => (
          <li key={f.id} className={`flex flex-col gap-1 ${f.enDropi ? "" : "opacity-60"}`}>
            <FotoAmpliable url={f.url} nombre={f.nombre} tam="h-22 w-22" dentroDeFieldset />
            <span className="text-xs text-muted-foreground">{f.principal ? <strong className="font-medium text-foreground">Principal</strong> : f.enDropi ? `ID ${f.dropiId ?? "—"}` : "Ya no está en Dropi"}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted-foreground">
        {datos.length} {datos.length === 1 ? "foto" : "fotos"} · última copiada el {formatearFecha(copiadas)}
      </p>
    </div>
  );
}
