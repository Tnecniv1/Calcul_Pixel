// src/screens/GlobalChatScreen.tsx
import React, { useCallback, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { theme } from "../theme";
import { useGlobalChat } from "../hooks/useGlobalChat";
import MessageBubble from "../components/MessageBubble";
import ChatInput from "../components/ChatInput";
import type { Message } from "../services/chatService";

export default function GlobalChatScreen() {
  const {
    messages,
    isLoading,
    isLoadingMore,
    isBanned,
    isAdmin,
    userInfo,
    hasMore,
    error,
    sendMessage,
    loadMore,
    banUser,
    clearError,
  } = useGlobalChat();

  const flatListRef = useRef<FlatList<Message>>(null);

  // Scroll vers le bas quand un nouveau message arrive
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // Handler pour bannir un utilisateur
  const handleBanUser = useCallback(
    async (userId: number, senderName: string) => {
      Alert.alert(
        "Confirmer le bannissement",
        `Voulez-vous vraiment bannir ${senderName} ? Cette personne ne pourra plus envoyer de messages.`,
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Bannir",
            style: "destructive",
            onPress: async () => {
              const success = await banUser(userId, `Banni par admin`);
              if (success) {
                Alert.alert("Succes", `${senderName} a ete banni.`);
              }
            },
          },
        ]
      );
    },
    [banUser]
  );

  // Handler pour envoyer un message
  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      const success = await sendMessage(content);
      if (success) {
        // Petit delai pour laisser le message s'ajouter
        setTimeout(scrollToBottom, 100);
      }
      return success;
    },
    [sendMessage, scrollToBottom]
  );

  // Charger plus de messages (pagination vers le haut)
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      loadMore();
    }
  }, [isLoadingMore, hasMore, loadMore]);

  // Rendu d'un message
  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        message={item}
        isOwnMessage={userInfo?.user_id === item.sender_id}
        isAdmin={isAdmin}
        onBanUser={handleBanUser}
      />
    ),
    [userInfo, isAdmin, handleBanUser]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Header de la liste (loader pour pagination)
  const ListHeaderComponent = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={theme.colors.secondary} />
          <Text style={styles.loadingMoreText}>Chargement...</Text>
        </View>
      );
    }
    if (!hasMore && messages.length > 0) {
      return (
        <View style={styles.loadingMore}>
          <Text style={styles.noMoreText}>Debut de la conversation</Text>
        </View>
      );
    }
    return null;
  }, [isLoadingMore, hasMore, messages.length]);

  // Affichage erreur
  if (error) {
    Alert.alert("Erreur", error, [{ text: "OK", onPress: clearError }]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Chargement initial */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.loadingText}>Chargement des messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Aucun message</Text>
            <Text style={styles.emptySubtitle}>
              Soyez le premier a envoyer un message !
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={ListHeaderComponent}
            onStartReached={handleLoadMore}
            onStartReachedThreshold={0.5}
            onContentSizeChange={scrollToBottom}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Zone de saisie */}
        <ChatInput
          onSend={handleSend}
          isBanned={isBanned}
          disabled={isLoading}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: theme.colors.text,
    opacity: 0.7,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    color: theme.colors.text,
    opacity: 0.6,
    fontSize: 14,
    textAlign: "center",
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  loadingMoreText: {
    color: theme.colors.text,
    opacity: 0.6,
    fontSize: 12,
  },
  noMoreText: {
    color: theme.colors.text,
    opacity: 0.4,
    fontSize: 12,
    fontStyle: "italic",
  },
});
