"use client";

import { fieldClass } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";
import type { Persona } from "./ficha-publicacion";

/**
 * Los responsables de una publicación (pueden ser varios): cada uno como una etiqueta con su ✕ y una lista para agregar otro.
 * Con `nombre`, además deja un campo oculto por persona para los formularios que se envían solos (crear).
 */
export function SelectorResponsables({ valor, cambiar, personas, nombre, vacio = "Sin responsable" }: { valor: string[]; cambiar: (v: string[]) => void; personas: Persona[]; nombre?: string; vacio?: string }) {
  const porId = new Map(personas.map((p) => [p.id, p.nombre]));
  const libres = personas.filter((p) => !valor.includes(p.id));
  return (
    <div className="flex flex-col gap-2">
      {valor.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Responsables">
          {valor.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full bg-accent py-0.5 pl-2.5 pr-1 text-sm text-accent-foreground">
              {porId.get(id) ?? "Usuario inactivo"}
              <button type="button" onClick={() => cambiar(valor.filter((x) => x !== id))} aria-label={`Quitar a ${porId.get(id) ?? "este usuario"}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-accent-hover">
                <CerrarIcon aria-hidden="true" className="h-3 w-3" />
              </button>
              {nombre && <input type="hidden" name={nombre} value={id} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      )}
      {libres.length > 0 && (
        <select
          aria-label="Agregar responsable"
          value=""
          onChange={(e) => {
            if (e.target.value) cambiar([...valor, e.target.value]);
          }}
          className={`${fieldClass} w-full`}
        >
          <option value="">+ Agregar responsable</option>
          {libres.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
