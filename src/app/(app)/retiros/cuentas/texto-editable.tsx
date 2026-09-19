"use client";

import { useState, useTransition } from "react";
import { actualizarCuentaRetiro } from "./actions";
import { fieldClassSm } from "@/components/ui/field";

/** Texto que se vuelve un campo editable con un clic y guarda al salir o con Enter. */
export function TextoEditable({
  id,
  campo,
  valor,
  placeholder,
}: {
  id: string;
  campo: "nombre" | "detalle";
  valor: string;
  placeholder?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const [pending, startTransition] = useTransition();

  function guardar() {
    setEditando(false);
    if (texto === valor) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set(campo, texto);
    startTransition(() => {
      actualizarCuentaRetiro(formData);
    });
  }

  if (editando) {
    return (
      <input
        type="text"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTexto(valor);
            setEditando(false);
          }
        }}
        className={`${fieldClassSm} w-full min-w-[8rem]`}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => setEditando(true)}
      className="w-full rounded px-1 py-0.5 text-left hover:bg-muted disabled:opacity-50"
      title="Clic para editar"
    >
      {valor || <span className="text-muted-foreground">{placeholder ?? "—"}</span>}
    </button>
  );
}
