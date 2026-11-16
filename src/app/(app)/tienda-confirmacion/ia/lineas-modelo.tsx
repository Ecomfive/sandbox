import type { ResultadoModelo } from "@/lib/confirmacion-ia/combinar";
import type { FilaAnalisis } from "@/lib/confirmacion-ia/servidor";

export const NOMBRE_IA: Record<string, string> = { openai: "ChatGPT", anthropic: "Claude" };

/** Lo que contestó cada IA, en una línea. */
export function LineaModelo({ m }: { m: ResultadoModelo | FilaAnalisis["modelos"][number] }) {
  const r = "respuesta" in m ? m.respuesta : (m as FilaAnalisis["modelos"][number]);
  if (!m.ok) return <li className="text-sm text-destructive">{NOMBRE_IA[m.proveedor] ?? m.proveedor}: {(m as { error?: string | null }).error ?? "no contestó"}</li>;
  const zona = r && "zona" in r && r.zona ? (r.zona === "no_se" || r.zona === "no_aplica" ? "zona sin decidir" : `zona ${r.zona}`) : "";
  const completa = r && "completa" in r ? (r.completa ? "completa" : `incompleta (falta ${r.falta ?? "algo"})`) : "";
  return (
    <li className="text-sm">
      <b>{NOMBRE_IA[m.proveedor] ?? m.proveedor}:</b> {[zona, completa].filter(Boolean).join(" · ")}
      {r && "motivo" in r && r.motivo ? <span className="block text-xs text-muted-foreground">{r.motivo}</span> : null}
    </li>
  );
}
