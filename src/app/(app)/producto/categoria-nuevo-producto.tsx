"use client";

import { useEffect, useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { rutaLegible, SEPARADOR } from "@/lib/categorias/taxonomia";
import type { SugerenciaCategoria } from "@/lib/categorias/sugerir";
import { buscarCategorias, sugerirCategoria, type OpcionCategoria } from "./categoria-actions";

/** Los dos últimos niveles, para que la sugerencia quepa en un botón («Cuidado de la piel › Lociones y humectantes»). */
const corta = (ruta: string) => ruta.split(SEPARADOR).slice(-2).join(" › ");

/**
 * La categoría de un producto nuevo (ficha «Nuevo producto»): un momento después de escribir el nombre o subir la foto, el
 * sistema sugiere hasta 3 categorías por los productos ya clasificados que se le parecen (`sugerirCategoria`); un clic elige
 * una. «Buscar otra» abre el buscador de la taxonomía. Viaja como `categoria_id`. Opcional: se puede crear sin categoría.
 */
export function CategoriaNuevoProducto({ nombre, foto }: { nombre: string; foto: string | null }) {
  const [elegida, setElegida] = useState<OpcionCategoria | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaCategoria[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<OpcionCategoria[]>([]);

  useEffect(() => {
    const limpio = nombre.trim();
    if (limpio.length < 3 && !foto) return;
    let vigente = true;
    const espera = setTimeout(() => {
      sugerirCategoria(limpio, foto)
        .then((r) => vigente && setSugerencias(r))
        .catch(() => vigente && setSugerencias([]));
    }, 700);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [nombre, foto]);

  useEffect(() => {
    if (!buscando || texto.trim().length < 2) return;
    let vigente = true;
    const espera = setTimeout(() => {
      buscarCategorias(texto)
        .then((r) => vigente && setResultados(r))
        .catch(() => vigente && setResultados([]));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto, buscando]);

  const visibles = nombre.trim().length >= 3 || foto ? sugerencias : [];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Categoría</span>
      <input type="hidden" name="categoria_id" value={elegida?.id ?? ""} />
      {elegida ? (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{rutaLegible(elegida.ruta)}</span>
          <button type="button" onClick={() => setElegida(null)} className={`rounded text-xs font-medium text-primario hover:underline ${anilloFoco}`}>
            Cambiar
          </button>
        </span>
      ) : (
        <>
          {visibles.length > 0 && (
            <div role="group" aria-label="Categorías sugeridas" className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{visibles.some((s) => s.ejemplos.length) ? "Sugeridas por productos parecidos:" : "Sugeridas por el nombre:"}</span>
              <span className="flex flex-wrap gap-1.5">
                {visibles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Elegir ${rutaLegible(s.ruta)}${s.ejemplos.length ? `, como ${s.ejemplos.join(", ")}` : ""}`}
                    onClick={() => setElegida({ id: s.id, ruta: s.ruta })}
                    className={`flex max-w-full flex-col items-start rounded-lg border border-border-control px-2.5 py-1.5 text-left text-[13px] hover:border-primario hover:bg-primario-suave ${anilloFoco}`}
                  >
                    <span className="font-medium">{corta(s.ruta)}</span>
                    {s.ejemplos.length > 0 && <span className="max-w-[18rem] truncate text-[11px] text-muted-foreground">como {s.ejemplos[0]}</span>}
                  </button>
                ))}
              </span>
            </div>
          )}
          {buscando ? (
            <div className="flex flex-col gap-1.5">
              <input
                type="search"
                aria-label="Buscar categoría"
                placeholder="Ej: crema facial, linterna, faja"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  if (e.target.value.trim().length < 2) setResultados([]);
                }}
                className={`${fieldClass} w-full`}
              />
              {texto.trim().length >= 2 && (
                <ul aria-label="Categorías encontradas" className="m-0 flex max-h-56 list-none flex-col overflow-auto rounded-md border border-border p-0">
                  {resultados.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setElegida(o);
                          setBuscando(false);
                          setTexto("");
                        }}
                        className={`w-full px-2.5 py-1.5 text-left text-[13px] hover:bg-muted ${anilloFoco}`}
                      >
                        {rutaLegible(o.ruta)}
                      </button>
                    </li>
                  ))}
                  {!resultados.length && <li className="px-2.5 py-1.5 text-[13px] text-muted-foreground">No hay categorías con esas palabras.</li>}
                </ul>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => setBuscando(true)} className={`self-start rounded text-xs font-medium text-primario hover:underline ${anilloFoco}`}>
              {visibles.length ? "Buscar otra" : "Buscar categoría"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
