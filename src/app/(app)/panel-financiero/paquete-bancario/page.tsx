import Link from "next/link";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { armarPaqueteBancario, empresaDelPaquete } from "@/lib/finanzas/cargar-paquete-bancario";
import { conParametros } from "@/lib/finanzas/entidades";
import { cartaPredeterminada } from "@/lib/finanzas/paquete-bancario";
import { createServiceClient } from "@/lib/supabase/server";
import { CartaPaquete } from "./carta-paquete";
import { ControlesPaquete } from "./controles-paquete";
import { EstiloPaquete, leerPapel } from "./estilo-paquete";
import { leerParametrosPaquete, puedeVerPaquete, RUTA_PAQUETE } from "./parametros";
import { VistaPaquete } from "./vista-paquete";

export const metadata = { title: "Paquete bancario" };

export const dynamic = "force-dynamic";
// Arma varios estados financieros a la vez.
export const maxDuration = 60;

interface Version {
  id: string;
  corte: string;
  entidad: string;
  secciones: string[];
  carta: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
}

export default async function PaqueteBancarioPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("panel-financiero");
  if (!(await puedeVerPaquete())) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Paquete bancario" oculto />
        <EstadoVacioAF4 titulo="El paquete bancario es de toda la empresa" />
      </Pagina>
    );
  }
  const sp = await searchParams;
  const supabase = createServiceClient();
  const p = await leerParametrosPaquete(supabase, usuario, { corte: sp.corte, entidad: sp.entidad, secciones: sp.secciones });
  const papel = leerPapel(sp.papel);
  const codigoEntidad = p.entidad?.codigo ?? "consolidado";
  const puedeGuardar = !usuario.modulosSoloLectura.includes("panel-financiero");

  const [empresa, versionesR] = await Promise.all([
    empresaDelPaquete(supabase),
    supabase.from("fin_paquetes_bancarios").select("id, corte, entidad, secciones, carta, creado_por_nombre, creado_en").order("creado_en", { ascending: false }).limit(50),
  ]);
  const versiones = versionesR.error ? null : ((versionesR.data ?? []) as Version[]);
  // La carta de partida: la de la última versión de esta entidad o, si no hay, una plantilla para editar.
  const cartaPrevia = versiones?.find((v) => v.entidad === codigoEntidad && v.carta)?.carta ?? null;
  const alcance = p.entidad?.razon_social ?? "consolidado";
  const carta = cartaPrevia ?? cartaPredeterminada(empresa.nombre, mesLargo(p.corte), alcance);
  const snap = await armarPaqueteBancario(supabase, { corte: p.corte, entidad: p.entidad, secciones: p.secciones, carta });

  const parametros = { corte: p.corte.slice(0, 7), entidad: codigoEntidad === "consolidado" ? null : codigoEntidad, secciones: p.secciones.join(",") };
  const descarga = conParametros("/api/exportar-paquete-bancario", parametros);

  return (
    <Pagina ancho="ancha" className="paquete-bancario flex flex-col gap-6">
      <EstiloPaquete papel={papel} encabezado={`${empresa.nombre} · Paquete de información financiera`} pie={`Cierre de ${mesLargo(p.corte)} · ${snap.alcance} · USD`} />
      <div data-sin-imprimir className="flex flex-col gap-4">
        <EncabezadoAF4 titulo="Paquete bancario" datosHasta={p.corte} actualizado={snap.generado} descarga={{ href: descarga }} />
        <ControlesPaquete
          corte={p.corte}
          cortes={p.cortes}
          cerrados={p.cerrados}
          entidad={codigoEntidad}
          entidades={p.entidades}
          secciones={p.secciones}
          permitidas={p.permitidas}
          papel={papel}
        />
      </div>

      <VistaPaquete
        s={snap}
        carta={<CartaPaquete key={`${p.corte}-${codigoEntidad}`} inicial={carta} corte={p.corte} entidad={codigoEntidad} secciones={p.secciones} puedeGuardar={puedeGuardar} />}
      />

      <div data-sin-imprimir>
        <MarcoAF4 id="paquete-versiones" titulo="Versiones guardadas" detalle={versiones ? entero(versiones.length) : undefined} sinRelleno>
          {versiones === null ? (
            <p className="m-0 px-4 py-3 text-sm text-muted-foreground">Falta correr la migración 0940 en Supabase.</p>
          ) : versiones.length === 0 ? (
            <p className="m-0 px-4 py-3 text-sm text-muted-foreground">Todavía no hay versiones guardadas.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {versiones.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <Link href={`${RUTA_PAQUETE}/versiones/${v.id}`} className={`min-w-0 flex-1 rounded-md hover:underline ${anilloFoco}`}>
                    <span className="block text-sm font-medium">
                      Cierre de {mesMedio(String(v.corte))} · {v.entidad === "consolidado" ? "Consolidado" : v.entidad}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {fechaHora(v.creado_en)}
                      {v.creado_por_nombre ? ` · ${v.creado_por_nombre}` : ""} · {v.secciones.length} secciones
                    </span>
                  </Link>
                  <a href={`/api/exportar-paquete-bancario?version=${v.id}`} className={`text-sm underline-offset-2 hover:underline ${anilloFoco}`}>
                    Excel
                  </a>
                </li>
              ))}
            </ul>
          )}
        </MarcoAF4>
      </div>
    </Pagina>
  );
}
