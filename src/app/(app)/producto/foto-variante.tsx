"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";
import { guardarFotoProducto, prepararSubidaFotoProducto } from "./actions";

const MAX_BYTES = 5 * 1024 * 1024;

/** La miniatura de una variante: su foto o, si no tiene, la del producto principal (un cuadro vacío solo si ninguno la tiene). */
export function MiniaturaVariante({ foto, nombre, tam = "h-9 w-9" }: { foto: string | null | undefined; nombre: string; tam?: string }) {
  return foto ? (
    <img src={foto} alt={`Foto de ${nombre}`} loading="lazy" className={`${tam} shrink-0 rounded-md border border-border object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${tam} shrink-0 rounded-md border border-dashed border-border bg-muted`} />
  );
}

/**
 * Cambiar la foto de una variante desde la ficha de su producto principal. Sin foto propia usa la del principal; subir una la
 * vuelve propia y «Usar la del principal» la quita. No escucha arrastrar ni pegar (eso es de la foto del producto abierto).
 */
export function FotoVariante({
  id,
  nombre,
  foto,
  fotoDelPrincipal,
  puedeEscribir,
}: {
  id: string;
  nombre: string;
  foto: string | null | undefined;
  fotoDelPrincipal: string | null;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pendiente, start] = useTransition();
  const ocupado = subiendo || pendiente;
  const hereda = !!foto && foto === fotoDelPrincipal;

  async function subir(f: File) {
    if (!f.type.startsWith("image/")) return mostrarToast("Eso no es una imagen (JPG, PNG, WebP o GIF).", "destructive");
    if (f.size > MAX_BYTES) return mostrarToast("La imagen pesa más de 5 MB.", "destructive");
    setSubiendo(true);
    try {
      const permiso = await prepararSubidaFotoProducto(id, f.name || "foto");
      if ("error" in permiso) return mostrarToast(permiso.error, "destructive");
      const { error } = await supabase.storage.from("wms-productos").uploadToSignedUrl(permiso.ruta, permiso.token, f, { contentType: f.type });
      if (error) return mostrarToast("No se pudo subir la imagen.", "destructive");
      const r = await guardarFotoProducto(id, permiso.ruta);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Foto guardada.");
      start(() => router.refresh());
    } catch {
      mostrarToast("No se pudo subir la imagen.", "destructive");
    } finally {
      setSubiendo(false);
    }
  }

  function usarLaDelPrincipal() {
    start(async () => {
      const r = await guardarFotoProducto(id, null);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Ahora usa la foto del principal.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <MiniaturaVariante foto={foto} nombre={nombre} tam="h-16 w-16" />
      <div className="flex flex-col items-start gap-1">
        <span className="text-xs text-muted-foreground">{!foto ? "Sin foto" : hereda ? "Usa la foto del principal" : "Foto propia"}</span>
        {puedeEscribir && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={archivo}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void subir(f);
              }}
            />
            <BotonBarra onClick={() => archivo.current?.click()} disabled={ocupado}>
              {ocupado ? "Subiendo…" : foto && !hereda ? "Cambiar foto" : "Subir foto propia"}
            </BotonBarra>
            {foto && !hereda && fotoDelPrincipal && (
              <BotonBarra onClick={usarLaDelPrincipal} disabled={ocupado}>
                Usar la del principal
              </BotonBarra>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
