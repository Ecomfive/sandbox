"use client";

import { useEffect, useState, useTransition } from "react";
import { Bandera } from "@/components/paises/bandera";
import { useToast } from "@/components/ui/toast";
import { cambiarDescontinuadoPais, paisesDescontinuado, type PaisDescontinuado } from "./descontinuado-pais-actions";

/**
 * «Descontinuado en» de la ficha del producto (31 oct 2026, pedido de Hernán; migración 0211): una casilla por país. En el país marcado no se
 * puede comprar y Gestión de IDs Dropi y el chat lo muestran descontinuado; los demás siguen igual. Con el estado «Descontinuado» ya vale
 * para todos, así que no se muestra.
 */
export function DescontinuadoPorPais({ skuId, puedeEscribir }: { skuId: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [paises, setPaises] = useState<PaisDescontinuado[] | { error: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    let vigente = true;
    paisesDescontinuado(skuId).then(
      (r) => vigente && setPaises("error" in r ? r : r.paises),
      () => vigente && setPaises({ error: "No se pudo leer en qué países está descontinuado." }),
    );
    return () => {
      vigente = false;
    };
  }, [skuId]);

  if (!paises) return null;
  if ("error" in paises) return <p className="m-0 text-sm text-muted-foreground">{paises.error}</p>;
  const marcados = paises.filter((p) => p.descontinuado);

  function cambiar(p: PaisDescontinuado, si: boolean) {
    empezar(async () => {
      const r = await cambiarDescontinuadoPais(skuId, p.codigo, si).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      setPaises((actual) => (Array.isArray(actual) ? actual.map((x) => (x.codigo === p.codigo ? { ...x, descontinuado: si } : x)) : actual));
      mostrarToast(si ? `Descontinuado en ${p.nombre}: ya no se compra para ese país.` : `Vuelve a comprarse para ${p.nombre}.`);
    });
  }

  if (!puedeEscribir) {
    return <p className={`m-0 text-sm ${marcados.length ? "text-destructive" : "text-muted-foreground"}`}>{marcados.length ? `Descontinuado en ${marcados.map((p) => p.nombre).join(", ")}.` : "Se compra para todos los países."}</p>;
  }
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="sr-only">Países donde está descontinuado</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {paises.map((p) => (
          <label
            key={p.codigo}
            className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
              p.descontinuado ? "border-destructive bg-destructive-soft font-medium text-destructive" : "border-border bg-card hover:bg-muted"
            } ${pendiente ? "cursor-wait opacity-70" : ""}`}
          >
            <input type="checkbox" checked={p.descontinuado} disabled={pendiente} onChange={(e) => cambiar(p, e.target.checked)} className="h-3.5 w-3.5 shrink-0 accent-[var(--destructive)]" />
            <Bandera codigo={p.codigo} />
            <span className="min-w-0">{p.nombre}</span>
          </label>
        ))}
      </div>
      {marcados.length > 0 && <span className="text-sm text-muted-foreground">{`No se compra para ${marcados.map((p) => p.nombre).join(", ")}. Los demás países siguen igual.`}</span>}
    </fieldset>
  );
}
