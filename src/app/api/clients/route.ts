import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/clients - list all clients for current user
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    where: { createdBy: userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { proposals: true } },
    },
  });

  return NextResponse.json(clients);
}

// POST /api/clients - create a new client
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, email, company, phone, address, notes } = body;

  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Check for existing client with same email
  const existing = await prisma.client.findFirst({
    where: { email, createdBy: userId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A client with this email already exists" },
      { status: 409 }
    );
  }

  const client = await prisma.client.create({
    data: {
      name,
      email,
      company: company || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      createdBy: userId,
    },
  });

  return NextResponse.json(client, { status: 201 });
}
