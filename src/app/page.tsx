import QRCode from "qrcode";
import { env } from "@/lib/env";
import GalleryGrid from "@/components/GalleryGrid";

export const dynamic = "force-dynamic";

async function makeQr(target: string): Promise<string> {
  return QRCode.toDataURL(target, {
    margin: 1,
    color: { dark: "#ffffff", light: "#00000000" },
    width: 240,
  });
}

export default async function HomePage() {
  const submitUrl = `${env.publicUrl()}/submit`;
  const surveyUrl = env.surveyUrl();
  const [submitQr, surveyQr] = await Promise.all([
    makeQr(submitUrl),
    surveyUrl ? makeQr(surveyUrl) : Promise.resolve(null),
  ]);

  return (
    <main className="relative min-h-screen p-6 lg:p-10">
      <header className="mb-6">
        <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight">
          Create Memories
        </h1>
        <p className="text-neutral-400 mt-2 text-lg">
          NYU Shanghai · Advisory Committee on AI and Innovation × Library Relaxation Week
        </p>
      </header>

      <GalleryGrid />

      {/* Floating QR (submit) — bottom right. */}
      <FloatingQr
        position="right"
        dataUrl={submitQr}
        href={submitUrl}
        caption="Scan to create yours"
      />

      {surveyQr && surveyUrl && (
        <FloatingQr
          position="left"
          dataUrl={surveyQr}
          href={surveyUrl}
          caption="Tell us what you thought"
        />
      )}
    </main>
  );
}

function FloatingQr({
  dataUrl,
  href,
  caption,
  position,
}: {
  dataUrl: string;
  href: string;
  caption: string;
  position: "left" | "right";
}) {
  const sideClass =
    position === "right"
      ? "bottom-4 right-4 lg:bottom-6 lg:right-6"
      : "bottom-4 left-4 lg:bottom-6 lg:left-6";
  return (
    <aside
      className={`fixed ${sideClass} z-50 flex flex-col items-center bg-neutral-900/95 backdrop-blur rounded-2xl p-3 shadow-2xl ring-1 ring-neutral-800`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt={`QR code for ${href}`}
        className="w-28 h-28 lg:w-40 lg:h-40"
      />
      <p className="text-xs lg:text-sm text-neutral-200 mt-1.5 text-center font-medium max-w-[10rem]">
        {caption}
      </p>
    </aside>
  );
}
