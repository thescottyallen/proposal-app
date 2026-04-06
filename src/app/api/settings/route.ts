import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/settings — returns this user's BusinessSettings, creating defaults if absent
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.businessSettings.upsert({
    where:  { userId },
    create: { userId },
    update: {},
  });

  return NextResponse.json(settings);
}

// PUT /api/settings — update business settings
export async function PUT(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    businessName,
    abn,
    gstRegistered,
    defaultCurrency,
    invoicePrefix,
    roundingMode,
    defaultAcceptanceMessage,
  } = body;

  const settings = await prisma.businessSettings.upsert({
    where:  { userId },
    create: {
      userId,
      ...(businessName              !== undefined && { businessName }),
      ...(abn                       !== undefined && { abn }),
      ...(gstRegistered             !== undefined && { gstRegistered }),
      ...(defaultCurrency           !== undefined && { defaultCurrency }),
      ...(invoicePrefix             !== undefined && { invoicePrefix }),
      ...(roundingMode              !== undefined && { roundingMode }),
      ...(defaultAcceptanceMessage  !== undefined && { defaultAcceptanceMessage }),
    },
    update: {
      ...(businessName              !== undefined && { businessName }),
      ...(abn                       !== undefined && { abn }),
      ...(gstRegistered             !== undefined && { gstRegistered }),
      ...(defaultCurrency           !== undefined && { defaultCurrency }),
      ...(invoicePrefix             !== undefined && { invoicePrefix }),
      ...(roundingMode              !== undefined && { roundingMode }),
      ...(defaultAcceptanceMessage  !== undefined && { defaultAcceptanceMessage }),
    },
  });

  return NextResponse.json(settings);
}
