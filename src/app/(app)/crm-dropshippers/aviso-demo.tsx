/** Franja que avisa que las cifras, nombres y conversaciones son inventados (`MODO_DEMO` en `datos-demo.ts`). */
export function AvisoDemo() {
  return (
    <p role="note" className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
      <span>
        <strong className="font-semibold text-foreground">Datos de ejemplo.</strong> Los nombres, cifras y conversaciones son inventados y
        no se guarda nada en la base.
      </span>
    </p>
  );
}
