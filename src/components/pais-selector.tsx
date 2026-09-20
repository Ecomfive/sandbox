"use client";

import { useTransition } from "react";
import { setPaisActual } from "@/lib/pais-actions";
import { PAISES_NAV } from "@/lib/nav-data";

export function PaisSelector({ actual }: { actual: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="rounded-full border border-border-control bg-card px-3 py-1 text-sm disabled:opacity-50"
      value={actual}
      disabled={pending}
      onChange={(e) => {
        const codigo = e.target.value;
        startTransition(() => {
          setPaisActual(codigo);
        });
      }}
    >
      {PAISES_NAV.map((p) => (
        <option key={p.codigo} value={p.codigo} disabled={p.pronto}>
          {p.nombre}
          {p.pronto ? " (Pronto)" : ""}
        </option>
      ))}
    </select>
  );
}
