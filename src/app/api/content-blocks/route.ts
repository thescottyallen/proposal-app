import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// GET /api/content-blocks - list all content blocks
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blocks = await prisma.contentBlock.findMany({
    where: { createdBy: userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(blocks);
}

// POST /api/content-blocks - create a new content block
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
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
      createdBy: userId,
    },
  });

  return NextResponse.json(block, { status: 201 });
}
