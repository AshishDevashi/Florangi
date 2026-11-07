import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/server/auth/request-security";
import { apiError } from "@/server/http/api-error";
import { deleteCategory, updateCategory } from "@/server/services/catalog";

export async function DELETE(request: Request, { params }: RouteContext<"/api/admin/categories/[id]">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const category = await deleteCategory(id);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json(category);
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/categories/[id]">) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const { id } = await params;
    const category = await updateCategory(id, await request.json());
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json(category);
  } catch (error) {
    return apiError(error);
  }
}