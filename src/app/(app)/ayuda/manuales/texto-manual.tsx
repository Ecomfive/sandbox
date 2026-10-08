import type { ReactNode } from "react";

/**
 * Muestra el texto de un manual con un formato simple, sin HTML (lo escribe una persona: nunca se interpreta como código):
 * «## Título», «- punto», «1. paso» y párrafos. Las líneas seguidas del mismo tipo de lista van juntas.
 */
export function TextoManual({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: { tipo: "ul" | "ol"; items: string[] } | null = null;
  const cerrar = () => {
    if (!lista) return;
    const { tipo, items } = lista;
    const clave = `l${bloques.length}`;
    bloques.push(
      tipo === "ul" ? (
        <ul key={clave} className="m-0 flex list-disc flex-col gap-1 pl-5">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <ol key={clave} className="m-0 flex list-decimal flex-col gap-1 pl-5">
          {items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      ),
    );
    lista = null;
  };
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    const punto = l.match(/^[-*]\s+(.*)$/);
    const paso = l.match(/^\d+[.)]\s+(.*)$/);
    if (punto || paso) {
      const tipo = punto ? "ul" : "ol";
      if (lista && lista.tipo !== tipo) cerrar();
      lista ??= { tipo, items: [] };
      lista.items.push((punto ?? paso)![1]);
      continue;
    }
    cerrar();
    if (!l) continue;
    const titulo = l.match(/^#{1,3}\s+(.*)$/);
    bloques.push(
      titulo ? (
        <h2 key={`h${bloques.length}`} className="mt-2 text-base font-semibold">
          {titulo[1]}
        </h2>
      ) : (
        <p key={`p${bloques.length}`} className="m-0">
          {l}
        </p>
      ),
    );
  }
  cerrar();
  return <div className="flex flex-col gap-2 text-[15px] leading-relaxed">{bloques}</div>;
}
