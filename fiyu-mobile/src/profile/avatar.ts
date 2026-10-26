import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { updateProfileAvatar } from "@/api/client";
import { getSupabaseClient } from "@/auth/supabase";
const AVATAR_BUCKET = "avatars";
const AVATAR_SIZE = 512;
export async function chooseAndUploadAvatar(userId: string) {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || !asset.width || !asset.height) throw new Error("Fiyu couldn’t read that image.");
  if (asset.fileSize && asset.fileSize > 10_000_000) throw new Error("Choose a JPG, PNG, or WebP image under 10 MB.");
  const scale = Math.min(1, 2048 / Math.max(asset.width, asset.height));
  const width = asset.width * scale;
  const height = asset.height * scale;
  const side = Math.min(width, height);
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri, { maxWidth: 2048, maxHeight: 2048 });
  context.crop({ originX: Math.max(0, (width - side) / 2), originY: Math.max(0, (height - side) / 2), width: side, height: side }).resize({ width: AVATAR_SIZE, height: AVATAR_SIZE });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.WEBP, compress: 0.82 });
  const bytes = await (await fetch(image.uri)).arrayBuffer();
  const path = `${userId}/avatar.webp`;
  const client = getSupabaseClient();
  const { error } = await client.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: "image/webp", cacheControl: "3600", upsert: true });
  if (error) throw new Error("Unable to upload your profile photo.");
  const { data } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return updateProfileAvatar(`${data.publicUrl}?v=${Date.now()}`);
}
export async function removeAvatar(userId: string, previousAvatarUrl: string) {
  const client = getSupabaseClient();
  const profile = await updateProfileAvatar(null);
  const { error } = await client.storage.from(AVATAR_BUCKET).remove([`${userId}/avatar.webp`]);
  if (error) {
    await updateProfileAvatar(previousAvatarUrl);
    throw new Error("Unable to remove your profile photo.");
  }
  return profile;
}
