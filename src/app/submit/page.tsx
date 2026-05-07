import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isEmailAllowed } from "@/lib/env";
import { getAppMode } from "@/lib/queue";
import SubmitForm from "@/components/SubmitForm";

export const dynamic = "force-dynamic";

export default async function SubmitPage() {
  const session = await auth();
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
  const state = await getAppMode();

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Create a memory</h1>
      <p className="text-neutral-400 mt-1">
        Signed in as {session.user.email}
      </p>
      <p className="text-sm text-neutral-500 mt-4">
        Current mode: <span className="text-neutral-200">{state.mode}</span>
        {state.mode === "VIDEO" ? " — 5s video" : state.mode === "IMAGE" ? " — single image" : ""}
      </p>
      <SubmitForm initialMode={state.mode} />
    </main>
  );
}
