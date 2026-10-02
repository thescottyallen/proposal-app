import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/roles.server";
import { ownerOrAdminWhere } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/content-blocks - list all content blocks
// ?view=index omits content. The library page only shows name and category.
// The editor picker still needs the full block so it can insert it.
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const indexOnly = request.nextUrl.searchParams.get("view") === "index";
  const blocks = await prisma.contentBlock.findMany({
    // Admins see every content block; everyone else only their own.
    where: ownerOrAdminWhere(ctx.role, ctx.userId),
    orderBy: { createdAt: "desc" },
    ...(indexOnly
      ? { select: { id: true, name: true, category: true, createdAt: true, updatedAt: true } }
      : {}),
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
