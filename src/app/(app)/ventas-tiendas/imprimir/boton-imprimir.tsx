"use client";

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-md bg-foreground px-3 py-1.5 text-background">
      Imprimir
    </button>
  );
}
