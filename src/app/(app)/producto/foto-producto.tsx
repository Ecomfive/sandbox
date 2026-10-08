"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { supabase } from "@/lib/supabase/client";
import { AdjuntoIcon } from "@/lib/nav-icons";
import { guardarFotoProducto, prepararSubidaFotoProducto } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * La foto del producto arriba de su ficha. Con permiso de escritura se sube, se cambia o se quita ahí mismo: el archivo va
 * directo al almacenamiento y se guarda al instante (no espera a ningún «Guardar»). Se ve también en Producto e Inventario.
 */
export function FotoProducto({ id, nombre, foto, puedeEscribir }: { id: string; nombre: string; foto: string | null; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const ocupado = subiendo || pendiente;

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return mostrarToast("Elige una imagen (JPG, PNG, WebP o GIF).", "destructive");
    if (f.size > MAX_BYTES) return mostrarToast("La imagen pesa más de 5 MB.", "destructive");
    setSubiendo(true);
    try {
      const permiso = await prepararSubidaFotoProducto(id, f.name);
      if ("error" in permiso) return mostrarToast(permiso.error, "destructive");
      const { error } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type });
      if (error) return mostrarToast("No se pudo subir la imagen.", "destructive");
      const r = await guardarFotoProducto(id, permiso.ruta);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast(foto ? "Foto cambiada." : "Foto agregada.");
      startTransition(() => router.refresh());
    } catch {
      mostrarToast("No se pudo subir la imagen.", "destructive");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    if (!confirm("¿Quitar la foto del producto?")) return;
    const r = await guardarFotoProducto(id, null);
    if (r.error) return mostrarToast(r.error, "destructive");
    mostrarToast("Foto quitada.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      {foto ? (
        <button type="button" onClick={() => setAmpliada(true)} aria-label={`Ver la foto de ${nombre} más grande`} className={`overflow-hidden rounded-md border border-border ${anilloFoco}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt={nombre} className={`h-20 w-20 object-cover ${ocupado ? "opacity-50" : ""}`} />
        </button>
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <AdjuntoIcon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      {puedeEscribir && (
        <span className="flex gap-2 text-xs">
          <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={alElegir} aria-label={`Foto de ${nombre}`} tabIndex={-1} />
          <button type="button" disabled={ocupado} onClick={() => archivo.current?.click()} className={`rounded font-medium text-primario hover:underline disabled:opacity-50 ${anilloFoco}`}>
            {subiendo ? "Subiendo…" : foto ? "Cambiar" : "Subir foto"}
          </button>
          {foto && !ocupado && (
            <button type="button" onClick={quitar} className={`rounded text-muted-foreground hover:text-destructive ${anilloFoco}`}>
              Quitar
            </button>
          )}
        </span>
      )}
      {ampliada && foto && <VisorImagen src={foto} alt={nombre} onClose={() => setAmpliada(false)} />}
    </div>
  );
}
