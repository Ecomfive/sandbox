"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ActualizarIcon, EnlaceIcon } from "@/lib/nav-icons";
import { desconectarIcomflyTienda, guardarConectorIcomfly, probarIcomflyTienda } from "./actions";

/**
 * La conexión de una tienda con iComfly (13 nov 2026), en Tiendas: se pega la «URL del servidor MCP» de la tienda (iComfly › Conector Claude) y «Conectar
 * iComfly» lleva a la autorización de iComfly, donde se pega el token de la tienda (nunca en el sistema ni en un chat). Conectada: «Probar» y «Desconectar».
 */
export function ConectarIcomfly({ tiendaId, url, conectado, ultimaPrueba, ultimoError }: { tiendaId: string; url: string | null; conectado: boolean; ultimaPrueba: string | null; ultimoError: string | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const [texto, setTexto] = useState(url ?? "");
  if (conectado)
    return (
      <span className="flex flex-col items-start gap-1.5">
        <span className="text-xs text-success">● {ultimaPrueba ?? "Conectada"}</span>
        {ultimoError && <span className="text-xs text-destructive">{ultimoError}</span>}
        <span className="flex flex-wrap gap-1.5">
          <BotonAccion
            icono={ActualizarIcon}
            disabled={pendiente}
            onClick={() =>
              start(async () => {
                const r = await probarIcomflyTienda(tiendaId);
                if ("error" in r) mostrarToast(r.error, "destructive");
                else mostrarToast(`iComfly responde: ${r.resumen}`);
                router.refresh();
              })
            }
          >
            {pendiente ? "Probando…" : "Probar"}
          </BotonAccion>
          <BotonAccion
            icono={EnlaceIcon}
            disabled={pendiente}
            onClick={() =>
              start(async () => {
                const r = await desconectarIcomflyTienda(tiendaId);
                if (r.error) mostrarToast(r.error, "destructive");
                else mostrarToast("iComfly desconectado.");
                router.refresh();
              })
            }
          >
            Desconectar
          </BotonAccion>
        </span>
      </span>
    );
  return (
    <form
      className="flex min-w-[16rem] flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await guardarConectorIcomfly(tiendaId, texto);
          if (r.error) return mostrarToast(r.error, "destructive");
          window.location.href = `/api/icomfly/conectar?tienda=${tiendaId}`;
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        URL del servidor MCP (iComfly › Conector Claude)
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="https://api.icomfly.com/mcp/c_…" className={`${fieldClass} h-8 text-xs`} spellCheck={false} autoComplete="off" />
      </label>
      {ultimoError && <span className="text-xs text-destructive">{ultimoError}</span>}
      <span>
        <BotonAccion icono={EnlaceIcon} type="submit" disabled={pendiente || !texto.trim()}>
          {pendiente ? "Abriendo iComfly…" : "Conectar iComfly"}
        </BotonAccion>
      </span>
    </form>
  );
}
