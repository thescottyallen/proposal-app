import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/roles.server";
import { ownerOrAdminWhere } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

// GET /api/templates - list all templates
// ?view=index omits content (the templates page only shows the name and date).
// The new-proposal chooser needs the full document, so it calls this without the flag.
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const indexOnly = request.nextUrl.searchParams.get("view") === "index";
  const templates = await prisma.template.findMany({
    // Admins see every template; everyone else only their own.
    where: ownerOrAdminWhere(ctx.role, ctx.userId),
    orderBy: { createdAt: "desc" },
    ...(indexOnly
      ? { select: { id: true, name: true, createdAt: true, updatedAt: true } }
      : {}),
  });

  return NextResponse.json(templates);
}

// POST /api/templates - create a new template
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, content } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    const template = await prisma.template.create({
      data: {
        name,
        content: content || {},
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("POST /api/templates error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
