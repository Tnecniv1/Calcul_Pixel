// src/services/chatService.ts
import { supabase } from "../supabase";
import { API_BASE } from "../config";

// ============================================
// TYPES
// ============================================

export type Message = {
  id: string;
  sender_id: number;
  sender_name: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  created_at: string;
};

export type BannedUser = {
  user_id: number;
  banned_at: string;
  reason: string | null;
};

export type UserInfo = {
  user_id: number;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
};

// ============================================
// CONSTANTES
// ============================================

const PAGE_SIZE = 50;

// ============================================
// FONCTIONS UTILISATEUR
// ============================================

/**
 * Recupere les infos de l'utilisateur courant (user_id, name, is_admin)
 * depuis users_map et Users
 */
export async function getCurrentUserInfo(): Promise<UserInfo | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Recuperer user_id, is_admin, display_name, avatar_url depuis users_map
    const { data: mapData, error: mapError } = await supabase
      .from("users_map")
      .select("user_id, is_admin, display_name, avatar_url")
      .eq("auth_uid", user.id)
      .single();

    if (mapError || !mapData) {
      console.error("[chatService] users_map lookup failed:", mapError);
      return null;
    }

    // Recuperer le nom depuis Users
    const { data: userData, error: userError } = await supabase
      .from("Users")
      .select("name")
      .eq("id", mapData.user_id)
      .single();

    if (userError || !userData) {
      console.error("[chatService] Users lookup failed:", userError);
      return null;
    }

    return {
      user_id: mapData.user_id,
      name: userData.name || "Utilisateur",
      display_name: mapData.display_name || null,
      avatar_url: mapData.avatar_url || null,
      is_admin: mapData.is_admin || false,
    };
  } catch (err) {
    console.error("[chatService] getCurrentUserInfo error:", err);
    return null;
  }
}

// ============================================
// MESSAGES
// ============================================

/**
 * Enrichit les messages avec les donnees actuelles de users_map
 */
async function enrichMessagesWithProfiles(messages: any[]): Promise<Message[]> {
  if (messages.length === 0) return [];

  // Extraire les sender_id uniques
  const senderIds = [...new Set(messages.map((m) => m.sender_id))];

  // Recuperer les profils depuis users_map
  const { data: profiles, error } = await supabase
    .from("users_map")
    .select("user_id, display_name, avatar_url")
    .in("user_id", senderIds);

  if (error) {
    console.warn("[chatService] Failed to fetch profiles:", error);
    // Retourner les messages sans enrichissement
    return messages;
  }

  // Creer une map pour lookup rapide
  const profileMap = new Map(
    (profiles || []).map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
  );

  // Enrichir chaque message avec les donnees actuelles du profil
  return messages.map((m) => {
    const profile = profileMap.get(m.sender_id);
    return {
      ...m,
      // Utiliser les donnees actuelles de users_map (priorite) ou celles du message
      display_name: profile?.display_name || m.display_name || null,
      avatar_url: profile?.avatar_url || m.avatar_url || null,
    };
  });
}

/**
 * Recupere les messages du chat global
 * @param cursor - Date ISO pour pagination (recupere les messages avant cette date)
 * @returns Les 50 messages les plus recents (ou avant le cursor)
 */
export async function fetchMessages(cursor?: string): Promise<Message[]> {
  try {
    let query = supabase
      .from("messages")
      .select("id, sender_id, sender_name, display_name, avatar_url, content, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    // Pagination: messages avant le cursor
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[chatService] fetchMessages error:", error);
      throw error;
    }

    // Enrichir les messages avec les profils actuels
    const enrichedMessages = await enrichMessagesWithProfiles(data || []);

    return enrichedMessages;
  } catch (err) {
    console.error("[chatService] fetchMessages failed:", err);
    return [];
  }
}

/**
 * Envoie un message dans le chat global
 * @param content - Contenu du message (1-500 caracteres)
 * @returns Le message cree ou null en cas d'erreur
 */
export async function sendMessage(content: string): Promise<Message | null> {
  try {
    // Validation
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      throw new Error("Le message doit contenir entre 1 et 500 caracteres");
    }

    // Recuperer les infos utilisateur
    const userInfo = await getCurrentUserInfo();
    if (!userInfo) {
      throw new Error("Utilisateur non connecte");
    }

    // Inserer le message avec display_name et avatar_url
    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: userInfo.user_id,
        sender_name: userInfo.name,
        display_name: userInfo.display_name,
        avatar_url: userInfo.avatar_url,
        content: trimmed,
      })
      .select()
      .single();

    if (error) {
      console.error("[chatService] sendMessage error:", error);
      // Erreur RLS si banni
      if (error.code === "42501" || error.message.includes("policy")) {
        throw new Error("Vous ne pouvez pas envoyer de messages");
      }
      throw error;
    }

    // Envoyer les notifications push aux autres utilisateurs (en arriere-plan)
    if (data) {
      notifyNewChatMessage(
        userInfo.user_id,
        userInfo.display_name || userInfo.name,
        trimmed,
        data.id
      ).catch((err) => {
        console.warn("[chatService] Notification push echec (non bloquant):", err);
      });
    }

    return data;
  } catch (err) {
    console.error("[chatService] sendMessage failed:", err);
    throw err;
  }
}

