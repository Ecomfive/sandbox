import { notFound } from "next/navigation";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { irAlInicio } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { EVENTO_DE_TIPO, type TipoLlegada } from "@/lib/compras/llegadas-avisos";
import { cargarFilasLlegada, destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { requireSesion } from "../../ayuda/datos-ayuda";
import { sinAccesoACompras } from "../../compras/acceso-compras";
import { campoOculto, restriccionesDe } from "../../compras/permisos-compras";
import { VistaLlegada } from "./vista-llegada";

export const metadata = { title: "Llegada de compras" };

export const dynamic = "force-dynamic";

/**
 * Lo que trae una llegada de compras (16 nov 2026, pedido de Hernán): el aviso «Para ti» de Llegada a Puerto (para Logística: producto, unidades, cajas y etiqueta de las cajas) y de En Bodega
 * (para quien paga: el segundo pago de cada compra y el total, con «Registrar pago»). No es un módulo del menú: la abre quien recibe el aviso, un administrador o quien tiene Compras
 * (con el país y el alcance de sus compras).
 */
export default async function LlegadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await requireSesion();
  if (!esUuid(id)) notFound();
  const supabase = createServiceClient();
  const { data: llegada } = await supabase.from("compras_llegadas").select("id, tipo, creado_por_nombre, creado_en").eq("id", id).maybeSingle();
  if (!llegada) notFound();
  const tipo = llegada.tipo as TipoLlegada;

  const destinatarias = await destinatariosDe(supabase, EVENTO_DE_TIPO[tipo]);
  const esDestino = destinatarias.includes(usuario.id);
  const admin = esAdministrador(usuario);
  const conCompras = usuario.modulos.includes("compras");
  if (!esDestino && !admin && !conCompras) irAlInicio(usuario);

  const filas = await cargarFilasLlegada(supabase, id);
  if (!esDestino && !admin) {
    const sinAcceso = await sinAccesoACompras(filas.map((f) => f.compraId), usuario);
    if (sinAcceso) irAlInicio(usuario);
  }

  const restricciones = restriccionesDe(usuario.afinado.compras);
  const verMontos = esDestino || admin || (conCompras && !campoOculto(restricciones, "pago2"));
  // Registrar pagos: un administrador o quien modifica Compras (Francis). Quien recibe el aviso (María José) lo ve para enterarse, no para pagar.
  const puedePagar = tipo === "bodega" && verMontos && (admin || (conCompras && !usuario.modulosSoloLectura.includes("compras")));

  const rutas = [...new Set(filas.flatMap((f) => f.etiquetasRutas))];
  const firmadas = tipo === "puerto" ? await direccionesDeEtiquetas(supabase, rutas) : [];
  const porRuta = new Map(firmadas.map((e) => [e.ruta, e]));
  const etiquetas: Record<string, EtiquetaPedido[]> = {};
  for (const f of filas) etiquetas[f.compraId] = f.etiquetasRutas.flatMap((r) => (porRuta.get(r) ? [porRuta.get(r)!] : []));

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={tipo === "puerto" ? "Llegada a Puerto" : "En Bodega"} oculto />
      <VistaLlegada
        llegadaId={id}
        tipo={tipo}
        filas={filas}
        etiquetas={etiquetas}
        verMontos={verMontos}
        puedePagar={puedePagar}
        hoy={hoyPanama()}
        avisadaPor={(llegada.creado_por_nombre as string | null) ?? null}
        avisadaEn={String(llegada.creado_en)}
      />
    </Pagina>
  );
}
