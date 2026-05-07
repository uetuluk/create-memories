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
    <main className="min-h-screen p-6 lg:p-10">
      <header className="flex items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight">
            Create Memories
          </h1>
          <p className="text-neutral-400 mt-2 text-lg">
            NYU Shanghai · AI Committee × Library Relaxation Week
          </p>
        </div>
        <div className="flex flex-col items-center bg-neutral-900 rounded-2xl p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`QR code for ${submitUrl}`}
            className="w-40 h-40 lg:w-56 lg:h-56"
          />
          <p className="text-xs text-neutral-300 mt-2 text-center max-w-[14rem]">
            Scan to submit a prompt
          </p>
        </div>
      </header>

      <GalleryGrid />
    </main>
  );
}
