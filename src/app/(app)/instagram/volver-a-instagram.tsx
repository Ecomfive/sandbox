"use client";

import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { avisarActualizacionInstagram } from "@/lib/instagram/canal";

const boton = `inline-flex items-center self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/**
 * El botón de las pantallas de resultado que abre el marcador de la Biblioteca (otra pestaña): avisa a la lista de Instagram que ya estaba
 * abierta para que se actualice sola y **cierra esta pestaña**, en vez de llevarla a Instagram y dejar la anterior sin actualizar. Si el
 * navegador no deja cerrarla (la pestaña no la abrió el marcador, sino alguien a mano), entonces sí va a la lista de Instagram.
 */
export function VolverAInstagram() {
  const router = useRouter();
  function volver() {
    avisarActualizacionInstagram();
    window.close();
    setTimeout(() => {
      if (!window.closed) router.push("/instagram");
    }, 300);
  }
  return (
    <button type="button" onClick={volver} className={boton}>
      Volver a Instagram
    </button>
  );
}
