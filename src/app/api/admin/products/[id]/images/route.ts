import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/guards";
import { isSameOriginMutation, checkRateLimit } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { addProductImage, reorderProductImages } from "@/server/services/catalog";

export async function POST(request: Request, { params }: RouteContext<"/api/admin/products/[id]/images">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const limit = checkRateLimit(request, "product-image-upload", 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many uploads. Try again shortly." }, { status: 429 });
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
    const { id } = await params;
    const image = await addProductImage(id, Buffer.from(await file.arrayBuffer()), file.type);
    if (!image) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/products/[id]/images">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json() as { imageIds?: unknown };
    if (!Array.isArray(body.imageIds) || body.imageIds.some((item) => typeof item !== "string")) {
      return NextResponse.json({ error: "Provide the ordered image identifiers." }, { status: 400 });
    }
    return NextResponse.json(await reorderProductImages(id, body.imageIds));
  } catch (error) {
    return apiError(error);
  }
}