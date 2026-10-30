"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotonBarra, CabeceraTarjeta, Pastilla } from "@/components/panel/piezas-panel";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { PASOS_ALTA } from "@/lib/crm/automatizar";
import { guardarSecuenciaAlta } from "./actions";
import type { SecuenciaAltaVista } from "./datos-fase4";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

/**
 * Dirección › Automatizaciones (fase 4). La secuencia de alta empieza apagada: al encenderla, cada dropshipper que se cree desde ese momento
 * recibe tareas de seguimiento el día 1, 3, 7 y 14 hasta su primer pedido. Lo que todavía no se hizo (reparto de chats, IA en el chat) se lista.
 */
export function VistaAutomatizaciones({ datos, personas, escribe }: { datos: SecuenciaAltaVista; personas: { id: string; nombre: string }[]; escribe: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [para, setPara] = useState(datos.responsableId ?? "");

  function guardar(encendida: boolean) {
    empezar(async () => {
      const r = await guardarSecuenciaAlta(encendida, para || null);
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(encendida ? "Secuencia de alta encendida: cuenta desde ahora." : datos.encendida ? "Secuencia de alta apagada." : "Guardado.");
      router.refresh();
    });
  }

  return (
    <>
      <section aria-labelledby="t-alta" className="rounded-[10px] border border-border bg-card">
        <CabeceraTarjeta id="t-alta" titulo="Secuencia de alta">
          <Pastilla tono={datos.encendida ? "exito" : "neutro"}>{datos.encendida ? "Encendida" : "Apagada"}</Pastilla>
        </CabeceraTarjeta>
        <div className="flex flex-col gap-4 p-3.5">
          <p className="m-0 text-sm">
            A cada dropshipper nuevo se le crea una tarea de seguimiento estos días, hasta que haga su primer pedido. Van a quien lo lleva («Lo lleva», en Clientes) o, si nadie, a la persona elegida
            abajo. Le llega el aviso en la campana y la ve en Tareas. Los chats no cambian.
          </p>
          <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
            {PASOS_ALTA.map((p) => (
              <li key={p.dia} className="rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="block text-xs font-semibold text-muted-foreground">Día {p.dia}</span>
                <span className="block font-medium">{p.titulo}</span>
                <span className="block text-xs text-muted-foreground">{p.detalle}</span>
              </li>
            ))}
          </ol>
          <p className="m-0 text-xs text-muted-foreground">
            Cuenta desde el momento en que se enciende: los dropshippers que ya estaban no reciben tareas. Si el sistema no corre algún día, al día siguiente se crea solo el paso más
            reciente (no se acumulan). Corre cada mañana.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Si nadie lo lleva, las tareas van a</span>
              <select value={para} onChange={(e) => setPara(e.target.value)} disabled={!escribe || pendiente} className={fieldClass}>
                <option value="">Elige una persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            {escribe &&
              (datos.encendida ? (
                <>
                  {para !== (datos.responsableId ?? "") && (
                    <BotonBarra onClick={() => guardar(true)} disabled={pendiente}>
                      Guardar persona
                    </BotonBarra>
                  )}
                  <BotonBarra onClick={() => guardar(false)} disabled={pendiente}>
                    Apagar
                  </BotonBarra>
                </>
              ) : (
                <BotonBarra principal onClick={() => guardar(true)} disabled={pendiente || !para}>
                  Encender
                </BotonBarra>
              ))}
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            {datos.encendidaEn && datos.encendida ? `Encendida desde el ${fechaHora(datos.encendidaEn)}. ` : ""}
            {datos.tareasCreadas ? `Lleva ${datos.tareasCreadas} tareas creadas a ${datos.dropshippers} dropshippers. ` : "Todavía no creó ninguna tarea. "}
            {datos.actualizadoPor && datos.actualizadoEn ? `Último cambio: ${datos.actualizadoPor}, ${fechaHora(datos.actualizadoEn)}.` : ""}
          </p>
        </div>
      </section>

      <section aria-labelledby="t-despues" className="rounded-[10px] border border-border bg-card">
        <CabeceraTarjeta id="t-despues" titulo="Para más adelante" />
        <ul className="m-0 flex list-none flex-col gap-2 p-3.5 text-sm">
          <li>
            <span className="font-medium">Reparto automático de chats.</span> <span className="text-muted-foreground">Asignar cada chat nuevo por turnos. Quedó pendiente para no cambiar los chats de Comercial y Atención.</span>
          </li>
          <li>
            <span className="font-medium">Resumen y borrador con IA en el chat.</span> <span className="text-muted-foreground">Un botón que resume la conversación y propone una respuesta que la persona revisa antes de enviar. Pendiente por la misma razón.</span>
          </li>
        </ul>
      </section>
    </>
  );
}
