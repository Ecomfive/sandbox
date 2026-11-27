import { redirect } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { cargarFuentes, veAlgunaFuente } from "@/lib/actualizar-datos/fuentes";
import { getUsuarioActual, irAlInicio } from "@/lib/auth";
import { cargarEntidades } from "@/lib/finanzas/cargar-entidades";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPanel } from "../publicaciones-dropi/actualizar/datos";
import { PanelDatos } from "./panel-datos";
import type { ExtrasVentanas } from "./ventana-datos";

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
  const supabase = createServiceClient();
  const fuentes = await cargarFuentes(supabase, usuario);
  const usaExtension = fuentes.some((f) => f.accion?.tipo === "ventana" && /^(dropi-|siscore$|tu-winner$|retiros$|drop-competencia$)/.test(f.clave));
  // Lo que necesitan las ventanas que se abren aquí (solo si alguna fila de la persona las usa).
  const ventanas = fuentes.flatMap((f) => (f.accion?.tipo === "ventana" ? [f.accion.ventana] : []));
  const usa = (pred: (v: (typeof ventanas)[number]) => boolean) => ventanas.some(pred);
  const [dropi, entidades, cuentas] = await Promise.all([
    usa((v) => v.tipo === "dropi") ? cargarPanel(supabase).catch(() => null) : null,
    usa((v) => v.tipo === "excel" && v.modulo === "libro-movimientos") ? cargarEntidades(supabase).then((es) => es.map((e) => ({ codigo: e.codigo, razon_social: e.razon_social, moneda: e.moneda }))).catch(() => []) : null,
    usa((v) => v.tipo === "excel" && v.modulo === "conciliacion-bancaria")
      ? supabase
          .from("fin_cuentas")
          .select("id, nombre, clase")
          .eq("activo", true)
          .order("nombre")
          .then(({ data }) => (data ?? []).filter((c) => c.clase !== "tarjeta").map((c) => ({ id: c.id as string, nombre: c.nombre as string })))
      : null,
  ]);
  const extras: ExtrasVentanas = { dropi: dropi as ExtrasVentanas["dropi"], entidades, cuentas };
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Actualizar datos" oculto />
      <PanelDatos fuentes={fuentes} usaExtension={usaExtension} extras={extras} />
    </Pagina>
  );
}
