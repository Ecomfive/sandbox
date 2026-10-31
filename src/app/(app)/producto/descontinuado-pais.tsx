"use client";

import { useEffect, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bandera } from "@/lib/whatsapp/origen-chat";
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
  if ("error" in paises) return <span className="mt-1.5 block text-xs text-muted-foreground">{paises.error}</span>;
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
    return marcados.length ? <span className="mt-1.5 block text-xs text-destructive">{`Descontinuado en ${marcados.map((p) => p.nombre).join(", ")}`}</span> : null;
  }
  return (
    <fieldset className="mt-2 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-0.5 p-0 text-xs text-muted-foreground">Descontinuado en</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {paises.map((p) => (
          <label key={p.codigo} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm text-[13px] ${p.descontinuado ? "font-medium text-destructive" : ""}`}>
            <input type="checkbox" checked={p.descontinuado} disabled={pendiente} onChange={(e) => cambiar(p, e.target.checked)} className={`h-4 w-4 accent-[var(--destructive)] ${anilloFoco}`} />
            <span aria-hidden="true">{bandera(p.codigo)}</span>
            {p.nombre}
          </label>
        ))}
      </div>
      {marcados.length > 0 && <span className="text-xs text-muted-foreground">{`No se compra para ${marcados.map((p) => p.nombre).join(" ni ")}; los demás países siguen igual.`}</span>}
    </fieldset>
  );
}
