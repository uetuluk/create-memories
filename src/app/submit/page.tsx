import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isEmailAllowed } from "@/lib/env";
import { getAppMode } from "@/lib/queue";
import { VIDEO_DURATION_SECONDS } from "@/lib/genai";
import { LOCATIONS, STYLES, type LocationKey, type StyleKey } from "@/lib/refs";
import SubmitForm from "@/components/SubmitForm";
import MyMemories from "@/components/MyMemories";

const refs = {
  styles: (Object.keys(STYLES) as StyleKey[]).map((k) => ({
    key: k,
    label: STYLES[k].label,
    tagline: STYLES[k].tagline,
    thumb: `/refs/styles/${STYLES[k].file}`,
  })),
  locations: (Object.keys(LOCATIONS) as LocationKey[]).map((k) => ({
    key: k,
    label: LOCATIONS[k].label,
    thumb: `/refs/locations/${LOCATIONS[k].file}`,
  })),
};

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const state = await getAppMode();
  const session = await auth();

  if (state.requireLogin) {
    if (!session?.user?.email) {
      redirect("/signin?callbackUrl=/submit");
    }
    if (!isEmailAllowed(session.user.email)) {
      return (
        <main className="min-h-screen p-6 max-w-md mx-auto">
          <h1 className="text-2xl font-semibold">Not eligible</h1>
          <p className="text-neutral-400 mt-2">
            This event is open to NYU email addresses only. You signed in as{" "}
            {session.user.email}.
          </p>
        </main>
      );
    }
  }

  // When login is off, treat any signed-in caller as anonymous for the
  // "My memories" widget — that list reads from the API which already
  // returns an empty list for anonymous callers.
  const signedIn = state.requireLogin && !!session?.user?.email;

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Create a memory</h1>
      {signedIn ? (
        <p className="text-neutral-400 mt-1">
          Signed in as {session!.user!.email}
        </p>
      ) : (
        <p className="text-neutral-400 mt-1">Kiosk mode — no sign-in required</p>
      )}
      <p className="text-sm text-neutral-500 mt-4">
        Current mode: <span className="text-neutral-200">{state.mode}</span>
        {state.mode === "VIDEO"
          ? ` — ${VIDEO_DURATION_SECONDS}s video`
          : state.mode === "IMAGE"
          ? " — single image"
          : ""}
      </p>
      <SubmitForm initialMode={state.mode} refs={refs} />
      {signedIn && <MyMemories />}
    </main>
  );
}
