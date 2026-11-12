import { Bandera } from "@/components/paises/bandera";
import { anilloFoco } from "@/components/ui/field";
import { nombrePais, vendeEnPorPais, type VendeEn } from "@/lib/whatsapp/origen-chat";

/**
 * «Dónde vende» agrupado por país (11 nov 2026, pedido de Jhokser): un dropshipper puede vender en varios países y, en cada uno, en varias plataformas, así que se muestra la
 * bandera del país una sola vez y a su lado las plataformas de ese país («🇵🇦 Dropi» · «🇨🇷 Dropi EFFI»). La bandera es la del país donde **vende**, no la del número de
 * atención por el que escribe (esa queda fuera del chat, como estaba). Sirve sin estado: la usan la lista del CRM, la ficha del chat y el encabezado del chat.
 * Con `alQuitar` cada plataforma lleva su ✕ (solo donde se puede escribir).
 */
export function VendeEnPorPais({
  vende,
  soloPaises = [],
  alQuitar,
  tamano = "normal",
}: {
  vende: readonly VendeEn[];
  /** Países de su ficha sin plataforma conocida: salen solo con la bandera. */
  soloPaises?: readonly string[];
  alQuitar?: (v: VendeEn) => void;
  tamano?: "normal" | "chico";
}) {
  const grupos = vendeEnPorPais(vende, soloPaises);
  if (!grupos.length) return null;
  const texto = tamano === "chico" ? "text-[11px]" : "text-xs";
  return (
    <span className="flex flex-wrap gap-1.5">
      {grupos.map((g) => (
        <span key={g.pais} className={`inline-flex items-center gap-1.5 rounded-full border border-border-control py-px pl-2 pr-1.5 font-semibold whitespace-nowrap ${texto}`}>
          <Bandera codigo={g.pais} />
          <span className="sr-only">{nombrePais(g.pais)}: </span>
          {g.plataformas.map((v, i) => (
            <span key={v.plataforma} className="inline-flex items-center gap-0.5">
              {i > 0 && <span aria-hidden="true" className="mr-1 h-3 w-px bg-border-control" />}
              {v.plataforma}
              {alQuitar && (
                <button
                  type="button"
                  onClick={() => alQuitar(v)}
                  aria-label={`Quitar ${v.plataforma} ${nombrePais(g.pais)}`}
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </span>
          ))}
          {!g.plataformas.length && <span className="font-normal text-muted-foreground">{nombrePais(g.pais)}</span>}
        </span>
      ))}
    </span>
  );
}
