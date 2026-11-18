"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { enviarMensajeDato, marcarMensajeManual, type PedirDato } from "../ia-actions";

const BOTON = `rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

/** Lo que se le explica a la persona cuando el mensaje no salió solo. */
const EXPLICACION: Record<string, string> = {
  pendiente_plantilla: "Pasaron más de 24 horas del último mensaje del cliente: WhatsApp solo deja escribirle con una plantilla de iComfly. Copia el mensaje y mándaselo desde iComfly, y luego marca «Ya se le envió a mano».",
  sin_chat: "El cliente todavía no tiene un chat con la tienda en iComfly. Cópiale el mensaje y mándaselo por donde hables con él, y luego marca «Ya se le envió a mano».",
};

/**
 * «Falta un dato»: cuando una persona marca que a un pedido le falta algo, el sistema no le escribe solo al cliente: aquí le pregunta si quiere mandarle el mensaje por WhatsApp o si ya se lo mandó
 * a mano (16 nov 2026, pedido de Hernán). «Ahora no» lo deja pendiente: se puede volver a preguntar desde la ficha del pedido.
 */
export function PreguntaMensaje({ p, alCerrar }: { p: PedirDato; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; tono: "error" | "info" } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const yaPedido = p.estado === "enviado" || p.estado === "manual";

  function enviar() {
    setAviso(null);
    empezar(async () => {
      const r = await enviarMensajeDato(p.analisisId);
      if (r.estado === "enviado") {
        mostrarToast("Mensaje enviado al cliente por WhatsApp.");
        router.refresh();
        return alCerrar();
      }
      if (r.estado && EXPLICACION[r.estado]) return setAviso({ texto: EXPLICACION[r.estado], tono: "info" });
      setAviso({ texto: r.error ?? "No se pudo enviar el mensaje.", tono: "error" });
    });
  }
  function yaEnviado() {
    setAviso(null);
    empezar(async () => {
      const r = await marcarMensajeManual(p.analisisId);
      if (r.error) return setAviso({ texto: r.error, tono: "error" });
      mostrarToast("Anotado: ya se le envió el mensaje.");
      router.refresh();
      alCerrar();
    });
  }
  async function copiar() {
    try {
      await navigator.clipboard.writeText(p.mensaje);
      setCopiado(true);
    } catch {
      setAviso({ texto: "No se pudo copiar: selecciona el texto del mensaje y cópialo.", tono: "error" });
    }
  }

  return (
    <Ventana abierto alCerrar={() => !pendiente && alCerrar()} ancho="md" titulo={<span className="text-base font-semibold">{p.tipo === "adelanto" ? (p.numero ? `Pedido ${p.numero}: pago por adelantado` : "Pago por adelantado") : p.numero ? `Pedido ${p.numero}: falta un dato` : "Falta un dato"}</span>}>
      <div className="flex flex-col gap-4 p-4">
        {p.tipo === "adelanto" ? (
          <p className="m-0 text-sm">
            Este pedido es de una zona de <b>pago por adelantado</b>. ¿Le escribimos al cliente por WhatsApp para avisarle y pedirle el pago?
          </p>
        ) : (
          <p className="m-0 text-sm">
            A la dirección le falta <b>{p.falta}</b>. ¿Le escribimos al cliente por WhatsApp para pedírselo?
          </p>
        )}
        {p.tipo === "adelanto" && p.sinMetodos && (
          <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm">Esta tienda todavía no tiene métodos de pago registrados: el mensaje sale sin ellos. Regístralos en la sección «Pago por adelantado» de esta pantalla.</p>
        )}
        {yaPedido && (
          <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm">
            {p.estado === "manual" ? "Ya se le había enviado un mensaje a mano." : p.tipo === "adelanto" ? "Ya se le había avisado por WhatsApp." : "Ya se le había pedido un dato por WhatsApp."} {p.tipo === "adelanto" ? "Envíalo de nuevo solo si hace falta." : "Envíalo de nuevo solo si es otro dato."}
          </p>
        )}
        <div>
          <p className={`${labelClass} m-0`}>El mensaje que se le mandaría</p>
          <p className="m-0 mt-1 whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{p.mensaje}</p>
        </div>
        {aviso && (
          <p role="alert" className={`m-0 rounded-md px-3 py-2 text-[13px] ${aviso.tono === "error" ? "bg-destructive-soft text-destructive" : "bg-muted text-foreground"}`}>
            {aviso.texto}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" disabled={pendiente} onClick={copiar} className={`mr-auto ${BOTON}`}>
            {copiado ? "Copiado" : "Copiar mensaje"}
          </button>
          <button type="button" disabled={pendiente} onClick={alCerrar} className={BOTON}>
            Ahora no
          </button>
          <button type="button" disabled={pendiente} onClick={yaEnviado} className={BOTON}>
            Ya se le envió a mano
          </button>
          <button type="button" disabled={pendiente} onClick={enviar} className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Enviando…" : "Enviar mensaje"}
          </button>
        </div>
      </div>
    </Ventana>
  );
}
