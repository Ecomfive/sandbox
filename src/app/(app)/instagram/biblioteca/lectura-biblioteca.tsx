"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import type { ResultadoLecturaBiblioteca } from "@/lib/instagram/biblioteca-lectura";
import { numeroInstagram } from "../def-instagram";
import { guardarLecturaBiblioteca } from "../biblioteca-actions";

type Estado = { tipo: "leyendo" } | { tipo: "sin_lectura" } | { tipo: "listo"; r: ResultadoLecturaBiblioteca };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const enlaceBoton = `inline-flex items-center self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted ${anilloFoco}`;
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-CR")} ${n === 1 ? uno : varios}`;

/**
 * Recibe la lectura de la Biblioteca de anuncios que dejó el marcador en el fragmento de la dirección, la guarda (cuenta los anuncios
 * de la misma página con el mismo copy de cada captura) y muestra qué capturas se completaron. El fragmento se borra de la
 * dirección en cuanto se lee, para que recargar la página no vuelva a guardar lo mismo.
 */
export function LecturaBiblioteca({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "leyendo" });
  const iniciada = useRef(false);

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const d = window.location.hash.match(/[#&]d=([A-Za-z0-9_-]+)/)?.[1];
    window.history.replaceState(null, "", window.location.pathname);
    const resultado: Promise<Estado> =
      d && puedeEscribir
        ? guardarLecturaBiblioteca(d)
            .catch((): ResultadoLecturaBiblioteca => ({ error: "No se pudo guardar la lectura." }))
            .then((r): Estado => ({ tipo: "listo", r }))
        : Promise.resolve<Estado>({ tipo: "sin_lectura" });
    void resultado.then(setEstado);
  }, [puedeEscribir]);

  if (estado.tipo === "leyendo") return <p role="status" className={`${caja} m-0 text-muted-foreground`}>Leyendo la Biblioteca…</p>;
  if (estado.tipo === "sin_lectura") {
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0 text-muted-foreground`}>{puedeEscribir ? "No llegó ninguna lectura. Abre la Biblioteca desde la ficha de una captura y pulsa el marcador." : "Tu rol solo puede ver Instagram: no puede guardar lecturas de la Biblioteca."}</p>
        <Link href="/instagram" className={enlaceBoton}>
          Ir a Instagram
        </Link>
      </div>
    );
  }

  const { r } = estado;
  if (r.error) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={`${caja} m-0 text-destructive`}>
          {r.error}
        </p>
        <Link href="/instagram" className={enlaceBoton}>
          Ir a Instagram
        </Link>
      </div>
    );
  }

  const actualizadas = r.actualizadas ?? [];
  const omitidas = r.omitidas ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="m-0 text-sm">
        Se leyeron {plural(r.leidos ?? 0, "anuncio", "anuncios")}
        {r.resultados ? ` de ~${r.resultados.toLocaleString("es-CR")} resultados` : ""}.
      </p>
      {r.parcial && (
        <p className={`${caja} m-0`}>
          <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-warning align-middle" />
          La Biblioteca tiene más anuncios de los que se cargaron: baja la página hasta el final y pulsa el marcador otra vez.
        </p>
      )}
      {actualizadas.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {actualizadas.map((a) => (
            <li key={a.numero} className={`${caja} flex flex-wrap items-center gap-x-3 gap-y-1`}>
              <span className="font-medium tabular-nums">{numeroInstagram(a.numero)}</span>
              {a.pagina && <span className="text-muted-foreground">{a.pagina}</span>}
              <Badge tone="info">{`${plural(a.total, "anuncio", "anuncios")} con el mismo copy`}</Badge>
              <span className="text-muted-foreground">{plural(a.activos, "activo", "activos")}</span>
              {a.destinoNuevo && <Badge tone="success">Página de destino guardada</Badge>}
            </li>
          ))}
        </ul>
      ) : (
        omitidas.length === 0 && <p className={`${caja} m-0 text-muted-foreground`}>Ninguna captura de Instagram coincide con los anuncios que se leyeron.</p>
      )}
      {omitidas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {omitidas.map((o) => (
            <li key={o.numero} className={caja}>
              <span className="mr-2 font-medium tabular-nums">{numeroInstagram(o.numero)}</span>
              {o.motivo}
            </li>
          ))}
        </ul>
      )}
      <Link href="/instagram" className={enlaceBoton}>
        Ir a Instagram
      </Link>
    </div>
  );
}
