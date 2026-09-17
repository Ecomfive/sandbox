"use client";

import { useActionState } from "react";
import { invitarUsuario, type InvitarUsuarioState } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";

interface Rol {
  id: string;
  nombre: string;
}

const initialState: InvitarUsuarioState = { status: "idle" };

export function InvitarForm({ roles }: { roles: Rol[] }) {
  const [state, formAction, pending] = useActionState(invitarUsuario, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Correo</label>
        <input type="email" name="email" required className={`${fieldClass} w-56`} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Nombre</label>
        <input type="text" name="nombre" className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Rol</label>
        <select name="rol_id" className={fieldClass}>
          <option value="">Sin rol</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Invitando…" : "Invitar"}
      </Button>
      {state.status !== "idle" && (
        <p className={`w-full text-sm ${state.status === "error" ? "text-destructive" : "text-success"}`}>
          {state.mensaje}
        </p>
      )}
    </form>
  );
}
