import type { Moneda } from "@/lib/af4/formato";
import { textoLectorVariacion, textoVariacion, tonoVariacion, type ModoVariacion, type Variacion as DatosVariacion } from "@/lib/af4/variacion";
import { FlechaVariacionIcon } from "./iconos-af4";

const PUNTO = { success: "bg-success", destructive: "bg-destructive", neutral: "bg-muted-foreground" } as const;

/**
 * Una variación en una línea: punto de color (bueno o malo, según el sentido del indicador), flecha, la cifra y contra
 * qué se compara («+12.4 % vs ago 26»). El color está solo en el punto; la flecha y el texto llevan la dirección, así
 * que no depende del color. Un lector de pantalla oye la frase completa («Sube 12.4 % frente a ago 26, favorable»).
 */
export function Variacion({
  v,
  contra,
  modo = "pct",
  moneda = "USD",
  className = "",
  enCelda = false,
}: {
  v: DatosVariacion;
  /** Contra qué se compara, corto: «ago 26», «presupuesto», «año anterior». */
  contra: string;
  modo?: ModoVariacion;
  moneda?: Moneda;
  className?: string;
  /**
   * Dentro de una celda de tabla cuya columna ya dice contra qué se compara («Desvío»): sin el «vs …» visible (los
   * lectores de pantalla lo siguen oyendo), con el tamaño de letra de la tabla y alineada a la derecha.
   */
  enCelda?: boolean;
}) {
  const tono = tonoVariacion(v);
  return (
    // En una tarjeta angosta (el celular) el «vs …» baja a la línea siguiente en vez de salirse de la tarjeta.
    <span className={`min-w-0 items-center gap-1 ${enCelda ? "inline-flex justify-end" : "flex max-w-full flex-wrap gap-y-0 text-xs"} ${className}`.trim()}>
      <span className="sr-only">{textoLectorVariacion(v, contra, modo, moneda)}</span>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />
      <FlechaVariacionIcon direccion={v.direccion} className="h-3 w-3 shrink-0 text-foreground-soft" />
      <span aria-hidden="true" className={`tabular-nums ${enCelda ? "text-foreground" : "font-medium text-foreground-soft"}`}>
        {v.direccion === "igual" ? "Sin cambio" : textoVariacion(v, modo, moneda)}
      </span>
      {!enCelda && (
        <span aria-hidden="true" className="text-muted-foreground">
          vs {contra}
        </span>
      )}
    </span>
  );
}
