import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/clients/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = await (prisma as any).client.findFirst({
    where: { id, createdBy: userId },
    include: {
      contacts: {
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      },
      proposals: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, totalValue: true, createdAt: true },
      },
    },
  });

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

// PATCH /api/clients/:id — update company-level fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.name    !== undefined) data.name    = body.name?.trim()    || existing.name;
  if (body.abn     !== undefined) data.abn     = body.abn?.trim()     || null;
  if (body.address !== undefined) data.address = body.address?.trim() || null;
  if (body.notes   !== undefined) data.notes   = body.notes?.trim()   || null;

  const client = await prisma.client.update({ where: { id }, data });
  return NextResponse.json(client);
}

// DELETE /api/clients/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Unlink proposals; contacts cascade-delete automatically via FK
  await prisma.proposal.updateMany({
    where: { clientId: id },
    data:  { clientId: null, contactId: null },
  });

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
