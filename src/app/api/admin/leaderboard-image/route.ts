import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET — fetch all leaderboard images (public, newest first) */
export async function GET() {
  const { data, error } = await db()
    .from("leaderboard_images")
    .select("id, title, image_url, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ images: data ?? [] });
}

/** POST — admin uploads a score screenshot */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  const title = (formData.get("title") as string | null)?.trim() ?? "";

  if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageUrl = await uploadImage(buffer, "codfest/leaderboard");

  const { data, error } = await db()
    .from("leaderboard_images")
    .insert({ title: title || null, image_url: imageUrl })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ image: data });
}

/** DELETE — admin removes an image by id */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "No id" }, { status: 400 });

  const { error } = await db().from("leaderboard_images").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
