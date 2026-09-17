"use client";

import { useTransition } from "react";
import { togglePermiso } from "./actions";

export function PermisoCheckbox({
  rolId,
  modulo,
  activo,
}: {
  rolId: string;
  modulo: string;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={activo}
      disabled={pending}
      className="h-4 w-4 accent-accent disabled:opacity-50"
      onChange={(e) => {
        const formData = new FormData();
        formData.set("rol_id", rolId);
        formData.set("modulo", modulo);
        formData.set("activo", String(e.target.checked));
        startTransition(() => {
          togglePermiso(formData);
        });
      }}
    />
  );
}
