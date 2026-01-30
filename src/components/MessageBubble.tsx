// src/components/MessageBubble.tsx
import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from "react-native";
import { theme } from "../theme";
import type { Message } from "../services/chatService";

type Props = {
  message: Message;
  isOwnMessage: boolean;
  isAdmin: boolean;
  onBanUser?: (userId: number, senderName: string) => void;
};

// ============================================
// COMPOSANT AVATAR
// ============================================

type AvatarProps = {
  uri: string | null;
  name: string;
  size: number;
};

function Avatar({ uri, name, size }: AvatarProps) {
  // Generer une couleur basee sur le nom
  const getColor = (str: string) => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const initial = (name || "U")[0].toUpperCase();
  const bgColor = getColor(name || "User");

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarPlaceholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.45 }]}>{initial}</Text>
    </View>
  );
}

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

/**
 * Formate une date ISO en heure locale (ex: "14:32")
 */
function formatTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function MessageBubble({
  message,
  isOwnMessage,
  isAdmin,
  onBanUser,
}: Props) {
  // Utiliser display_name si disponible, sinon sender_name
  const displayName = message.display_name || message.sender_name;

  const handleLongPress = useCallback(() => {
    if (!isAdmin || isOwnMessage) return;

    Alert.alert(
      "Moderation",
      `Bannir ${displayName} ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Bannir",
          style: "destructive",
          onPress: () => onBanUser?.(message.sender_id, displayName),
        },
      ],
      { cancelable: true }
    );
  }, [isAdmin, isOwnMessage, message, displayName, onBanUser]);

  return (
    <TouchableOpacity
      activeOpacity={isAdmin && !isOwnMessage ? 0.7 : 1}
      onLongPress={handleLongPress}
      delayLongPress={500}
      disabled={!isAdmin || isOwnMessage}
    >
      <View style={styles.messageRow}>
        {/* Avatar */}
        <Avatar
          uri={message.avatar_url}
          name={displayName}
          size={40}
        />

        {/* Bulle de message */}
        <View
          style={[
            styles.container,
            isOwnMessage && styles.containerOwn,
          ]}
        >
          {/* Header: Nom de l'expediteur */}
          <Text style={[styles.senderName, isOwnMessage && styles.senderNameOwn]}>
            {displayName}
          </Text>

          {/* Contenu du message */}
          <Text style={styles.content}>{message.content}</Text>

          {/* Footer: Heure */}
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 4,
    marginHorizontal: 12,
    gap: 8,
  },
  avatar: {
    backgroundColor: theme.colors.card,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontWeight: "700",
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  containerOwn: {
    backgroundColor: "#1a2a3a",
    borderColor: theme.colors.secondary,
    borderWidth: 1,
  },
  senderName: {
    color: theme.colors.secondary,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 4,
  },
  senderNameOwn: {
    color: theme.colors.accent,
  },
  content: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  time: {
    color: theme.colors.text,
    opacity: 0.5,
    fontSize: 11,
    marginTop: 6,
    alignSelf: "flex-end",
  },
});
