"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { guardarTiendasUsuario, listarTiendasParaPermisos } from "./actions";

/**
 * «Tiendas» en la ficha de una persona (Finanzas): todas o solo las marcadas. Con tiendas limitadas, el Estado de
 * resultados, el Panel, Rentabilidad, Ventas por tienda y el Libro solo muestran esas tiendas. Se guarda al instante.
 */
export function TiendasPersona({ id, nombre, inicial }: { id: string; nombre: string; inicial: string[] | null | undefined }) {
  const { mostrarToast } = useToast();
  const [tiendas, setTiendas] = useState<{ id: string; nombre: string }[] | null>(null);
  const [elegidas, setElegidas] = useState<string[] | null>(inicial ?? null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    let vigente = true;
    listarTiendasParaPermisos()
      .then((t) => vigente && setTiendas(t))
      .catch(() => vigente && setTiendas([]));
    return () => {
      vigente = false;
    };
  }, []);

  function guardar(nuevas: string[] | null) {
    const antes = elegidas;
    setElegidas(nuevas);
    startTransition(async () => {
      const r = await guardarTiendasUsuario(id, nuevas);
      if (r.error) {
        setElegidas(antes);
        mostrarToast(r.error, "destructive");
      }
    });
  }
  const alternar = (t: string) => {
    const actuales = elegidas ?? [];
    guardar(actuales.includes(t) ? actuales.filter((x) => x !== t) : [...actuales, t]);
  };

  return (
    <section className="p-5" aria-labelledby={`tiendas-${id}`}>
      <h3 id={`tiendas-${id}`} className="mb-3 text-sm font-semibold">
        Tiendas
      </h3>
      {inicial === undefined ? (
        <p role="alert" className="text-sm text-destructive">
          Falta correr la migración 0937 en Supabase para limitar las tiendas.
        </p>
      ) : (
        <fieldset disabled={pendiente} className="flex flex-col gap-2 text-sm">
          <legend className="sr-only">Tiendas que ve {nombre}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`tiendas-alcance-${id}`} checked={elegidas === null} onChange={() => guardar(null)} />
            Todas las tiendas
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`tiendas-alcance-${id}`} checked={elegidas !== null} onChange={() => guardar([])} />
            Solo estas
          </label>
          {elegidas !== null && (
            <ul className="m-0 ml-6 flex list-none flex-col gap-1.5 p-0">
              {tiendas === null ? (
                <li className="text-muted-foreground">Cargando…</li>
              ) : (
                tiendas.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={elegidas.includes(t.id.toLowerCase())} onChange={() => alternar(t.id.toLowerCase())} />
                      {t.nombre}
                    </label>
                  </li>
                ))
              )}
              {elegidas.length === 0 && tiendas !== null && <li className="text-xs text-warning">Sin ninguna tienda marcada no verá datos de tiendas.</li>}
            </ul>
          )}
        </fieldset>
      )}
    </section>
  );
}
