"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarGlobal, type ResultadoBusqueda } from "@/lib/busqueda-global";

export function BusquedaGlobal() {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const idTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  function alEscribir(valor: string) {
    setConsulta(valor);
    if (idTimeout.current) clearTimeout(idTimeout.current);
    if (valor.trim().length < 2) {
      setResultados([]);
      setAbierto(false);
      return;
    }
    idTimeout.current = setTimeout(() => {
      startTransition(async () => {
        const encontrados = await buscarGlobal(valor);
        setResultados(encontrados);
        setAbierto(true);
      });
    }, 250);
  }

  function irA(href: string) {
    setAbierto(false);
    setConsulta("");
    setResultados([]);
    router.push(href);
  }

  return (
    <div ref={contenedorRef} className="relative w-full max-w-xs">
      <input
        type="search"
        value={consulta}
        onChange={(e) => alEscribir(e.target.value)}
        onFocus={() => resultados.length > 0 && setAbierto(true)}
        placeholder="Buscar pedido, producto o dropshipper…"
        className="w-full rounded-full border border-border-control bg-background px-3.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
      />
      {abierto && (
        <div className="absolute top-full left-0 z-40 mt-1 max-h-80 w-full min-w-[20rem] overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {pending && <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>}
          {!pending && resultados.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados para “{consulta}”.</p>
          )}
          {!pending &&
            resultados.map((r, i) => (
              <button
                key={`${r.tipo}-${i}`}
                type="button"
                onClick={() => irA(r.href)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="text-xs font-medium text-muted-foreground">{r.etiquetaTipo}</span>
                <span className="font-medium">{r.titulo}</span>
                <span className="text-xs text-muted-foreground">{r.detalle}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
