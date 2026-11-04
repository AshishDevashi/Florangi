import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/guards";
import { checkRateLimit, isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { removeCategoryImage, saveCategoryImage } from "@/server/services/catalog";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  if (!checkRateLimit(request, "category-image-upload", 20, 60_000).allowed) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  try {
    await requireAdmin();
    const data = await request.formData();
    const file = data.get("file");
    const position = data.get("position");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Choose an image no larger than 5 MB." }, { status: 400 });
    if (position !== "0" && position !== "1") return NextResponse.json({ error: "Choose image slot 1 or 2." }, { status: 400 });
    const { id } = await params;
    const image = await saveCategoryImage(id, Number(position), Buffer.from(await file.arrayBuffer()), file.type);
    if (!image) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json(image, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const { position } = await request.json() as { position: number };
    const image = await removeCategoryImage(id, position);
    if (!image) return NextResponse.json({ error: "Image not found." }, { status: 404 });
    return NextResponse.json(image);
  } catch (error) { return apiError(error); }
}