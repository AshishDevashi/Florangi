import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, ResourceNotFoundError } from "@/server/auth/guards";

export function apiError(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Please check the submitted details." }, { status: 400 });
  }
  if (error instanceof RangeError || error instanceof TypeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof AuthenticationError || error instanceof AuthorizationError || error instanceof ResourceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && "status" in error && error.status === 409) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "A record with the same unique value already exists." }, { status: 409 });
  }
  console.error("api.request_failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: "The request could not be completed." }, { status: 500 });
}