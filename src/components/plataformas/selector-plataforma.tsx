"use client";

import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { DropIcon, DropiIcon } from "@/lib/nav-icons";
import { PLATAFORMAS, plataformaDe, type PlataformaId } from "@/lib/plataformas";

const LOGO: Record<PlataformaId, typeof DropiIcon> = { dropi: DropiIcon, drop: DropIcon };

/** Recuerda la plataforma elegida (la leen las páginas en el servidor). */
function recordar(cookie: string, id: PlataformaId) {
  document.cookie = `${cookie}=${id}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Elige la plataforma que se mira (Dropi o Drop; 3 nov 2026, pedido de Hernán). Se recuerda en una cookie (`cookie`) para que se mantenga al pasar de una pestaña a otra y se
 * vuelve a cargar la página. Drop solo existe en Costa Rica: eso lo dice el aviso de la página, no se esconde la opción.
 */
export function SelectorPlataforma({ plataforma, cookie }: { plataforma: PlataformaId; cookie: string }) {
  const router = useRouter();
  function elegir(id: PlataformaId) {
    if (id === plataforma) return;
    recordar(cookie, id);
    router.refresh();
  }
  return (
    <div role="group" aria-label="Plataforma" className="inline-flex w-fit items-center gap-1 rounded-xl border border-border bg-card p-1">
      {PLATAFORMAS.map((p) => {
        const Logo = LOGO[p.id];
        const activa = p.id === plataforma;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={activa}
            onClick={() => elegir(p.id)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${activa ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`}
          >
            <Logo marca className="h-5 w-5" />
            {plataformaDe(p.id).nombre}
          </button>
        );
      })}
    </div>
  );
}
