"use client";

import { useEffect, useState } from "react";
import type { PosibleDuplicado } from "@/lib/wms/duplicados";
import { buscarPosiblesDuplicados } from "./actions";

/**
 * Aviso de posible duplicado en la ficha «Nuevo producto» (13 oct 2026): un momento después de escribir el nombre o de subir la
 * foto, el servidor busca productos con un nombre o una foto parecidos (`buscarPosiblesDuplicados`) y los muestra con su foto,
 * SKU, nombre y por qué se parecen. Solo avisa: no impide crear.
 */
export function AvisoDuplicados({ nombre, foto }: { nombre: string; foto: string | null }) {
  const [duplicados, setDuplicados] = useState<PosibleDuplicado[]>([]);

  useEffect(() => {
    const texto = nombre.trim();
    if (texto.length < 3 && !foto) {
      setDuplicados([]);
      return;
    }
    let vigente = true;
    const espera = setTimeout(async () => {
      const r = await buscarPosiblesDuplicados(texto, foto).catch(() => null);
      if (vigente && r && "duplicados" in r) setDuplicados(r.duplicados);
    }, 600);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [nombre, foto]);

  if (!duplicados.length) return null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-sm">
      <p className="m-0 flex items-center gap-2 font-medium">
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
        Posible duplicado: revisa si ya existe
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {duplicados.map((d) => (
          <li key={d.id} className="flex items-center gap-3">
            {d.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
            ) : (
              <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border" />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{d.nombre}</span>
              <span className="truncate text-xs text-muted-foreground">
                {d.codigo} · {[d.porNombre && "nombre parecido", d.porFoto && "foto parecida"].filter(Boolean).join(" y ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
