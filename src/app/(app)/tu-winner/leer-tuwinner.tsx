"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { VERSION_EXTENSION_TUWINNER } from "@/lib/tuwinner/lector";
import { empezarLecturaTuWinner, fallarLecturaTuWinner, procesarLecturaTuWinner } from "./actions";

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const anterior = (tiene: string, pide: string) => {
  const a = tiene.split(".").map(Number);
  const b = pide.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};
const CLAVE_AUTO = "tuwinner-lectura-auto";

/**
 * «Leer ahora» de Tu Winner (2 nov 2026): con la extensión «Ecomfive · Dropi» (0.5.0) abre (o usa) la pestaña de app.tuwinner.com en este Chrome, espera la
 * sesión de Ecomfive si falta, corre el lector `tuwinner` ahí y guarda lo leído. **La lectura diaria**: si la última lectura no es de hoy, se lee sola al
 * abrir el panel (una vez por día y por navegador). Solo lo ve quien puede modificar Tu Winner.
 */
export function LeerTuWinner({ leidoHoy, auto }: { leidoHoy: boolean; auto: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ texto: string; tipo: "info" | "mal" | "bien" } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const corriendo = useRef(false);

  async function leer() {
    if (corriendo.current) return;
    corriendo.current = true;
    setLeyendo(true);
    let id: string | null = null;
    try {
      setEstado({ texto: "Buscando la extensión «Ecomfive · Dropi»…", tipo: "info" });
      const hola = await pedirExtension<{ version: string }>({ tipo: "hola" }, 2500).catch(() => null);
      if (!hola) throw new Error("Falta la extensión «Ecomfive · Dropi» en este Chrome (o hay que recargar la página).");
      if (anterior(hola.version, VERSION_EXTENSION_TUWINNER))
        throw new Error(`La extensión es la ${hola.version}: Tu Winner necesita la ${VERSION_EXTENSION_TUWINNER}. Recárgala en chrome://extensions y vuelve a cargar esta página.`);
      setEstado({ texto: "Abriendo Tu Winner…", tipo: "info" });
      let s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "tw", abrir: true }, 45000);
      if (!s.hay) {
        await pedirExtension({ tipo: "mostrar", pais: "tw" }).catch(() => null);
        setEstado({ texto: "Entra a Tu Winner con la cuenta de Ecomfive en la pestaña que abrimos: la lectura sigue sola.", tipo: "info" });
        for (let i = 0; i < 100 && !s.hay; i++) {
          await esperar(3000);
          s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "tw", abrir: false }, 10000).catch(() => s);
        }
        if (!s.hay) throw new Error("No se inició sesión en Tu Winner.");
      }
      const r = await empezarLecturaTuWinner();
      if ("error" in r) throw new Error(r.error);
      id = r.id;
      setEstado({ texto: "Leyendo los ganadores de Panamá y México…", tipo: "info" });
      await pedirExtension({ tipo: "lanzar", lector: "tuwinner", subida: r.subida }, 45000);
      let a: (AvanceLector & { productos?: number }) | null = null;
      for (let i = 0; i < 150; i++) {
        await esperar(2000);
        a = await pedirExtension<(AvanceLector & { productos?: number }) | null>({ tipo: "avance", lector: "tuwinner" }).catch(() => a);
        if (a?.productos) setEstado({ texto: `Leyendo los ganadores de Panamá y México: ${a.productos}…`, tipo: "info" });
        if (a?.fin) break;
      }
      if (!a?.fin) throw new Error("Tu Winner tardó demasiado en responder.");
      if (a.error) throw new Error(a.error);
      setEstado({ texto: "Guardando en el sistema…", tipo: "info" });
      const g = await procesarLecturaTuWinner(r.id);
      if ("error" in g) {
        id = null;
        throw new Error(g.error);
      }
      setEstado({ texto: `Listo: ${g.resumen.PA ?? 0} ganadores de Panamá y ${g.resumen.MX ?? 0} de México.`, tipo: "bien" });
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo leer Tu Winner.";
      if (id) await fallarLecturaTuWinner(id, msg).catch(() => null);
      setEstado({ texto: msg, tipo: "mal" });
    } finally {
      corriendo.current = false;
      setLeyendo(false);
    }
  }

  // La lectura del día: si todavía no se leyó hoy, una vez al abrir (por navegador, para no repetirla en cada visita si falla).
  useEffect(() => {
    if (!auto || leidoHoy) return;
    const hoy = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(CLAVE_AUTO) === hoy) return;
      localStorage.setItem(CLAVE_AUTO, hoy);
    } catch {
      return;
    }
    const t = setTimeout(() => void leer(), 800);
    return () => clearTimeout(t);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button className="btn" type="button" onClick={() => void leer()} disabled={leyendo}>
        {leyendo ? "Leyendo…" : "Leer ahora"}
      </button>
      {estado && (
        <span role="status" style={{ flexBasis: "100%", textAlign: "right", color: estado.tipo === "mal" ? "var(--destructive)" : estado.tipo === "bien" ? "var(--success)" : undefined }}>
          {estado.texto}
        </span>
      )}
    </>
  );
}
