"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { textoVentana } from "@/lib/whatsapp/ventana";
import { ultimosMensajesDropshipper } from "./bandeja/actions";
import type { MensajeVista } from "./bandeja/datos-bandeja";

type Chat = { conversacionId: string; numero: string; mensajes: MensajeVista[]; ultimoEntranteEn: string | null; noLeidos: number };

const ETIQUETA: Record<string, string> = { imagen: "Foto", audio: "Audio", video: "Video", documento: "Documento", sticker: "Sticker", ubicacion: "Ubicación", reaccion: "Reacción" };

const hora = (iso: string) => {
  const d = new Date(iso);
  const h = d.toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? h : `${d.toLocaleDateString("es-PA", { day: "numeric", month: "short" })} ${h}`;
};

/**
 * La conversación de WhatsApp en la ficha del dropshipper (26 oct 2026): sus últimos mensajes con el número de la empresa y el enlace
 * para seguirla en la Bandeja de WhatsApp. Si nunca escribió, se le puede escribir desde el celular (iniciar una conversación desde el
 * sistema necesita una plantilla aprobada por Meta).
 */
export function ConversacionWhatsapp({ dropshipperId }: { dropshipperId: string }) {
  const [chat, setChat] = useState<Chat | null | "cargando" | "error">("cargando");
  useEffect(() => {
    let vigente = true;
    ultimosMensajesDropshipper(dropshipperId)
      .then((r) => vigente && setChat(r && "error" in r ? "error" : r))
      .catch(() => vigente && setChat("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId]);

  if (chat === "cargando") return <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>;
  if (chat === "error") return <p className="m-0 text-[13px] text-destructive">No se pudo cargar la conversación.</p>;
  if (!chat)
    return (
      <div className="flex flex-col gap-1.5 text-[13px]">
        <p className="m-0 text-muted-foreground">Todavía no ha escrito al WhatsApp de la empresa. Cuando escriba, la conversación aparece aquí y en la Bandeja de WhatsApp.</p>
      </div>
    );
  const ventana = textoVentana(chat.ultimoEntranteEn);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
        {chat.mensajes.map((m) => {
          const nuestro = m.direccion !== "entrante";
          const nota = m.direccion === "nota";
          return (
            <div key={m.id} className={`flex ${nuestro ? "justify-end" : "justify-start"}`}>
              <span
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug ${nota ? "border border-dashed border-warning bg-warning-soft" : nuestro ? "bg-primario-suave" : "border border-border bg-card"}`}
              >
                {nota && <span className="block text-[10.5px] font-semibold text-warning">Nota privada</span>}
                <span className="block whitespace-pre-wrap break-words">{m.texto ?? ETIQUETA[m.tipo] ?? "Mensaje"}</span>
                <span className="block text-right text-[10.5px] text-muted-foreground">{hora(m.momento)}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {chat.numero}
          {chat.noLeidos > 0 && <span className="font-semibold text-destructive"> · {chat.noLeidos} sin leer</span>}
          {ventana ? ` · ${ventana} para responder` : " · fuera de las 24 h"}
        </span>
        <Link href={`/crm-dropshippers/bandeja?abrir=${chat.conversacionId}`} className={`font-medium text-primario hover:underline ${anilloFoco}`}>
          Abrir en la bandeja →
        </Link>
      </div>
    </div>
  );
}
