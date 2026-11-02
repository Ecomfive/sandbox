/** Lo que se ve en cada pestaña de Gestión de IDs Drop mientras no haya datos conectados. */
export function VacioDrop({ texto }: { texto: string }) {
  return <p className="m-0 rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}
