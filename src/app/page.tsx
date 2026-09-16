import Link from "next/link";

const modulos = [
  {
    href: "/extractos",
    titulo: "Extractos bancarios",
    descripcion: "Cargar extracto (CSV/Excel) y asignar movimientos a plataforma.",
  },
  {
    href: "/conciliaciones",
    titulo: "Conciliación",
    descripcion: "Comparar lo depositado en banco contra lo reportado por cada plataforma.",
  },
  {
    href: "/inventario",
    titulo: "Inventario (pistoleo)",
    descripcion: "Cargar entradas y salidas de mercancía desde el sistema de escaneo.",
  },
  {
    href: "/alertas",
    titulo: "Alertas de inventario",
    descripcion: "Inventario pendiente de retorno, listo para reclamo a la plataforma.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Gestión de Proveeduría</h1>
      <p className="mt-1 text-sm text-muted-foreground">Beta — Costa Rica y Panamá</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {modulos.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent hover:bg-muted"
          >
            <p className="text-sm font-medium">{m.titulo}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.descripcion}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
