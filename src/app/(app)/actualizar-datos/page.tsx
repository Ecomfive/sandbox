import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { cargarFuentes, veAlgunaFuente } from "@/lib/actualizar-datos/fuentes";
import { getUsuarioActual, irAlInicio } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { PanelDatos } from "./panel-datos";

export const metadata = { title: "Actualizar datos" };

export const dynamic = "force-dynamic";
// Las lecturas que se corren desde aquí usan el tiempo de esta página: Meta y Dropi finanzas pueden tardar unos minutos.
export const maxDuration = 300;

/**
 * «Actualizar datos» (19 nov 2026, pedido de Hernán: «entrar a un solo panel donde me salga todo lo que se actualiza a mano»; prototipo aprobado
 * https://claude.ai/artifact/1ZUNXf8dTbszZpskenPs6X). No es un módulo propio: cada fuente sale si la persona tiene el módulo de su pantalla de siempre
 * (`cargarFuentes`), y la página se abre si ve alguna.
 */
export default async function ActualizarDatosPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (!veAlgunaFuente(usuario.modulos)) irAlInicio(usuario);
  const fuentes = await cargarFuentes(createServiceClient(), usuario);
  const usaExtension = fuentes.some((f) => f.accion?.tipo === "enlace" && /^(dropi-|siscore$|tu-winner$|retiros$)/.test(f.clave));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Actualizar datos" oculto />
      <PanelDatos fuentes={fuentes} usaExtension={usaExtension} />
    </Pagina>
  );
}
