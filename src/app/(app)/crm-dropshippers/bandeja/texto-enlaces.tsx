"use client";

import { useMemo, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { partesConEnlaces, revisarArchivo, type ParteTexto } from "@/lib/whatsapp/enlaces";

type Enlace = Extract<ParteTexto, { tipo: "enlace" }>;

/**
 * El texto de un mensaje con sus enlaces revisados (31 oct 2026, pedido de Hernán; reglas en `@/lib/whatsapp/enlaces`): los normales y
 * los oficiales se abren como en WhatsApp; los sospechosos piden confirmar antes de abrirse; los peligrosos no se abren y el mensaje
 * avisa abajo por qué.
 */
export function TextoConEnlaces({ texto }: { texto: string }) {
  const partes = useMemo(() => partesConEnlaces(texto), [texto]);
  const [confirmar, setConfirmar] = useState<Enlace | null>(null);
  const peligrosos = partes.filter((p): p is Enlace => p.tipo === "enlace" && p.riesgo === "peligroso");
  return (
    <>
      <span className="whitespace-pre-wrap break-words">
        {partes.map((p, i) =>
          p.tipo === "texto" ? (
            <span key={i}>{p.texto}</span>
          ) : p.riesgo === "peligroso" || !p.url ? (
            <span key={i} title={p.motivos.join(" ")} className="text-destructive line-through decoration-1">
              <span aria-hidden="true">🚫 </span>
              {p.texto}
              <span className="sr-only"> (enlace bloqueado)</span>
            </span>
          ) : p.riesgo === "sospechoso" ? (
            <button
              key={i}
              type="button"
              onClick={() => setConfirmar(p)}
              title="Enlace sospechoso: toca para ver por qué antes de abrirlo"
              className={`inline cursor-pointer break-all rounded-sm text-left text-warning underline decoration-dotted underline-offset-2 ${anilloFoco}`}
            >
              <span aria-hidden="true">⚠️ </span>
              {p.texto}
              <span className="sr-only"> (enlace sospechoso)</span>
            </button>
          ) : (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow" className={`break-all rounded-sm text-[var(--wa-leido)] underline underline-offset-2 ${anilloFoco}`}>
              {p.texto}
            </a>
          ),
        )}
      </span>
      {peligrosos.length > 0 && (
        <span role="alert" className="mt-1.5 block rounded-md border border-destructive/40 bg-destructive-soft px-2 py-1.5 text-[12.5px] leading-snug text-destructive">
          <strong className="font-semibold">🚫 {peligrosos.length === 1 ? "Enlace bloqueado" : `${peligrosos.length} enlaces bloqueados`}.</strong> No lo abras ni lo reenvíes:{" "}
          {[...new Set(peligrosos.flatMap((p) => p.motivos))].join(" ")}
        </span>
      )}
      {confirmar && <ConfirmarEnlace enlace={confirmar} alCerrar={() => setConfirmar(null)} />}
    </>
  );
}

function ConfirmarEnlace({ enlace, alCerrar }: { enlace: Enlace; alCerrar: () => void }) {
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Este enlace puede ser una estafa" ancho="sm">
      <div className="flex flex-col gap-3 p-5 text-sm">
        <p className="m-0">
          Lleva a <strong className="break-all font-semibold">{enlace.sitio ?? enlace.texto}</strong>. Ábrelo solo si sabes quién lo mandó y para qué; nunca escribas ahí contraseñas, códigos de WhatsApp ni datos de pago.
        </p>
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          {enlace.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" autoFocus onClick={alCerrar} className={`h-9 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground hover:bg-accent-hover ${anilloFoco}`}>
            No abrir
          </button>
          <a
            href={enlace.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={alCerrar}
            className={`inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
          >
            Abrir de todas formas
          </a>
        </div>
      </div>
    </Ventana>
  );
}

/** Un documento que llegó por WhatsApp: el enlace para bajarlo, o el aviso de por qué no se puede (un .apk, un .exe…). */
export function DocumentoRevisado({ href, nombre }: { href: string; nombre: string | null }) {
  const revision = revisarArchivo(nombre, null);
  const etiqueta = (
    <>
      <span aria-hidden="true" className={`flex h-8 w-7 flex-none items-center justify-center rounded text-[9px] font-bold ${revision.riesgo === "peligroso" ? "bg-destructive text-white" : "bg-[var(--wa-acento)] text-[var(--wa-acento-texto)]"}`}>
        {revision.riesgo === "peligroso" ? "🚫" : "DOC"}
      </span>
      <span className="truncate">{nombre ?? "Abrir documento"}</span>
    </>
  );
  if (revision.riesgo === "peligroso") {
    return (
      <span className="mb-1 block">
        <span className="flex items-center gap-2 rounded-md bg-[var(--wa-panel)] px-2 py-2 text-[13px] font-medium line-through decoration-1">{etiqueta}</span>
        <span role="alert" className="mt-1 block text-[12.5px] leading-snug text-destructive">
          🚫 Archivo bloqueado. {revision.motivo}
        </span>
      </span>
    );
  }
  return (
    <span className="mb-1 block">
      <a href={href} target="_blank" rel="noreferrer" className={`flex items-center gap-2 rounded-md bg-[var(--wa-panel)] px-2 py-2 text-[13px] font-medium ${anilloFoco}`}>
        {etiqueta}
      </a>
      {revision.riesgo === "sospechoso" && <span className="mt-1 block text-[12.5px] leading-snug text-warning">⚠️ {revision.motivo}</span>}
    </span>
  );
}
