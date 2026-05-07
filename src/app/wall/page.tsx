import WallSlideshow from "../../components/WallSlideshow";

export const dynamic = "force-dynamic";

// Full-screen slideshow for a secondary display. No QR overlays, no
// header — pure media. Cycles through every visible completed job.
export default function WallPage() {
  return (
    <main className="fixed inset-0 bg-black overflow-hidden">
      <WallSlideshow />
    </main>
  );
}
