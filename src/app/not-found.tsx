import Image from "next/image";
import Link from "next/link";
import { linkClass } from "@/components/ui/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <Image
          src="/brand/ecomfive-rojo.png"
          alt="Ecomfive"
          width={161}
          height={44}
          className="mx-auto h-8 w-auto"
        />
        <p className="mt-6 text-sm font-medium text-muted-foreground">Error 404</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">No encontramos esta página</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La ruta que buscas no existe o se movió de lugar.
        </p>
        <Link href="/" className={`mt-6 inline-block text-sm ${linkClass}`}>
          Volver al Dashboard
        </Link>
      </div>
    </main>
  );
}