/**
 * Notifie les autres utilisateurs d'un nouveau message via le backend
 * (appel non bloquant, les erreurs sont ignorees)
 */
async function notifyNewChatMessage(
  senderId: number,
  senderName: string,
  messageContent: string,
  messageId: string
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/notifications/chat-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender_id: senderId,
        sender_name: senderName,
        message_content: messageContent,
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      console.warn("[chatService] notifyNewChatMessage HTTP error:", response.status);
    } else {
      const result = await response.json();
      console.log("[chatService] Notifications envoyees:", result);
    }
  } catch (err) {
    console.warn("[chatService] notifyNewChatMessage failed:", err);
  }
}

// ============================================
// BANNISSEMENT
// ============================================

/**
 * Verifie si l'utilisateur courant est banni
 * @returns true si banni, false sinon
 */
export async function checkIfBanned(): Promise<boolean> {
  try {
    const userInfo = await getCurrentUserInfo();
    if (!userInfo) return false;

    const { data, error } = await supabase
      .from("banned_users")
      .select("user_id")
      .eq("user_id", userInfo.user_id)
      .maybeSingle();

    if (error) {
      console.error("[chatService] checkIfBanned error:", error);
      return false;
    }

    return data !== null;
  } catch (err) {
    console.error("[chatService] checkIfBanned failed:", err);
    return false;
  }
}

/**
 * Bannit un utilisateur (admin only)
 * @param userId - ID de l'utilisateur a bannir
 * @param reason - Raison du bannissement (optionnel)
 */
export async function banUser(userId: number, reason?: string): Promise<void> {
  try {
    const { error } = await supabase
      .from("banned_users")
      .insert({
        user_id: userId,
        reason: reason || null,
      });

    if (error) {
      console.error("[chatService] banUser error:", error);
      if (error.code === "42501" || error.message.includes("policy")) {
        throw new Error("Seuls les administrateurs peuvent bannir");
      }
      if (error.code === "23505") {
        throw new Error("Cet utilisateur est deja banni");
      }
      throw error;
    }
  } catch (err) {
    console.error("[chatService] banUser failed:", err);
    throw err;
  }
}

/**
 * Debannit un utilisateur (admin only)
 * @param userId - ID de l'utilisateur a debannir
 */
export async function unbanUser(userId: number): Promise<void> {
  try {
    const { error } = await supabase
      .from("banned_users")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("[chatService] unbanUser error:", error);
      if (error.code === "42501" || error.message.includes("policy")) {
        throw new Error("Seuls les administrateurs peuvent debannir");
      }
      throw error;
    }
  } catch (err) {
    console.error("[chatService] unbanUser failed:", err);
    throw err;
  }
}

// ============================================
// REALTIME SUBSCRIPTION
// ============================================

/**
 * Enrichit un seul message avec le profil actuel
 */
async function enrichSingleMessage(message: any): Promise<Message> {
  try {
    const { data: profile } = await supabase
      .from("users_map")
      .select("display_name, avatar_url")
      .eq("user_id", message.sender_id)
      .single();

    return {
      ...message,
      display_name: profile?.display_name || message.display_name || null,
      avatar_url: profile?.avatar_url || message.avatar_url || null,
    };
  } catch {
    return message;
  }
}

/**
 * S'abonne aux nouveaux messages en temps reel
 * @param onNewMessage - Callback appele quand un nouveau message arrive
 * @returns Fonction pour se desabonner
 */
export function subscribeToMessages(
  onNewMessage: (message: Message) => void
): () => void {
  const channel = supabase
    .channel("global-chat")
    .on<Message>(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      async (payload) => {
        if (payload.new) {
          // Enrichir le message avec le profil actuel
          const enrichedMessage = await enrichSingleMessage(payload.new);
          onNewMessage(enrichedMessage);
        }
      }
    )
    .subscribe((status) => {
      console.log("[chatService] Realtime subscription status:", status);
    });

  // Retourne la fonction de cleanup
  return () => {
    console.log("[chatService] Unsubscribing from realtime");
    supabase.removeChannel(channel);
  };
}
