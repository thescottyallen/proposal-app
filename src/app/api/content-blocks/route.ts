import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/roles.server";
import { ownerOrAdminWhere } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/content-blocks - list all content blocks
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.contentBlock.findMany({
    // Admins see every content block; everyone else only their own.
    where: ownerOrAdminWhere(ctx.role, ctx.userId),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(blocks);
}

// POST /api/content-blocks - create a new content block
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, category, content } = body;

  if (!name || !category) {
    return NextResponse.json(
      { error: "Name and category are required" },
      { status: 400 }
    );
  }

  const block = await prisma.contentBlock.create({
    data: {
      name,
      category,
      content: content || {},
      createdBy: ctx.userId,
    },
  });

  return NextResponse.json(block, { status: 201 });
}
