import { leerCorrelativo } from "@/lib/retiros/correlativo";

const formato = (numero: number) => `#${String(numero).padStart(4, "0")}`;

/**
 * Se muestra tras crear un retiro cuando el correlativo que la persona vio al abrir la ficha ya lo había
 * ocupado otro retiro (dos personas creando a la vez): el retiro se guardó con el siguiente libre y ese
 * es el número que debe escribirse en el concepto de Dropi.
 */
export function AvisoCorrelativo({ pedido, actual }: { pedido: string | undefined; actual: number }) {
  const numeroPedido = leerCorrelativo(pedido);
  if (numeroPedido === null || numeroPedido === actual) return null;
  return (
    <p role="status" className="rounded-xl border border-border bg-warning-soft px-4 py-3 text-sm text-foreground">
      Otra persona creó primero el retiro <span className="font-semibold tabular-nums">{formato(numeroPedido)}</span>. Este
      quedó como <span className="font-semibold tabular-nums">{formato(actual)}</span>: escribe{" "}
      <span className="font-semibold tabular-nums">{formato(actual)}</span> en el concepto del retiro en Dropi.
    </p>
  );
}
