import type { AvisoRentabilidad } from "@/lib/meta-ads/rentabilidad";

/**
 * Cuánto deja cada venta entregada con el CPA de ahora (27 nov 2026, pedido de Hernán), dentro de una recomendación: en rojo si pierde; en morado suave si deja poco, si pasa del tope pero todavía es rentable o si va bien.
 * Solo informa: no cambia el tope ni lo que se recomienda apagar.
 */
export function AvisoRentable({ aviso, className = "" }: { aviso: AvisoRentabilidad | null | undefined; className?: string }) {
  if (!aviso) return null;
  const alerta = aviso.tono === "alerta";
  return (
    <p className={`m-0 rounded-md px-2.5 py-1.5 text-xs leading-relaxed ${alerta ? "bg-destructive-soft text-destructive" : "bg-primario-suave text-foreground"} ${className}`}>
      <span className="font-semibold">{aviso.titulo}</span> {aviso.texto}
    </p>
  );
}
