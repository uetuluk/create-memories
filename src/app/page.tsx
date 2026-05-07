import QRCode from "qrcode";
import { env } from "@/lib/env";
import GalleryGrid from "@/components/GalleryGrid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const submitUrl = `${env.publicUrl()}/submit`;
  const qrDataUrl = await QRCode.toDataURL(submitUrl, {
    margin: 1,
    color: { dark: "#ffffff", light: "#00000000" },
    width: 320,
  });

  return (
    <main className="relative min-h-screen p-6 lg:p-10">
      <header className="mb-6">
        <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight">
          Create Memories
        </h1>
        <p className="text-neutral-400 mt-2 text-lg">
          NYU Shanghai · AI Committee × Library Relaxation Week
        </p>
      </header>

      <GalleryGrid />

      {/* Floating QR — sits on top of the gallery; OK if it covers a tile. */}
      <aside
        className="fixed bottom-6 right-6 lg:bottom-10 lg:right-10 z-50 flex flex-col items-center bg-neutral-900/95 backdrop-blur rounded-2xl p-4 shadow-2xl ring-1 ring-neutral-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code for ${submitUrl}`}
          className="w-44 h-44 lg:w-64 lg:h-64"
        />
        <p className="text-sm text-neutral-200 mt-2 text-center font-medium">
          Scan to submit a prompt
        </p>
      </aside>
    </main>
  );
}
