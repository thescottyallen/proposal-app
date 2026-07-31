import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/roles.server";
import { ownerOrAdminWhere } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/content-blocks/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const block = await prisma.contentBlock.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });
  if (!block) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(block);
}

// PATCH /api/content-blocks/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.contentBlock.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.category !== undefined) data.category = body.category;
  if (body.content !== undefined) data.content = body.content;

  const updated = await prisma.contentBlock.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE /api/content-blocks/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.contentBlock.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.contentBlock.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
