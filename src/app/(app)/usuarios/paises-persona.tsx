"use client";

import { useEffect, useState, useTransition } from "react";
import { Bandera } from "@/components/paises/bandera";
import { useToast } from "@/components/ui/toast";
import { guardarPaisesUsuario, listarPaisesParaPermisos } from "./actions";

/**
 * «Países» en la ficha de una persona: todos (lo de siempre) o solo los marcados. Con países limitados solo ve las compras
 * de esos países, su histórico de compras y, en la barra de arriba, esos países. Cada
 * cambio se guarda al instante.
 */
export function PaisesPersona({ id, nombre, inicial }: { id: string; nombre: string; inicial: string[] | null | undefined }) {
  const { mostrarToast } = useToast();
  const [paises, setPaises] = useState<{ codigo: string; nombre: string }[] | null>(null);
  const [elegidos, setElegidos] = useState<string[] | null>(inicial ?? null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    let vigente = true;
    listarPaisesParaPermisos()
      .then((p) => vigente && setPaises(p))
      .catch(() => vigente && setPaises([]));
    return () => {
      vigente = false;
    };
  }, []);

  function guardar(nuevos: string[] | null) {
    const antes = elegidos;
    setElegidos(nuevos);
    startTransition(async () => {
      const r = await guardarPaisesUsuario(id, nuevos);
      if (r.error) {
        setElegidos(antes);
        mostrarToast(r.error, "destructive");
      }
    });
  }
  const alternar = (codigo: string) => {
    const actuales = elegidos ?? [];
    guardar(actuales.includes(codigo) ? actuales.filter((c) => c !== codigo) : [...actuales, codigo]);
  };

  // Importadora ya no es una opción: las ventas de importación son compras de un país (migración 0094).
  const opciones = paises ?? [];
  return (
    <section className="p-5" aria-labelledby={`paises-${id}`}>
      <h3 id={`paises-${id}`} className="mb-3 text-sm font-semibold">
        Países
      </h3>
      {inicial === undefined ? (
        <p role="alert" className="text-sm text-destructive">
          Falta correr la migración 0087 en Supabase para limitar los países.
        </p>
      ) : (
        <fieldset disabled={pendiente} className="flex flex-col gap-2 text-sm">
          <legend className="sr-only">Países que ve {nombre}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`alcance-${id}`} checked={elegidos === null} onChange={() => guardar(null)} />
            Todos los países
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`alcance-${id}`} checked={elegidos !== null} onChange={() => guardar([])} />
            Solo estos
          </label>
          {elegidos !== null && (
            <ul className="m-0 ml-6 flex list-none flex-col gap-1.5 p-0">
              {paises === null ? (
                <li className="text-muted-foreground">Cargando…</li>
              ) : (
                opciones.map((p) => (
                  <li key={p.codigo}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={elegidos.includes(p.codigo)} onChange={() => alternar(p.codigo)} />
                      <Bandera codigo={p.codigo} />
                      {p.nombre}
                    </label>
                  </li>
                ))
              )}
              {elegidos.length === 0 && paises !== null && <li className="text-xs text-warning">Sin ningún país marcado no verá compras.</li>}
            </ul>
          )}
        </fieldset>
      )}
    </section>
  );
}
