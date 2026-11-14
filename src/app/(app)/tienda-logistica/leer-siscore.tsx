"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { empezarLecturaSiscore, fallarLecturaSiscore, procesarLecturaSiscore } from "./siscore-actions";

/** La versión de «Ecomfive · Dropi» que trae el lector de SISCORE. */
export const VERSION_EXTENSION_SISCORE = "0.8.0";
/** Cada cuánto se vuelve a leer sola al abrir Logística (por navegador). */
const CADA_MS = 30 * 60_000;
const CLAVE_AUTO = "siscore-lectura-auto";

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const anterior = (tiene: string, pide: string) => {
  const a = tiene.split(".").map(Number);
  const b = pide.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};

/**
 * «Actualizar Servientrega» (12 nov 2026): con la extensión «Ecomfive · Dropi» (0.8.0) usa la pestaña de SISCORE abierta en este Chrome (la abre si falta y
 * espera a que la persona entre con la cuenta de la tienda), lee el informe de guías y el rastreo de cada una, y lo guarda. **Solo lectura de SISCORE.**
 * Se lee sola al abrir Logística si la última lectura de este navegador tiene más de 30 minutos (si la extensión y la sesión están). Solo para quien
 * puede modificar Logística.
 */
export function LeerSiscore({ ultima }: { ultima: string | null }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ texto: string; tipo: "info" | "mal" | "bien" } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const corriendo = useRef(false);

  async function leer(sola = false) {
    if (corriendo.current) return;
    corriendo.current = true;
    setLeyendo(true);
    let id: string | null = null;
    try {
      setEstado({ texto: "Buscando la extensión «Ecomfive · Dropi»…", tipo: "info" });
      const hola = await pedirExtension<{ version: string }>({ tipo: "hola" }, 2500).catch(() => null);
      if (!hola) throw new Error("Falta la extensión «Ecomfive · Dropi» en este Chrome (o hay que recargar la página).");
      if (anterior(hola.version, VERSION_EXTENSION_SISCORE))
        throw new Error(`La extensión es la ${hola.version}: SISCORE necesita la ${VERSION_EXTENSION_SISCORE}. Recárgala en chrome://extensions y vuelve a cargar esta página.`);
      setEstado({ texto: "Abriendo SISCORE…", tipo: "info" });
      let s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "siscore", abrir: !sola }, 45000);
      if (!s.pestana && sola) throw new Error("SISCORE no está abierto en este Chrome: pulsa «Actualizar Servientrega» para abrirlo.");
      if (!s.hay) {
        if (sola) throw new Error("La sesión de SISCORE no está abierta: pulsa «Actualizar Servientrega».");
        await pedirExtension({ tipo: "mostrar", pais: "siscore" }).catch(() => null);
        setEstado({ texto: "Entra a SISCORE con la cuenta de la tienda en la pestaña que abrimos: la lectura sigue sola.", tipo: "info" });
        for (let i = 0; i < 100 && !s.hay; i++) {
          await esperar(3000);
          s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "siscore", abrir: false }, 10000).catch(() => s);
        }
        if (!s.hay) throw new Error("No se inició sesión en SISCORE.");
      }
      const r = await empezarLecturaSiscore();
      if ("error" in r) throw new Error(r.error);
      id = r.id;
      setEstado({ texto: `Leyendo las guías de ${s.tienda ?? "la tienda"} en SISCORE…`, tipo: "info" });
      await pedirExtension({ tipo: "lanzar", lector: "siscore", subida: r.subida, dias: { pedidos: 75, cartera: 75 } }, 45000);
      let a: (AvanceLector & { hechos?: number }) | null = null;
      // Hasta 30 minutos: una tienda con muchas guías (Oferfy, unas 1.400 en 75 días) tarda más que Kenku.
      for (let i = 0; i < 900; i++) {
        await esperar(2000);
        a = await pedirExtension<(AvanceLector & { hechos?: number }) | null>({ tipo: "avance", lector: "siscore" }).catch(() => a);
        if (a?.productos) setEstado({ texto: `Leyendo el rastreo de las guías: ${a.hechos ?? 0} de ${a.productos}…`, tipo: "info" });
        if (a?.fin) break;
      }
      if (!a?.fin) throw new Error("SISCORE tardó demasiado en responder.");
      if (a.error) throw new Error(a.error);
      setEstado({ texto: "Guardando en el sistema…", tipo: "info" });
      const g = await procesarLecturaSiscore(r.id);
      if ("error" in g) {
        id = null;
        throw new Error(g.error);
      }
      try {
        localStorage.setItem(CLAVE_AUTO, String(Date.now()));
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
      setEstado({ texto: `Listo: ${g.guias} guías de ${g.cliente}, ${g.conPedido} unidas a su pedido.`, tipo: "bien" });
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo leer SISCORE.";
      if (id) await fallarLecturaSiscore(id, msg).catch(() => null);
      setEstado({ texto: msg, tipo: "mal" });
    } finally {
      corriendo.current = false;
      setLeyendo(false);
    }
  }

  // Sola al abrir, si en este navegador no se leyó en los últimos 30 minutos (sin abrir pestañas ni pedir sesión: si no están, se avisa).
  useEffect(() => {
    let antes = 0;
    try {
      antes = Number(localStorage.getItem(CLAVE_AUTO) || 0);
    } catch {
      return;
    }
    if (Date.now() - antes < CADA_MS) return;
    const t = setTimeout(() => void leer(true), 1200);
    return () => clearTimeout(t);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
      {estado ? (
        <span role="status" className={estado.tipo === "mal" ? "text-destructive" : estado.tipo === "bien" ? "text-success" : "text-muted-foreground"}>
          {estado.texto}
        </span>
      ) : (
        ultima && <span className="text-muted-foreground">Servientrega leído {ultima}</span>
      )}
      <Button type="button" variant="secondary" onClick={() => void leer(false)} disabled={leyendo}>
        {leyendo ? "Leyendo…" : "Actualizar Servientrega"}
      </Button>
    </div>
  );
}
