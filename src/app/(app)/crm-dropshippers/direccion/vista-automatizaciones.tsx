"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PASOS_ALTA } from "@/lib/crm/automatizar";
import type { TipoAlerta } from "@/lib/crm/salud";
import { guardarSecuenciaAlta } from "./actions";
import type { SecuenciaAltaVista } from "./datos-fase4";
import { Insignia, Tarjeta } from "./piezas-direccion";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

/** Las alertas de «Qué atender hoy»: siempre encendidas (solo avisan a Dirección, no hacen nada solas). */
const ALERTAS: { tipo: TipoAlerta; nombre: string; cuando: string }[] = [
  { tipo: "caida", nombre: "Caída de pedidos", cuando: "Pidió 40 % menos en los últimos 14 días que en los 14 anteriores, o lleva 10 a 20 días sin pedir cuando antes pedía seguido" },
  { tipo: "dormido", nombre: "Dormido", cuando: "Lleva de 21 a 59 días sin pedir y antes había pedido" },
  { tipo: "devoluciones", nombre: "Devoluciones altas", cuando: "Le devuelven el 25 % o más de sus pedidos cerrados en 60 días" },
  { tipo: "sin_primer_pedido", nombre: "Sin primer pedido", cuando: "Entró hace 7 a 45 días y todavía no ha pedido" },
];

/** El interruptor como en el prototipo: una pista con la bolita y el estado al lado. */
function Interruptor({ encendido, etiqueta, disabled, alPulsar }: { encendido: boolean; etiqueta: string; disabled?: boolean; alPulsar?: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={encendido}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={alPulsar}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${encendido ? "text-foreground" : "text-muted-foreground"} ${anilloFoco}`}
    >
      <span aria-hidden="true" className={`flex h-6 w-10 items-center rounded-full p-0.5 ${encendido ? "justify-end bg-primario" : "justify-start bg-border-control"}`}>
        <span className="block h-5 w-5 rounded-full bg-white" />
      </span>
      {encendido ? "Encendida" : "Apagada"}
    </button>
  );
}

function Regla({ nombre, cuando, hace, uso, children }: { nombre: string; cuando: string; hace: string; uso: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-[1_1_26rem] flex-col gap-1.5">
        <span className="text-[15px] font-bold">{nombre}</span>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">Cuándo</span>
          <span>{cuando}</span>
          <span className="text-muted-foreground">Qué hace</span>
          <span>{hace}</span>
        </div>
        <span className="text-xs text-muted-foreground">{uso}</span>
      </div>
      {children}
    </li>
  );
}

/**
 * Dirección › Automatizaciones (fase 4), como las reglas del prototipo: las alertas de «Qué atender hoy» (siempre encendidas), la secuencia de
 * alta (con interruptor; empieza apagada) y lo que quedó para más adelante (reparto de chats e IA en el chat), sin interruptor.
 */
export function VistaAutomatizaciones({
  datos,
  personas,
  escribe,
  alertasAbiertas,
}: {
  datos: SecuenciaAltaVista;
  personas: { id: string; nombre: string }[];
  escribe: boolean;
  /** Cuántas alertas de cada tipo hay ahora en «Qué atender hoy». */
  alertasAbiertas: Partial<Record<TipoAlerta, number>>;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [para, setPara] = useState(datos.responsableId ?? "");
  const encendidas = 4 + (datos.encendida ? 1 : 0);

  function guardar(encendida: boolean) {
    empezar(async () => {
      const r = await guardarSecuenciaAlta(encendida, para || null);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(encendida ? (datos.encendida ? "Guardado." : "Secuencia de alta encendida: cuenta desde ahora.") : "Secuencia de alta apagada.");
      router.refresh();
    });
  }

  return (
    <Tarjeta id="t-reglas" titulo="Reglas automáticas" extra={`${encendidas} de 7 encendidas`}>
      <ul className="m-0 list-none p-0">
        {ALERTAS.map((a) => (
          <Regla
            key={a.tipo}
            nombre={a.nombre}
            cuando={a.cuando}
            hace="Sale en «Qué atender hoy» con lo que se sugiere hacer; desde ahí se crea una tarea o se marca atendida"
            uso={`${alertasAbiertas[a.tipo] ?? 0} alertas abiertas ahora`}
          >
            <Insignia tono="exito">Siempre encendida</Insignia>
          </Regla>
        ))}

        <Regla
          nombre="Secuencia de alta"
          cuando="Se crea un dropshipper nuevo (desde que se enciende; los que ya estaban no cuentan)"
          hace={`Crea una tarea ${PASOS_ALTA.map((p) => `el día ${p.dia} (${p.titulo.toLowerCase()})`).join(", ")}, hasta su primer pedido. Va a quien lo lleva o, si nadie, a la persona elegida`}
          uso={
            datos.encendida
              ? `${datos.encendidaEn ? `Encendida desde el ${fechaHora(datos.encendidaEn)}. ` : ""}${datos.tareasCreadas ? `${datos.tareasCreadas} tareas creadas a ${datos.dropshippers} dropshippers.` : "Todavía no creó ninguna tarea."}`
              : `Apagada${datos.actualizadoPor && datos.actualizadoEn ? ` (último cambio: ${datos.actualizadoPor}, ${fechaHora(datos.actualizadoEn)})` : ""}. Para encenderla, elige a quién van las tareas de los que nadie lleva.`
          }
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Si nadie lo lleva, van a</span>
              <select value={para} onChange={(e) => setPara(e.target.value)} disabled={!escribe || pendiente} className={fieldClass}>
                <option value="">Elige una persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            {datos.encendida && escribe && para !== (datos.responsableId ?? "") && (
              <button type="button" onClick={() => guardar(true)} disabled={pendiente} className={`min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-semibold hover:bg-muted ${anilloFoco}`}>
                Guardar persona
              </button>
            )}
            <Interruptor
              encendido={datos.encendida}
              etiqueta={datos.encendida ? "Apagar la secuencia de alta" : "Encender la secuencia de alta"}
              disabled={!escribe || pendiente || (!datos.encendida && !para)}
              alPulsar={() => guardar(!datos.encendida)}
            />
          </div>
        </Regla>

        <Regla
          nombre="Reparto automático de chats"
          cuando="Llega un chat nuevo sin asignar"
          hace="Lo asigna por turnos a alguien del área que le corresponde"
          uso="Pendiente: quedó para más adelante para no cambiar cómo trabajan Comercial y Atención con sus chats."
        >
          <Interruptor encendido={false} etiqueta="Reparto automático de chats: pendiente" disabled />
        </Regla>
        <Regla
          nombre="Resumen y borrador con IA en el chat"
          cuando="Alguien del equipo abre un chat"
          hace="Resume la conversación y propone una respuesta que la persona revisa antes de enviar (nunca envía sola)"
          uso="Pendiente: quedó para más adelante por la misma razón."
        >
          <Interruptor encendido={false} etiqueta="Resumen y borrador con IA: pendiente" disabled />
        </Regla>
      </ul>
    </Tarjeta>
  );
}
