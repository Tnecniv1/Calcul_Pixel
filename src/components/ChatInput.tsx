// src/components/ChatInput.tsx
import React, { useState, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { theme } from "../theme";

type Props = {
  onSend: (content: string) => Promise<boolean>;
  isBanned: boolean;
  disabled?: boolean;
};

const MAX_LENGTH = 500;

export default function ChatInput({ onSend, isBanned, disabled }: Props) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const trimmedText = text.trim();
  const canSend = trimmedText.length > 0 && !isSending && !disabled && !isBanned;

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    setIsSending(true);
    Keyboard.dismiss();

    try {
      const success = await onSend(trimmedText);
      if (success) {
        setText("");
      }
    } finally {
      setIsSending(false);
    }
  }, [canSend, trimmedText, onSend]);

  // Affichage special si banni
  if (isBanned) {
    return (
      <View style={styles.bannedContainer}>
        <Text style={styles.bannedText}>
          Vous ne pouvez plus envoyer de messages
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Message..."
        placeholderTextColor={theme.colors.text + "80"}
        maxLength={MAX_LENGTH}
        multiline
        editable={!isSending && !disabled}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={handleSend}
      />

      <TouchableOpacity
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={!canSend}
        activeOpacity={0.7}
      >
        {isSending ? (
          <ActivityIndicator size="small" color={theme.colors.bg} />
        ) : (
          <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>
            &gt;
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  sendIcon: {
    color: theme.colors.bg,
    fontSize: 18,
    fontWeight: "900",
  },
  sendIconDisabled: {
    color: theme.colors.text,
    opacity: 0.5,
  },
  bannedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.danger,
    alignItems: "center",
  },
  bannedText: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
