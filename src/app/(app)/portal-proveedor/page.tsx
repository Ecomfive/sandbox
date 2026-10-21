import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { headers } from "next/headers";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { cargarEspejo, clavePlazo } from "@/lib/proveedor/datos";
import { diasEntre, hoyPanama } from "@/lib/proveedor/fechas";
import { estadoPagos } from "@/lib/proveedor/pagos-servidor";
import { avisosParaVista, filasPlazos } from "@/lib/proveedor/vista-pagos";
import { resumenTransito } from "@/lib/proveedor/transito";
import { createServiceClient } from "@/lib/supabase/server";
import type { CuentaPortal } from "./cuenta-proveedor";
import { PortalProveedor, type Novedad, type ResumenPais } from "./portal-proveedor";

export const metadata = { title: "Portal del proveedor" };

export const dynamic = "force-dynamic";

/** Las pestañas que se pueden pedir en la dirección (`?tab=`). */
const TABS = ["novedades", "decidir", "cotizacion", "transito", "pagos", "cuenta"] as const;
/** Desde cuándo se cuenta el tránsito real de cada país. */
const TRANSITO_DESDE = "2026-01-01";

/**
 * Operación › Fulfillment › Portal del proveedor (fase 2 de PORTAL-PROVEEDOR.md): lo que Chin ve y hace en su portal, desde el
 * lado de Ecomfive. Lee el espejo (`proveedor_pedidos`, migración 0124) de las compras de Chin; decidir una cotización y marcar
 * una llegada cambian la compra con las mismas acciones de Compras.
 */
export default async function PortalProveedorPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const usuario = await requireModulo("portal-proveedor");
  const { tab } = await searchParams;
  const supabase = createServiceClient();

  const { data: proveedor, error: errorProveedor } = await supabase.from("proveedores").select("id").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  const espejo = proveedor ? await cargarEspejo(supabase, proveedor.id as string) : null;
  if (errorProveedor || !espejo || "error" in espejo) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Portal del proveedor" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {espejo && "error" in espejo ? espejo.error : "No se pudo cargar el portal. Falta correr en Supabase la migración 0124."}
        </p>
      </Pagina>
    );
  }

  const pedidos = espejo.pedidos.filter((p) => puedeVerPais(usuario.paisesPermitidos, p.paisCodigo));
  const activos = pedidos.filter((p) => p.etapa === "por_cotizar" || p.etapa === "cotizado" || p.etapa === "produccion" || p.etapa === "enviado");

  // Tránsito real de cada país y vía con lo que ya llegó este año.
  const diasPorClave = new Map<string, number[]>();
  for (const p of pedidos) {
    if (p.etapa !== "llegado" || !p.fechaEnvio || !p.fechaLlegada || p.fechaEnvio < TRANSITO_DESDE) continue;
    const d = diasEntre(p.fechaEnvio, p.fechaLlegada);
    if (d <= 0) continue;
    const k = clavePlazo(p.paisCodigo, p.via);
    diasPorClave.set(k, [...(diasPorClave.get(k) ?? []), d]);
  }
  const claves = new Set([...activos.filter((p) => p.etapa === "enviado").map((p) => clavePlazo(p.paisCodigo, p.via)), ...diasPorClave.keys()]);
  const { data: paises } = await supabase.from("paises").select("codigo, nombre");
  const nombrePais = new Map((paises ?? []).map((p) => [p.codigo as string, p.nombre as string]));
  const resumen: ResumenPais[] = [...claves]
    .map((k) => {
      const [pais, via] = k.split("|");
      return { clave: k, pais, nombre: nombrePais.get(pais) ?? pais, via: via as "mar" | "aire", plazo: espejo.plazos[k] ?? null, real: resumenTransito(diasPorClave.get(k) ?? []) };
    })
    .filter((r) => puedeVerPais(usuario.paisesPermitidos, r.pais))
    .sort((a, b) => (b.real?.envios ?? 0) - (a.real?.envios ?? 0));

  // Fotos reales que subió el proveedor (bucket privado, enlaces de una hora).
  const rutas = activos.map((p) => p.fotoRealRuta).filter((r): r is string => !!r);
  const fotosReales: Record<string, string> = {};
  if (rutas.length) {
    const { data: firmadas } = await supabase.storage.from("proveedor-portal").createSignedUrls(rutas, 3600);
    const porRuta = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
    for (const p of activos) if (p.fotoRealRuta && porRuta.get(p.fotoRealRuta)) fotosReales[p.id] = porRuta.get(p.fotoRealRuta)!;
  }

  const { data: filasNovedades } = await supabase
    .from("proveedor_novedades")
    .select("id, pedido_id, tipo, texto, detalle, autor_nombre, leida_en, creado_en")
    .eq("proveedor_id", espejo.proveedor.id)
    .eq("lado", "proveedor")
    .order("creado_en", { ascending: false })
    .limit(100);
  const novedades: Novedad[] = (filasNovedades ?? []).map((n) => ({
    id: n.id as string,
    pedidoId: (n.pedido_id as string | null) ?? null,
    tipo: n.tipo as string,
    texto: n.texto as string,
    detalle: (n.detalle as string | null) ?? null,
    leida: !!n.leida_en,
    creadoEn: n.creado_en as string,
  }));

  // Pagos (fase 4): lo que falta pagar de los países que la persona ve, los avisos y los plazos de los últimos envíos.
  const estado = await estadoPagos(supabase, { ...espejo, pedidos });
  const pagos =
    "error" in estado
      ? null
      : {
          resumen: estado.resumen,
          porPagar: estado.porPagar,
          avisos: await avisosParaVista(supabase, estado.avisos.filter((a) => a.cuotas.every((c) => pedidos.some((p) => p.id === c.pedidoId)))),
          plazos: filasPlazos(estado.envios.filter((e) => !e.pedidoId || pedidos.some((p) => p.id === e.pedidoId)), hoyPanama()),
        };

  // La cuenta del proveedor solo la ve (y la administra) un administrador.
  const admin = esAdministrador(usuario);
  let cuenta: CuentaPortal | null = null;
  let entrada = "/login";
  if (admin) {
    const { data } = await supabase.from("proveedor_usuarios").select("id, nombre, email, activo, ultimo_ingreso_en").eq("proveedor_id", espejo.proveedor.id).order("creado_en").limit(1).maybeSingle();
    if (data) cuenta = { id: data.id as string, nombre: data.nombre as string, email: (data.email as string | null) ?? null, activo: !!data.activo, ultimoIngreso: (data.ultimo_ingreso_en as string | null) ?? null };
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) entrada = `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}/login`;
  }

  const tabInicial = typeof tab === "string" && (TABS as readonly string[]).includes(tab) ? (tab as (typeof TABS)[number]) : null;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Portal del proveedor" oculto />
      <PortalProveedor
        proveedor={{ id: espejo.proveedor.id, nombre: espejo.proveedor.nombre }}
        pedidos={activos}
        plazos={espejo.plazos}
        resumen={resumen}
        novedades={novedades}
        fotosReales={fotosReales}
        puedeEscribir={!usuario.modulosSoloLectura.includes("portal-proveedor")}
        tabInicial={tabInicial === "cuenta" && !admin ? null : tabInicial}
        cuentaPortal={admin ? { cuenta, entrada } : null}
        pagos={pagos}
      />
    </Pagina>
  );
}
