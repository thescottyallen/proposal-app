import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// POST /api/upload
// Accepts multipart/form-data with a single "file" field (image).
// Returns { url: string } — a base64 data URL embedded directly in the document.
// Swap this handler for Supabase Storage / S3 later without touching the editor.
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image (JPEG, PNG, GIF, WebP, etc.)" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 5 MB" },
      { status: 400 }
    );
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  return NextResponse.json({ url: dataUrl });
}
