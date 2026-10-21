"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CampoSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import type { SkuResumen } from "@/lib/publicaciones/sugerencias";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { vincularSkuPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

function Producto({ sku, pequeño = false }: { sku: SkuResumen; pequeño?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {sku.foto ? <img src={sku.foto} alt="" className={`${pequeño ? "h-8 w-8" : "h-10 w-10"} shrink-0 rounded-md border border-border object-cover`} /> : <span aria-hidden="true" className={`${pequeño ? "h-8 w-8" : "h-10 w-10"} shrink-0 rounded-md border border-dashed border-border-control`} />}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-xs font-semibold">{sku.codigo}</span>
        <span className="truncate text-xs text-muted-foreground">
          {sku.nombre}
          {sku.tipo === "combo" && " · compuesto"}
        </span>
      </span>
    </span>
  );
}

const COMO: Record<string, string> = { codigo: "el SKU es igual al nombre en Dropi", nombre: "el nombre es idéntico", foto: "tiene la misma foto", parecido: "el nombre se parece" };

/**
 * El bloque «Producto vinculado» de la ficha: el producto de Producto de esta publicación, o la sugerencia (con «Vincular» y
 * «Vincular y pasar a la siguiente») y un buscador para elegir otro. Guarda al instante, aparte del formulario de la ficha.
 */
export function VinculoSku({ p, puedeEscribir, siguiente }: { p: FilaPublicacion; puedeEscribir: boolean; siguiente?: () => void }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [elegido, setElegido] = useState<OpcionSkuMaestro | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const s = p.sugerencia;

  const vincular = (skuId: string | null, despues?: () => void) =>
    empezar(async () => {
      const r = await vincularSkuPublicacion(p.id, skuId).catch(() => ({ error: "No se pudo guardar el vínculo." }));
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(skuId ? "Publicación vinculada" : "Vínculo quitado");
      setElegido(null);
      setCambiando(false);
      despues?.();
    });

  const buscador = puedeEscribir && (
    <div className="flex flex-wrap items-center gap-2">
      <CampoSkuMaestro valor={elegido?.id ?? null} alCambiar={setElegido} etiquetaAria="Buscar otro producto de Producto" placeholder="Buscar otro producto por SKU o nombre" claseContenedor="min-w-0 flex-1" />
      <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={!elegido || pendiente} onClick={() => elegido && vincular(elegido.id)}>
        Vincular
      </Button>
    </div>
  );

  if (p.sku && !cambiando)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Producto sku={p.sku} />
          <span className="flex gap-1.5">
            <Link href={`/producto?buscar=${encodeURIComponent(p.sku.codigo)}`} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              Abrir en Producto
            </Link>
            {puedeEscribir && (
              <>
                <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => setCambiando(true)}>
                  Cambiar
                </Button>
                <Button type="button" variant="ghost" className="text-xs" disabled={pendiente} onClick={() => vincular(null)}>
                  Quitar vínculo
                </Button>
              </>
            )}
          </span>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {s && s.sku && (s.tipo === "seguro" || s.tipo === "sugerido") && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            {ETIQUETA_SUGERENCIA[s.tipo]}: {s.metodo ? COMO[s.metodo] : ""}
            {s.metodo === "parecido" && ` (${Math.round(s.parecido * 100)} %)`}
            {s.pack && ` · es un pack de ${s.pack}, se sugiere su compuesto`}.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Producto sku={s.sku} />
            {puedeEscribir && (
              <span className="flex gap-1.5">
                <Button type="button" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => vincular(s.sku!.id)}>
                  Vincular
                </Button>
                {siguiente && (
                  <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => vincular(s.sku!.id, siguiente)}>
                    Vincular y siguiente
                  </Button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
      {s?.tipo === "falta_compuesto" && s.sku && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <p className="flex items-center gap-2">
            <span role="img" aria-label="Atención" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
            Es un pack de {s.pack}: falta su compuesto en Producto. Créalo (con {s.pack} × {s.sku.codigo}) y vincúlalo aquí.
          </p>
          <Producto sku={s.sku} pequeño />
          <Link href="/producto?nuevo=1" className="w-fit text-xs font-medium underline underline-offset-2">
            Crear el compuesto en Producto
          </Link>
        </div>
      )}
      {s && s.alternativas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">{s.tipo === "varios" ? "Posibles productos:" : "Otras opciones:"}</p>
          <ul className="flex flex-col gap-1.5">
            {s.alternativas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <Producto sku={a} pequeño />
                {puedeEscribir && (
                  <Button type="button" variant="secondary" className="!px-3 !py-1 text-xs" disabled={pendiente} onClick={() => vincular(a.id)}>
                    Vincular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(!s || s.tipo === "ninguno") && <p className="text-sm text-muted-foreground">No se encontró un producto parecido en Producto.</p>}
      {buscador}
      {cambiando && (
        <Button type="button" variant="ghost" className="w-fit text-xs" onClick={() => setCambiando(false)}>
          Cancelar
        </Button>
      )}
    </div>
  );
}
