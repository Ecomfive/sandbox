"use client";

import { usePathname, useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { CrearPaisPanel } from "@/components/paises/crear-pais-panel";

const COOKIE = "compras-vista";

/**
 * Qué compras se ven: todos los países, uno solo o Importadora. Va en la dirección (`?ver=`) para poder compartirla y se
 * recuerda en una cookie para que se mantenga al pasar de una pestaña a otra. Con permiso de Configuración, «＋ País».
 */
export function SelectorVista({
  vista,
  paises,
  puedeAgregarPais = false,
}: {
  vista: string;
  paises: { codigo: string; nombre: string }[];
  puedeAgregarPais?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  function elegir(valor: string) {
    document.cookie = `${COOKIE}=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`;
    router.replace(`${pathname}?ver=${valor}`);
  }
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Qué compras ver"
        value={vista}
        onChange={(e) => elegir(e.target.value)}
        className={`h-[34px] rounded-lg border border-border-control bg-card px-2 text-[13px] ${anilloFoco}`}
      >
        <option value="todos">🗺️ Todos los países</option>
        {paises.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.nombre}
          </option>
        ))}
        <option value="importacion">🌍 Importadora</option>
      </select>
      {puedeAgregarPais && (
        <CrearPaisPanel
          boton={(abrir) => (
            <button
              type="button"
              onClick={abrir}
              aria-haspopup="dialog"
              className={`h-[34px] rounded-lg border border-border bg-card px-2.5 text-[13px] whitespace-nowrap hover:bg-muted ${anilloFoco}`}
            >
              ＋ País
            </button>
          )}
        />
      )}
    </div>
  );
}
