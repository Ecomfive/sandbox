"use client";

import { useRouter } from "next/navigation";

/** El producto del seguimiento: al cambiarlo, la página carga el suyo (`?p=PA-11253`). */
export function ElegirProducto({ opciones, valor }: { opciones: { valor: string; etiqueta: string }[]; valor: string }) {
  const router = useRouter();
  return (
    <div className="filtros">
      <label htmlFor="producto-seg" className="meta">
        Producto
      </label>
      <select id="producto-seg" value={valor} onChange={(e) => router.push(`/tu-winner/seguimiento?p=${encodeURIComponent(e.target.value)}`)}>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
