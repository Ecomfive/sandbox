"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { linkClass } from "@/components/ui/link";

export interface SeccionDashboard {
  clave: string;
  titulo: string;
  valor: string;
  badge?: ReactNode;
  enlaces: { href: string; label: string }[];
  contenido: ReactNode;
}

export function DashboardSecciones({
  secciones,
  seccionInicial,
}: {
  secciones: SeccionDashboard[];
  seccionInicial?: string;
}) {
  const [activa, setActiva] = useState<string | null>(seccionInicial ?? null);
  const seccion = secciones.find((s) => s.clave === activa) ?? null;

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-3">
        {secciones.map((s) => (
          <button
            key={s.clave}
            type="button"
            onClick={() => setActiva((prev) => (prev === s.clave ? null : s.clave))}
            className={`min-w-[10rem] flex-1 rounded-lg border p-4 text-left transition-colors ${
              activa === s.clave
                ? "border-foreground bg-accent ring-1 ring-foreground"
                : "border-border bg-card hover:border-foreground/40"
            }`}
          >
            <p className="text-xs text-muted-foreground">{s.titulo}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{s.valor}</p>
            {s.badge}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {seccion ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">{seccion.titulo}</h2>
              <div className="flex gap-3">
                {seccion.enlaces.map((e) => (
                  <Link key={e.href} href={e.href} className={`text-xs ${linkClass}`}>
                    {e.label}
                  </Link>
                ))}
              </div>
            </div>
            {seccion.contenido}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Selecciona una métrica arriba para ver el detalle.
          </p>
        )}
      </div>
    </>
  );
}
