"use client";

import { useRef, useState, useTransition } from "react";
import { subirAvatar } from "@/lib/perfil-actions";

export function AvatarUpload({
  nombre,
  email,
  avatarUrl,
}: {
  nombre: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const iniciales = (nombre || email).trim().charAt(0).toUpperCase();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    const formData = new FormData();
    formData.set("avatar", archivo);
    startTransition(async () => {
      try {
        await subirAvatar(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        title="Cambiar foto de perfil"
        className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border bg-muted disabled:opacity-50"
      >
        {avatarUrl ? (
          // Viene de Supabase Storage con URL dinámica; next/image requeriría configurar el dominio remoto.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
            {iniciales}
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
      {error && <p className="mt-1 max-w-[8rem] text-center text-[10px] text-destructive">{error}</p>}
    </div>
  );
}
