"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { rutaLegible } from "@/lib/categorias/taxonomia";
import { buscarCategorias, cambiarCategoriaProducto, type OpcionCategoria } from "./categoria-actions";

/**
 * La categoría del producto en su ficha (taxonomía de Shopify): la ruta completa y, si la clasificación automática no estaba
 * segura, «Por revisar» con «Confirmar». Con permiso de escritura, «Cambiar» abre un buscador por palabras.
 */
export function CategoriaProducto({
  id,
  categoria,
  puedeEscribir,
}: {
  id: string;
  categoria: { id: string; ruta: string; revisar: boolean } | null;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [opciones, setOpciones] = useState<OpcionCategoria[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    if (!editando || texto.trim().length < 2) return;
    let vigente = true;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarCategorias(texto)
        .then((r) => vigente && setOpciones(r))
        .catch(() => vigente && setOpciones([]))
        .finally(() => vigente && setBuscando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [texto, editando]);

  function guardar(categoriaId: string | null, confirmar = false) {
    startTransition(async () => {
      const r = await cambiarCategoriaProducto(id, categoriaId, confirmar);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(confirmar ? "Categoría confirmada." : "Categoría guardada.");
      setEditando(false);
      setTexto("");
      setOpciones([]);
      router.refresh();
    });
  }

  const vista = categoria ? (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{rutaLegible(categoria.ruta)}</span>
      {categoria.revisar && (
        <span className="inline-flex items-center gap-1.5 text-xs text-warning">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
          Por revisar
        </span>
      )}
    </span>
  ) : (
    <span className="text-muted-foreground">Sin categoría</span>
  );
  if (!puedeEscribir) return vista;

  if (!editando)
    return (
      <span className="flex flex-col gap-1.5">
        {vista}
        <span className="flex flex-wrap gap-3 text-xs">
          {categoria?.revisar && (
            <button type="button" disabled={pendiente} onClick={() => guardar(categoria.id, true)} className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}>
              Confirmar
            </button>
          )}
          <button type="button" disabled={pendiente} onClick={() => setEditando(true)} className={`rounded font-medium text-primario hover:underline ${anilloFoco}`}>
            {categoria ? "Cambiar" : "Elegir categoría"}
          </button>
        </span>
      </span>
    );

  return (
    <span className="flex flex-col gap-1.5">
      <input
        type="search"
        autoFocus
        aria-label="Buscar categoría"
        placeholder="Ej: crema facial, linterna, faja"
        value={texto}
        disabled={pendiente}
        onChange={(e) => {
          setTexto(e.target.value);
          if (e.target.value.trim().length < 2) setOpciones([]);
        }}
        onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
        className={`${fieldClassSm} w-full`}
      />
      {texto.trim().length >= 2 && (
        <ul aria-label="Categorías encontradas" className="m-0 flex max-h-64 list-none flex-col overflow-auto rounded-md border border-border p-0">
          {opciones.map((o) => (
            <li key={o.id}>
              <button type="button" disabled={pendiente} onClick={() => guardar(o.id)} className={`w-full px-2.5 py-1.5 text-left text-[13px] hover:bg-muted ${anilloFoco}`}>
                {rutaLegible(o.ruta)}
              </button>
            </li>
          ))}
          {!opciones.length && <li className="px-2.5 py-1.5 text-[13px] text-muted-foreground">{buscando ? "Buscando…" : "No hay categorías con esas palabras."}</li>}
        </ul>
      )}
      <span className="flex gap-3 text-xs">
        {categoria && (
          <button type="button" disabled={pendiente} onClick={() => guardar(null)} className={`rounded text-muted-foreground hover:underline ${anilloFoco}`}>
            Quitar categoría
          </button>
        )}
        <button type="button" onClick={() => setEditando(false)} className={`rounded text-muted-foreground hover:underline ${anilloFoco}`}>
          Cancelar
        </button>
      </span>
    </span>
  );
}
