import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { email: true } } },
  });
  return NextResponse.json({ jobs });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body?.id || typeof body.hidden !== "boolean")
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const job = await prisma.job.update({
    where: { id: body.id },
    data: { hidden: body.hidden },
    select: { id: true, hidden: true },
  });
  return NextResponse.json(job);
}
