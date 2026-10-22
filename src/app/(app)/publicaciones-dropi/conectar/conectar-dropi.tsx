"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { anilloFoco } from "@/components/ui/field";
import { leerFragmentoConectar } from "@/lib/publicaciones/marcador-conectar-dropi";
import { conectarDropi, type ResultadoConexion } from "../conexion-actions";

type Estado = { tipo: "conectando" } | { tipo: "sin_sesion" } | { tipo: "listo"; r: ResultadoConexion };

const caja = "rounded-lg border border-border bg-card px-4 py-3 text-sm";
const PASOS = ["Recibiendo la sesión de Dropi", "Comprobándola con Dropi", "Guardándola cifrada", "Aplicando los cambios pendientes"];
const hora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Recibe la sesión de Dropi que dejó el favorito «Conectar Dropi» en el fragmento de la dirección, la borra de la barra en cuanto la
 * lee (recargar no vuelve a mandarla) y se la entrega al servidor, que la comprueba con Dropi, la guarda cifrada y aplica lo pendiente.
 */
export function ConectarDropi({ puedeConectar }: { puedeConectar: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "conectando" });
  const [terminado, setTerminado] = useState(false);
  const iniciada = useRef(false);

  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    const f = leerFragmentoConectar(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    if (!f || !puedeConectar) return void setEstado({ tipo: "sin_sesion" });
    void conectarDropi(f.pais, f.token)
      .catch((): ResultadoConexion => ({ error: "No se pudo conectar Dropi." }))
      .then(async (r) => {
        setTerminado(true);
        await new Promise((ok) => setTimeout(ok, 450));
        setEstado({ tipo: "listo", r });
      });
  }, [puedeConectar]);

  const volver = (
    <Link href="/publicaciones-dropi" className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
      Volver a Gestión de IDs Dropi
    </Link>
  );

  if (estado.tipo === "conectando") return <ProgresoEstimado pasos={PASOS} estimadoMs={6000} terminado={terminado} etiqueta="Conectando Dropi" />;
  if (estado.tipo === "sin_sesion") {
    return (
      <div className="flex flex-col gap-3">
        <p className={`${caja} m-0 text-muted-foreground`}>
          {puedeConectar
            ? "No llegó ninguna sesión. Abre Dropi con la cuenta de ECOMFIVE y pulsa el favorito «Conectar Dropi»."
            : "Solo un administrador puede conectar Dropi."}
        </p>
        {volver}
      </div>
    );
  }
  const r = estado.r;
  return (
    <div className="flex flex-col gap-3">
      {r.error ? (
        <p role="alert" className={`${caja} m-0 text-destructive`}>
          {r.error}
        </p>
      ) : (
        <div role="status" className={`${caja} flex flex-col gap-1`}>
          <p className="m-0 font-semibold">
            Dropi {r.pais} conectado{r.venceEn ? ` hasta el ${hora(r.venceEn)}` : ""}.
          </p>
          <p className="m-0 text-muted-foreground">
            Cuenta {r.dropiUsuario}. Mientras siga conectado, «Usar este título» cambia el nombre en Dropi al instante.
          </p>
          {(r.aplicados ?? 0) + (r.errores ?? 0) > 0 && (
            <p className="m-0">
              Cambios pendientes: {plural(r.aplicados ?? 0, "aplicado", "aplicados")}
              {r.errores ? `, ${plural(r.errores, "con error", "con error")} (ver la ficha de cada publicación)` : ""}.
            </p>
          )}
        </div>
      )}
      {volver}
    </div>
  );
}
