import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";
import { db } from "@/lib/supabase";
import { emitEvent } from "@/lib/socket";

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

  // Broadcast to all connected users so every open tab/page updates live
  emitEvent("leaderboard:updated", { action: "image_uploaded", image: data });

  return NextResponse.json({ image: data });
}

/** PATCH — admin updates title and/or replaces screenshot image */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") || "";
  let id: string = "";
  let title: string | undefined = undefined;
  let imageUrl: string | undefined = undefined;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    id = (formData.get("id") as string) ?? "";
    if (formData.has("title")) {
      title = (formData.get("title") as string)?.trim() ?? "";
    }
    const file = formData.get("image") as File | null;
    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      imageUrl = await uploadImage(buffer, "codfest/leaderboard");
    }
  } else {
    const body = await req.json().catch(() => ({}));
    id = body.id;
    if (body.title !== undefined) title = body.title?.trim() ?? "";
    if (body.image_url) imageUrl = body.image_url;
  }

  if (!id) return NextResponse.json({ error: "Missing image id" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title || null;
  if (imageUrl) updates.image_url = imageUrl;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("leaderboard_images")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Broadcast update to all users
  emitEvent("leaderboard:updated", { action: "image_updated", image: data });

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

  // Broadcast deletion to all users
  emitEvent("leaderboard:updated", { action: "image_deleted", id });

  return NextResponse.json({ ok: true });
}
