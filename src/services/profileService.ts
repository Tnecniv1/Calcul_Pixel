// src/services/profileService.ts
import { supabase } from "../supabase";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { decode } from "base64-arraybuffer";

// ============================================
// TYPES
// ============================================

export type UserProfile = {
  user_id: number;
  auth_uid: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

// ============================================
// CONSTANTES
// ============================================

const BUCKET_NAME = "avatars";
const MAX_IMAGE_SIZE = 500; // pixels

// ============================================
// FONCTIONS PROFIL
// ============================================

/**
 * Recupere le profil de l'utilisateur connecte
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("users_map")
      .select("user_id, auth_uid, display_name, avatar_url, is_admin")
      .eq("auth_uid", user.id)
      .single();

    if (error) {
      console.error("[profileService] getCurrentProfile error:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[profileService] getCurrentProfile failed:", err);
    return null;
  }
}

/**
 * Verifie si un pseudo est disponible
 */
export async function checkDisplayNameAvailable(
  displayName: string,
  excludeUserId?: number
): Promise<boolean> {
  try {
    // Utiliser la fonction SQL si disponible
    const { data, error } = await supabase.rpc("check_display_name_available", {
      p_display_name: displayName,
      p_exclude_user_id: excludeUserId || null,
    });

    if (error) {
      // Fallback: verification manuelle
      console.warn("[profileService] RPC failed, using fallback:", error);
      const { data: existing } = await supabase
        .from("users_map")
        .select("user_id")
        .ilike("display_name", displayName)
        .neq("user_id", excludeUserId || -1)
        .limit(1);

      return !existing || existing.length === 0;
    }

    return data === true;
  } catch (err) {
    console.error("[profileService] checkDisplayNameAvailable failed:", err);
    return false;
  }
}

/**
 * Met a jour le pseudo de l'utilisateur
 */
export async function updateDisplayName(displayName: string | null): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non connecte");

    // Validation
    if (displayName !== null) {
      const trimmed = displayName.trim();
      if (trimmed.length < 3) {
        throw new Error("Le pseudo doit contenir au moins 3 caracteres");
      }
      if (trimmed.length > 20) {
        throw new Error("Le pseudo ne peut pas depasser 20 caracteres");
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        throw new Error("Le pseudo ne peut contenir que des lettres, chiffres, - et _");
      }
      displayName = trimmed;
    }

    const { error } = await supabase
      .from("users_map")
      .update({ display_name: displayName })
      .eq("auth_uid", user.id);

    if (error) {
      console.error("[profileService] updateDisplayName error:", error);
      if (error.code === "23505") {
        throw new Error("Ce pseudo est deja pris");
      }
      throw error;
    }

    return true;
  } catch (err) {
    console.error("[profileService] updateDisplayName failed:", err);
    throw err;
  }
}

// ============================================
// FONCTIONS AVATAR
// ============================================

/**
 * Redimensionne une image avant upload
 * Utilise la nouvelle API chainable d'expo-image-manipulator v13+
 * Propage l'erreur au lieu de la masquer pour eviter de traiter une image trop volumineuse
 */
async function resizeImage(uri: string): Promise<string> {
  const imageRef = await ImageManipulator.manipulate(uri)
    .resize({ width: MAX_IMAGE_SIZE, height: MAX_IMAGE_SIZE })
    .renderAsync();

  const result = await imageRef.saveAsync({
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  return result.uri;
}

/**
 * Upload un avatar vers Supabase Storage
 */
export async function uploadAvatar(imageUri: string): Promise<string> {
  try {
    // Recuperer le profil pour avoir le user_id
    const profile = await getCurrentProfile();
    if (!profile) throw new Error("Profil non trouve");

    // Redimensionner l'image
    const resizedUri = await resizeImage(imageUri);

    // Generer le nom du fichier
    const timestamp = Date.now();
    const fileName = `${profile.user_id}_${timestamp}.jpg`;

    console.log("[profileService] Reading image from:", resizedUri);

    // Lire l'image en base64 avec expo-file-system
    const base64 = await FileSystem.readAsStringAsync(resizedUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log("[profileService] Base64 length:", base64.length);

    // Convertir base64 en ArrayBuffer
    const arrayBuffer = decode(base64);

    console.log("[profileService] ArrayBuffer size:", arrayBuffer.byteLength);

    // Supprimer l'ancien avatar si existe
    if (profile.avatar_url) {
      try {
        // Extraire le nom du fichier de l'URL
        const oldFileName = profile.avatar_url.split("/").pop();
        if (oldFileName) {
          await supabase.storage.from(BUCKET_NAME).remove([oldFileName]);
          console.log("[profileService] Deleted old avatar:", oldFileName);
        }
      } catch (e) {
        console.warn("[profileService] Failed to delete old avatar:", e);
      }
    }

    // Upload le nouveau fichier avec ArrayBuffer
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, arrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (error) {
      console.error("[profileService] uploadAvatar error:", error);
      throw new Error("Echec de l'upload de l'image");
    }

    console.log("[profileService] Upload success:", data);

    // Obtenir l'URL publique
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    console.log("[profileService] Public URL:", publicUrl);

    // Mettre a jour le profil avec la nouvelle URL
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("users_map")
        .update({ avatar_url: publicUrl })
        .eq("auth_uid", user.id);
    }

    return publicUrl;
  } catch (err) {
    console.error("[profileService] uploadAvatar failed:", err);
    throw err;
  }
}

/**
 * Supprime l'avatar de l'utilisateur
 */
export async function deleteAvatar(): Promise<boolean> {
  try {
    const profile = await getCurrentProfile();
    if (!profile) throw new Error("Profil non trouve");

    if (profile.avatar_url) {
      // Extraire le nom du fichier
      const fileName = profile.avatar_url.split("/").pop();
      if (fileName) {
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
      }
    }

    // Mettre a jour le profil
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("users_map")
        .update({ avatar_url: null })
        .eq("auth_uid", user.id);
    }

    return true;
  } catch (err) {
    console.error("[profileService] deleteAvatar failed:", err);
    throw err;
  }
}

/**
 * Met a jour le profil complet (pseudo + avatar)
 */
export async function updateProfile(
  displayName: string | null,
  avatarUri: string | null
): Promise<{ success: boolean; avatarUrl: string | null }> {
  let avatarUrl: string | null = null;

  // Upload avatar si fourni
  if (avatarUri) {
    avatarUrl = await uploadAvatar(avatarUri);
  }

  // Mettre a jour le pseudo
  await updateDisplayName(displayName);

  return { success: true, avatarUrl };
}
