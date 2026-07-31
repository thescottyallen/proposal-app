import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/roles.server";
import { ownerOrAdminWhere } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/templates/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });

  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

// PATCH /api/templates/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.template.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, content } = body;

  const template = await prisma.template.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(content !== undefined && { content }),
    },
  });

  return NextResponse.json(template);
}

// DELETE /api/templates/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.template.findFirst({
    where: { id, ...ownerOrAdminWhere(ctx.role, ctx.userId) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
