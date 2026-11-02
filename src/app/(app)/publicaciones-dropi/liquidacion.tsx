"use client";

import { useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { useToast } from "@/components/ui/toast";
import { EtiquetaIcon } from "@/lib/nav-icons";
import { motivoLiquidacion } from "@/lib/publicaciones/botones-fila";
import { marcarLiquidacion } from "./actions";
import { BotonAccionApagado, BotonIconoFila } from "./boton-icono-fila";
import { estadoBotones, type FilaPublicacion } from "./def-publicaciones";

/** Pone o saca una publicación de liquidación y avisa cómo quedó. */
function useLiquidacion(f: FilaPublicacion) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const en = !!f.liquidacionDesde;
  const cambiar = () =>
    empezar(async () => {
      const r = await marcarLiquidacion(f.id, !en).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? (en ? "Fuera de liquidación" : "En liquidación"), r.error ? "destructive" : undefined);
    });
  return { en, pendiente, cambiar, motivo: motivoLiquidacion(estadoBotones(f)) };
}

/**
 * «En liquidación» de la fila (pedido de Alcides, 28 oct 2026): un producto con margen bajo que se liquida a propósito sale del aviso de margen bajo y
 * va a la tarjeta «En liquidación». Con la marca puesta, el ícono va en blanco sobre un círculo rojo y el mismo botón la quita. Solo cambia el sistema, no Dropi.
 */
export function BotonLiquidacionFila({ f }: { f: FilaPublicacion }) {
  const { en, pendiente, cambiar, motivo } = useLiquidacion(f);
  return (
    <BotonIconoFila
      texto={en ? "Sacar de liquidación" : "Poner en liquidación"}
      motivo={motivo}
      icono={EtiquetaIcon}
      nombre={f.nombre}
      onClick={cambiar}
      ocupado={pendiente}
      activo={en ? "rojo" : undefined}
    />
  );
}

/** Lo mismo en la fila de botones de la ficha. */
export function BotonLiquidacionFicha({ f }: { f: FilaPublicacion }) {
  const { en, pendiente, cambiar, motivo } = useLiquidacion(f);
  const texto = en ? "Sacar de liquidación" : "Poner en liquidación";
  if (motivo) return <BotonAccionApagado icono={EtiquetaIcon} texto={texto} motivo={motivo} />;
  return (
    <BotonAccion icono={EtiquetaIcon} tono={en ? "exito" : "alerta"} disabled={pendiente} onClick={cambiar}>
      {pendiente ? "Un momento..." : texto}
    </BotonAccion>
  );
}
