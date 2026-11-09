"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { enlaceWhatsapp } from "@/lib/finanzas/informe-envio";
import { enviarInformeAhora, enviarResumenAhora } from "./actions";

const clase = `inline-flex h-8 shrink-0 items-center rounded-md border border-border-control bg-card px-3 text-sm hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

/** «Enviar ahora» del informe mensual por correo. */
export function BotonEnviarInforme({ mes, deshabilitado }: { mes: string | null; deshabilitado?: boolean }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente || deshabilitado}
      onClick={() =>
        empezar(async () => {
          const r: { error?: string; resumen?: string } = await enviarInformeAhora(mes).catch(() => ({ error: "Se cortó la conexión." }));
          mostrarToast(r.error ?? r.resumen ?? "Listo", r.error ? "destructive" : "success");
          router.refresh();
        })
      }
      className={clase}
    >
      {pendiente ? "Enviando…" : "Enviar ahora"}
    </button>
  );
}

/**
 * El resumen semanal: con WhatsApp configurado lo manda a los números; sin él, abre WhatsApp (wa.me) con el texto para
 * elegir a quién mandarlo. La pestaña se abre en el mismo clic (si no, el navegador la bloquea) y se completa al tener el
 * texto.
 */
export function BotonResumenSemanal({ automatico }: { automatico: boolean }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        const pestana = automatico ? null : window.open("about:blank", "_blank");
        empezar(async () => {
          const r = await enviarResumenAhora().catch(() => ({ error: "Se cortó la conexión." }) as { error: string; texto?: string });
          if (!automatico) {
            if (r.texto && pestana) {
              pestana.opener = null;
              pestana.location.href = enlaceWhatsapp(r.texto);
            } else pestana?.close();
          }
          if (r.error) mostrarToast(r.error, "destructive");
          else if (automatico) mostrarToast("resumen" in r && r.resumen ? r.resumen : "Enviado");
          router.refresh();
        });
      }}
      className={clase}
    >
      {pendiente ? "Armando…" : automatico ? "Enviar ahora" : "Abrir en WhatsApp"}
    </button>
  );
}
