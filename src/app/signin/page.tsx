import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  return (
    <main className="min-h-screen p-6 max-w-sm mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-neutral-400 mt-2 text-sm">
        Use your <span className="font-medium">@nyu.edu</span> address. We will
        email you a one-time link.
      </p>
      <form
        className="mt-6 space-y-3"
        action={async (formData) => {
          "use server";
          const params = await searchParams;
          await signIn("nodemailer", {
            email: formData.get("email") as string,
            redirectTo: params.callbackUrl ?? "/submit",
          });
        }}
      >
        <input
          name="email"
          type="email"
          required
          placeholder="netid@nyu.edu"
          className="w-full rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-3"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-white text-black font-medium py-3"
        >
          Send magic link
        </button>
      </form>
    </main>
  );
}
