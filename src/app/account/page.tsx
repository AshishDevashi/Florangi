import { redirect } from "next/navigation";

export const instant = false;

export default async function AccountPage() {
  redirect("/track-order");
}