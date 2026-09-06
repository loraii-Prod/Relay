import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/server/auth/session";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", issues: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "email_already_registered" }, { status: 409 });

  const passwordHash = await hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: { email: parsed.data.email, name: parsed.data.name, passwordHash },
  });
  await createSession(user.id);

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }, { status: 201 });
}
