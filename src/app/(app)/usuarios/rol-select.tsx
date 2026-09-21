"use client";

import { useTransition } from "react";
import { cambiarRolUsuario } from "./actions";
import { fieldClassSm } from "@/components/ui/field";

interface Rol {
  id: string;
  nombre: string;
}

export function RolSelect({
  perfilId,
  rolIdActual,
  roles,
  usuario,
}: {
  perfilId: string;
  rolIdActual: string | null;
  roles: Rol[];
  /** Nombre de la persona, para que el nombre del campo diga a quién se le cambia el rol. */
  usuario?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={usuario ? `Rol de ${usuario}` : "Rol del usuario"}
      className={`${fieldClassSm} disabled:opacity-50`}
      defaultValue={rolIdActual ?? ""}
      disabled={pending}
      onChange={(e) => {
        const formData = new FormData();
        formData.set("id", perfilId);
        formData.set("rol_id", e.target.value);
        startTransition(() => {
          cambiarRolUsuario(formData);
        });
      }}
    >
      <option value="">Sin rol</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nombre}
        </option>
      ))}
    </select>
  );
}
