"use client";

import { useTransition } from "react";
import { actualizarCuentaRetiro } from "./actions";
import { fieldClassSm } from "@/components/ui/field";

const TIPOS = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "binance", etiqueta: "Binance" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export function TipoEditable({ id, tipo }: { id: string; tipo: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={tipo}
      disabled={pending}
      onChange={(e) => {
        const formData = new FormData();
        formData.set("id", id);
        formData.set("tipo", e.target.value);
        startTransition(() => {
          actualizarCuentaRetiro(formData);
        });
      }}
      className={`${fieldClassSm} disabled:opacity-50`}
    >
      {TIPOS.map((t) => (
        <option key={t.valor} value={t.valor}>
          {t.etiqueta}
        </option>
      ))}
    </select>
  );
}
