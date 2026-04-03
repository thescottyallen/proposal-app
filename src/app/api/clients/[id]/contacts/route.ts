import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/clients/:id/contacts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts = await (prisma as any).contact.findMany({
    where: { clientId: id },
    orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(contacts);
}

// POST /api/clients/:id/contacts — add a new contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await prisma.client.findFirst({ where: { id, createdBy: userId } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const { name, email, phone, isMain } = body;

  if (!name || !email || !email.includes("@")) {
    return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma as any;

  // If this contact is set as main, demote all others first
  if (isMain) {
    await prismaAny.contact.updateMany({
      where: { clientId: id },
      data:  { isMain: false },
    });
  }

  // If this is the first contact for the client, make it main automatically
  const existingCount = await prismaAny.contact.count({ where: { clientId: id } });
  const shouldBeMain = isMain || existingCount === 0;

  const contact = await prismaAny.contact.create({
    data: {
      clientId:  id,
      name:      name.trim(),
      email:     email.trim(),
      phone:     phone?.trim() || null,
      isMain:    shouldBeMain,
      createdBy: userId,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
