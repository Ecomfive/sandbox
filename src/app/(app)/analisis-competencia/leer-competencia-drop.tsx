"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { pedirExtension, type AvanceLector, type SesionDropi } from "@/lib/dropi-actualizar/extension";
import { empezarCompetenciaDrop, procesarCompetenciaDrop } from "./competencia-drop-actions";

/** La versión de «Ecomfive · Dropi» que trae el lector de la competencia de Drop. */
export const VERSION_COMPETENCIA_DROP = "0.8.4";

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const anterior = (tiene: string, pide: string) => {
  const a = tiene.split(".").map(Number);
  const b = pide.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
};

/**
 * «Drop: competencia» (24 nov 2026): lee el Catálogo de Drop con la sesión de dropshipper de ESTE Chrome (un perfil aparte, para no pisar la de proveedor) y
 * lo guarda. Si la pestaña de Drop tiene la sesión de proveedor, la extensión lo detecta (solo vería lo nuestro), avisa y no guarda nada.
 */
export function LeerCompetenciaDrop({ iniciar = false }: { iniciar?: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ texto: string; tipo: "info" | "mal" | "bien" } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const corriendo = useRef(false);

  async function leer() {
    if (corriendo.current) return;
    corriendo.current = true;
    setLeyendo(true);
    try {
      setEstado({ texto: "Buscando la extensión «Ecomfive · Dropi»…", tipo: "info" });
      const hola = await pedirExtension<{ version: string }>({ tipo: "hola" }, 2500).catch(() => null);
      if (!hola) throw new Error("Falta la extensión «Ecomfive · Dropi» en este Chrome (o hay que recargar la página).");
      if (anterior(hola.version, VERSION_COMPETENCIA_DROP))
        throw new Error(`La extensión de este Chrome es la ${hola.version}: la competencia de Drop necesita la ${VERSION_COMPETENCIA_DROP}. Recárgala en chrome://extensions y vuelve a cargar esta página.`);
      // En el mismo Chrome que la de proveedor (24 nov 2026, pedido de Hernán): si la pestaña de Drop no tiene la sesión de dropshipper, se pone al frente
      // y se espera a que la persona cierre la otra y entre (hasta 10 minutos); en cuanto entra, sigue sola.
      setEstado({ texto: "Revisando la sesión de Drop…", tipo: "info" });
      let s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "drop", abrir: true }, 45000).catch(() => null);
      if (!s?.hay || s.tipoUsuario !== "DROPSHIPPER") {
        await pedirExtension({ tipo: "mostrar", pais: "drop" }).catch(() => null);
        for (let i = 0; i < 200 && (!s?.hay || s.tipoUsuario !== "DROPSHIPPER"); i++) {
          setEstado({
            texto: s?.hay
              ? "La pestaña de Drop tiene la sesión de PROVEEDOR: ciérrala (abajo a la izquierda › Cerrar sesión) y entra con la cuenta de dropshipper. La lectura sigue sola."
              : "Entra a Drop con la cuenta de dropshipper en la pestaña que dejamos al frente. La lectura sigue sola.",
            tipo: "info",
          });
          await esperar(3000);
          s = await pedirExtension<SesionDropi>({ tipo: "sesion", pais: "drop", abrir: false }, 10000).catch(() => s);
        }
        if (!s?.hay || s.tipoUsuario !== "DROPSHIPPER") throw new Error("No se entró con la cuenta de dropshipper de Drop.");
      }
      const r = await empezarCompetenciaDrop();
      if ("error" in r) throw new Error(r.error);
      setEstado({ texto: "Abriendo el Catálogo de Drop…", tipo: "info" });
      await pedirExtension({ tipo: "lanzar", lector: "competencia_drop", subida: r.subida }, 60000);
      let a: (AvanceLector & { productos?: number; hechos?: number; fase?: string }) | null = null;
      // Hasta 20 minutos: el catálogo tiene unos 200 productos y la ficha de cada uno se lee de a 4.
      for (let i = 0; i < 600; i++) {
        await esperar(2000);
        a = await pedirExtension<typeof a>({ tipo: "avance", lector: "competencia_drop" }).catch(() => a);
        if (a?.fase === "fichas") setEstado({ texto: `Leyendo la ficha de cada producto: ${a.hechos ?? 0} de ${a.productos ?? 0}…`, tipo: "info" });
        else if (a?.productos) setEstado({ texto: `Leyendo el Catálogo de Drop: ${a.productos} productos…`, tipo: "info" });
        if (a?.fin) break;
      }
      if (!a?.fin) throw new Error("Drop tardó demasiado: vuelve a pulsar «Actualizar» y deja abierta la pestaña de Drop.");
      if (a.error) throw new Error(a.error);
      setEstado({ texto: "Guardando en el sistema (cambios, iguales a los nuestros y alertas)…", tipo: "info" });
      const g = await procesarCompetenciaDrop(r.id);
      if ("error" in g) throw new Error(g.error);
      setEstado({ texto: `Listo: ${g.resumen}. Para «Drop proveedor» vuelve a entrar a Drop con la cuenta de proveedor.`, tipo: "bien" });
      router.refresh();
    } catch (e) {
      setEstado({ texto: e instanceof Error ? e.message : "No se pudo leer la competencia de Drop.", tipo: "mal" });
    } finally {
      corriendo.current = false;
      setLeyendo(false);
    }
  }

  // Desde Datos, al abrir la ventana se lee de una vez.
  useEffect(() => {
    if (!iniciar) return;
    const t = setTimeout(() => void leer(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciar]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0 text-muted-foreground">
        Se lee con la cuenta de <strong>dropshipper</strong> de Drop. Si la pestaña de Drop tiene la de proveedor, te la dejamos al frente para que cierres esa sesión y
        entres con la de dropshipper: la lectura sigue sola. Al terminar, vuelve a entrar con la de proveedor para «Drop proveedor».
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => void leer()} disabled={leyendo}>
          {leyendo ? "Leyendo…" : "Leer la competencia de Drop"}
        </Button>
        {estado && (
          <span role="status" className={estado.tipo === "mal" ? "text-destructive" : estado.tipo === "bien" ? "text-success" : "text-muted-foreground"}>
            {estado.texto}
          </span>
        )}
      </div>
    </div>
  );
}
