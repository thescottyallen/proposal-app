import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/clients — list all clients for the current user, with contacts
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = await (prisma as any).client.findMany({
    where:   { createdBy: userId },
    orderBy: { createdAt: "desc" },
    include: {
      contacts: {
        orderBy: [{ isMain: "desc" }, { createdAt: "asc" }],
      },
      _count: { select: { proposals: true } },
    },
  });

  return NextResponse.json(clients);
}

// POST /api/clients — create a new client (company) and first contact
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, abn, address, notes, contact } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  if (contact) {
    if (!contact.name?.trim() || !contact.email?.trim() || !contact.email.includes("@")) {
      return NextResponse.json(
        { error: "Contact name and a valid email are required" },
        { status: 400 }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = await (prisma as any).client.create({
    data: {
      name:      name.trim(),
      abn:       abn?.trim()     || null,
      address:   address?.trim() || null,
      notes:     notes?.trim()   || null,
      createdBy: userId,
      ...(contact && {
        contacts: {
          create: {
            name:      contact.name.trim(),
            email:     contact.email.trim(),
            phone:     contact.phone?.trim() || null,
            isMain:    true,
            createdBy: userId,
          },
        },
      }),
    },
    include: { contacts: true },
  });

  return NextResponse.json(client, { status: 201 });
}
