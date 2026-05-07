import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/env";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin?callbackUrl=/admin");
  if (!isAdmin(session.user.email)) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="text-neutral-400 mt-2">
          {session.user.email} is not an admin.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <p className="text-neutral-400 mt-1 text-sm">{session.user.email}</p>
      <AdminPanel />
    </main>
  );
}
