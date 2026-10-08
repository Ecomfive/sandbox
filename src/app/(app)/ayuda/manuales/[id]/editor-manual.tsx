"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { eliminarManual, guardarManual } from "../../actions";
import type { Manual } from "../../datos-ayuda";
import { TextoManual } from "../texto-manual";

/**
 * Leer y editar un manual (para la administración): «Editar» abre el título, el texto, para quién es y si es borrador, con
 * la vista previa al lado. El texto usa un formato simple: «## Título», «- punto», «1. paso».
 */
export function EditorManual({ manual, modulosDisponibles }: { manual: Manual | null; modulosDisponibles: { valor: string; etiqueta: string }[] }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [editando, setEditando] = useState(manual === null);
  const [titulo, setTitulo] = useState(manual?.titulo ?? "");
  const [contenido, setContenido] = useState(manual?.contenido ?? "## Para qué\n\n## Pasos\n1. \n");
  const [modulos, setModulos] = useState<string[]>(manual?.modulos ?? []);
  const [borrador, setBorrador] = useState(manual?.borrador ?? true);
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const r = await guardarManual({ id: manual?.id ?? null, titulo, contenido, modulos, borrador });
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Manual guardado.");
      if (!manual && r.id) router.replace(`/ayuda/manuales/${r.id}`);
      else {
        setEditando(false);
        router.refresh();
      }
    });
  }
  function borrar() {
    if (!manual || !confirm(`¿Borrar el manual «${manual.titulo}»? No se puede deshacer.`)) return;
    startTransition(async () => {
      const r = await eliminarManual(manual.id);
      if (r.error) return mostrarToast(r.error, "destructive");
      mostrarToast("Manual borrado.");
      router.replace("/ayuda/manuales");
    });
  }

  if (!editando && manual)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{manual.titulo}</h1>
          <BotonBarra onClick={() => setEditando(true)}>Editar</BotonBarra>
        </div>
        <article className="rounded-[10px] border border-border bg-card p-5">
          <TextoManual texto={manual.contenido} />
        </article>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Título</span>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} placeholder="Ej: Recibir mercancía en bodega" className={fieldClass} />
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className={labelClass}>Lo ven (sin marcar ninguno, lo ve todo el mundo)</legend>
        <div className="flex flex-wrap gap-1.5">
          {modulosDisponibles.map((m) => {
            const activo = modulos.includes(m.valor);
            return (
              <button
                key={m.valor}
                type="button"
                aria-pressed={activo}
                onClick={() => setModulos((x) => (activo ? x.filter((v) => v !== m.valor) : [...x, m.valor]))}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
              >
                {m.etiqueta}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={borrador} onChange={(e) => setBorrador(e.target.checked)} />
        Borrador (todavía en revisión)
      </label>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Texto · «## Título», «- punto», «1. paso»</span>
          <textarea value={contenido} onChange={(e) => setContenido(e.target.value)} rows={20} className={`${fieldClass} font-mono text-[13px]`} />
        </label>
        <div className="flex flex-col gap-1">
          <span className={labelClass}>Vista previa</span>
          <article className="min-h-full rounded-[10px] border border-border bg-card p-4">
            <TextoManual texto={contenido} />
          </article>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <span className="flex gap-2">
          <BotonBarra principal onClick={guardar} disabled={pendiente || !titulo.trim()}>
            {pendiente ? "Guardando…" : "Guardar"}
          </BotonBarra>
          {manual && (
            <BotonBarra onClick={() => setEditando(false)} disabled={pendiente}>
              Cancelar
            </BotonBarra>
          )}
        </span>
        {manual && (
          <BotonBarra onClick={borrar} disabled={pendiente} className="text-destructive">
            Borrar manual
          </BotonBarra>
        )}
      </div>
    </div>
  );
}
