import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; contactId: string }> };

// PATCH /api/clients/:id/contacts/:contactId — update or promote to main
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, contactId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  const existing = await prismaAny.contact.findFirst({ where: { id: contactId, clientId: id } });
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const body = await request.json();
  const { name, email, phone, isMain } = body;

  // If promoting to main, demote all others first
  if (isMain) {
    await prismaAny.contact.updateMany({
      where: { clientId: id, id: { not: contactId } },
      data:  { isMain: false },
    });
  }

  const data: Record<string, unknown> = {};
  if (name  !== undefined) data.name  = name.trim();
  if (email !== undefined) data.email = email.trim();
  if (phone !== undefined) data.phone = phone?.trim() || null;
  if (isMain !== undefined) data.isMain = isMain;

  const contact = await prismaAny.contact.update({ where: { id: contactId }, data });
  return NextResponse.json(contact);
}

// DELETE /api/clients/:id/contacts/:contactId
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id, contactId } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  const existing = await prismaAny.contact.findFirst({ where: { id: contactId, clientId: id } });
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Refuse to delete the only remaining contact
  const count = await prismaAny.contact.count({ where: { clientId: id } });
  if (count <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the only contact. Add another contact first." },
      { status: 400 }
    );
  }

  await prismaAny.contact.delete({ where: { id: contactId } });

  // If we just deleted the main contact, promote the oldest remaining one
  if (existing.isMain) {
    const oldest = await prismaAny.contact.findFirst({
      where:   { clientId: id },
      orderBy: { createdAt: "asc" },
    });
    if (oldest) {
      await prismaAny.contact.update({ where: { id: oldest.id }, data: { isMain: true } });
    }
  }

  return NextResponse.json({ success: true });
}
