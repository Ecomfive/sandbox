"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { Button } from "@/components/ui/button";
import { SkuCopiable } from "@/components/ui/sku-copiable";
import { CampoSkuMaestro, useOpcionesSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useToast } from "@/components/ui/toast";
import type { SkuResumen } from "@/lib/publicaciones/sugerencias";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { crearProducto } from "../producto/actions";
import { CrearProductoPanel } from "../producto/crear-producto-panel";
import { vincularSkuPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

function Producto({ sku, pequeño = false }: { sku: SkuResumen; pequeño?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <FotoAmpliable url={sku.foto} nombre={sku.codigo} tam={pequeño ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex min-w-0 flex-col">
        <SkuCopiable codigo={sku.codigo} className="font-mono text-xs font-semibold" />
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
export function VinculoSku({
  p,
  puedeEscribir,
  siguiente,
  alAbrirProducto,
}: {
  p: FilaPublicacion;
  puedeEscribir: boolean;
  siguiente?: () => void;
  /** «Abrir en Producto»: la ficha abre la del producto encima de esta (no lleva al módulo). */
  alAbrirProducto: (id: string) => void;
}) {
  const { mostrarToast } = useToast();
  const puedeCrearProducto = usePuedeAbrir("producto");
  const opcionesSku = useOpcionesSkuMaestro();
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
            {puedeCrearProducto && (
              <Link
                href={`/producto?abrir=${p.sku.id}`}
                onClick={(e) => {
                  // Con Ctrl, Cmd, Mayús o clic central sigue siendo un enlace: abre la ficha exacta en otra pestaña.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  alAbrirProducto(p.sku!.id);
                }}
                className="rounded-md border border-azul/30 bg-azul-soft px-3 py-1.5 text-xs font-medium text-azul hover:border-azul"
              >
                Abrir en Producto
              </Link>
            )}
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
          {puedeCrearProducto && puedeEscribir && (
            // La ficha «Nuevo producto» se abre aquí encima (sin salir de Gestión de IDs Dropi), ya como compuesto con el pack armado
            // (N × el simple); al crearlo queda vinculado a esta publicación.
            <CrearProductoPanel
              opcionesSimples={opcionesSku.filter((o) => !o.compuesto)}
              compuestoInicial={{ componenteId: s.sku.id, cantidad: s.pack ?? 1 }}
              mensajeExito="Compuesto creado"
              action={async (datos) => {
                const r = await crearProducto(datos);
                if (r.error || !r.id) return r;
                const v = await vincularSkuPublicacion(p.id, r.id).catch(() => ({ error: "No se pudo guardar el vínculo." }));
                if (v.error) mostrarToast(`El compuesto se creó, pero no se vinculó: ${v.error}`, "destructive");
                return {};
              }}
              boton={(abrir) => (
                <button type="button" onClick={abrir} className="w-fit text-xs font-medium underline underline-offset-2">
                  Crear el compuesto en Producto
                </button>
              )}
            />
          )}
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
