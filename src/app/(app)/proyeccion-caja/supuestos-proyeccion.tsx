"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { AjustesIcon, WalletIcon } from "@/lib/nav-icons";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { guardarSupuestos } from "./actions";

export interface ValoresSupuestos {
  cajaMinima: number;
  cobroVencido: number;
  pagoVencido: number;
  /** Se pide solo cuando no hay saldos iniciales. */
  pideCaja: boolean;
  cajaManual: number | null;
}

const pct = (v: number) => String(Math.round(v * 1000) / 10);

/** Botón «Supuestos» y su panel: caja mínima, qué parte de lo vencido se cobra y se paga, y la caja de hoy a mano. */
export function SupuestosProyeccion({ valores, puedeEscribir, etiqueta = "Supuestos" }: { valores: ValoresSupuestos; puedeEscribir: boolean; etiqueta?: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setAbierto(true);
        }}
        className={`${claseAccionAF4} ${anilloFoco}`}
      >
        <AjustesIcon className="h-4 w-4" aria-hidden="true" />
        {etiqueta}
      </button>
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Supuestos de la proyección" lado="derecha">
        <form
          className="flex flex-col gap-4"
          action={(formData) =>
            iniciar(async () => {
              const r = await guardarSupuestos(formData);
              if (r.error) {
                setError(r.error);
                return;
              }
              mostrarToast("Supuestos guardados");
              setAbierto(false);
              router.refresh();
            })
          }
        >
          <fieldset disabled={!puedeEscribir || pendiente} className="flex flex-col gap-4">
            {valores.pideCaja && (
              <Seccion icono={WalletIcon} titulo="Caja de hoy">
                <Campo etiqueta="Saldo de todas las cuentas en USD" id="campo-caja">
                  <input
                    id="campo-caja"
                    name="caja_inicial"
                    inputMode="decimal"
                    pattern="-?[0-9.,$ ]+"
                    data-enfocar
                    defaultValue={valores.cajaManual ?? ""}
                    placeholder="Ej: 42000.00"
                    className={`${fieldClass} w-full`}
                  />
                </Campo>
              </Seccion>
            )}
            <Seccion icono={AjustesIcon} titulo="Supuestos">
              <Campo etiqueta="Caja mínima en USD" id="campo-minima">
                <input
                  id="campo-minima"
                  name="caja_minima"
                  inputMode="decimal"
                  pattern="-?[0-9.,$ ]+"
                  defaultValue={valores.cajaMinima || ""}
                  placeholder="Ej: 20000.00"
                  className={`${fieldClass} w-full`}
                />
              </Campo>
              <Campo etiqueta="Por cobrar vencido que se cobra en la semana 1 (%)" id="campo-cobro">
                <input
                  id="campo-cobro"
                  name="cobro_vencido"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  required
                  defaultValue={pct(valores.cobroVencido)}
                  className={`${fieldClass} w-full`}
                />
              </Campo>
              <Campo etiqueta="Por pagar vencido que se paga en la semana 1 (%)" id="campo-pago">
                <input
                  id="campo-pago"
                  name="pago_vencido"
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  required
                  defaultValue={pct(valores.pagoVencido)}
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            </Seccion>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {puedeEscribir && (
            <button
              type="submit"
              disabled={pendiente}
              className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 ${anilloFoco}`}
            >
              {pendiente ? "Guardando…" : "Guardar supuestos"}
            </button>
          )}
        </form>
      </Ventana>
    </>
  );
}
