// src/hooks/useGlobalChat.ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Message,
  UserInfo,
  fetchMessages,
  sendMessage as sendMessageService,
  checkIfBanned,
  banUser as banUserService,
  unbanUser as unbanUserService,
  subscribeToMessages,
  getCurrentUserInfo,
} from "../services/chatService";

type UseGlobalChatReturn = {
  // State
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isBanned: boolean;
  isAdmin: boolean;
  userInfo: UserInfo | null;
  hasMore: boolean;
  error: string | null;

  // Actions
  sendMessage: (content: string) => Promise<boolean>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  banUser: (userId: number, reason?: string) => Promise<boolean>;
  unbanUser: (userId: number) => Promise<boolean>;
  clearError: () => void;
};

export function useGlobalChat(): UseGlobalChatReturn {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs pour eviter les problemes de closure dans les callbacks
  const messagesRef = useRef<Message[]>([]);
  const userInfoRef = useRef<UserInfo | null>(null);

  // Sync refs avec state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    userInfoRef.current = userInfo;
  }, [userInfo]);

  // Charger les infos utilisateur
  const loadUserInfo = useCallback(async () => {
    try {
      const info = await getCurrentUserInfo();
      setUserInfo(info);
      setIsAdmin(info?.is_admin || false);
      return info;
    } catch (err) {
      console.error("[useGlobalChat] loadUserInfo error:", err);
      return null;
    }
  }, []);

  // Verifier si banni
  const checkBanStatus = useCallback(async () => {
    try {
      const banned = await checkIfBanned();
      setIsBanned(banned);
      return banned;
    } catch (err) {
      console.error("[useGlobalChat] checkBanStatus error:", err);
      return false;
    }
  }, []);

  // Charger les messages initiaux
  const loadMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchMessages();
      // Messages sont en ordre DESC, on les inverse pour l'affichage (plus ancien en haut)
      setMessages(data.reverse());
      setHasMore(data.length >= 50);
    } catch (err: any) {
      console.error("[useGlobalChat] loadMessages error:", err);
      setError(err?.message || "Erreur lors du chargement des messages");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Charger plus de messages (pagination)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || messagesRef.current.length === 0) return;

    try {
      setIsLoadingMore(true);
      // Le plus ancien message actuel (premier dans le tableau)
      const oldestMessage = messagesRef.current[0];
      const cursor = oldestMessage?.created_at;

      const olderMessages = await fetchMessages(cursor);

      if (olderMessages.length === 0) {
        setHasMore(false);
      } else {
        // Ajouter les anciens messages au debut (ils sont en DESC, donc inverser)
        setMessages((prev) => [...olderMessages.reverse(), ...prev]);
        setHasMore(olderMessages.length >= 50);
      }
    } catch (err: any) {
      console.error("[useGlobalChat] loadMore error:", err);
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore]);

  // Rafraichir tout
  const refresh = useCallback(async () => {
    await Promise.all([loadMessages(), checkBanStatus(), loadUserInfo()]);
  }, [loadMessages, checkBanStatus, loadUserInfo]);

  // Envoyer un message
  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    try {
      setError(null);
      const message = await sendMessageService(content);
      // Le message sera ajoute via Realtime, pas besoin de l'ajouter manuellement
      // Mais on peut l'ajouter pour un feedback immediat si Realtime est lent
      if (message && !messagesRef.current.find((m) => m.id === message.id)) {
        setMessages((prev) => [...prev, message]);
      }
      return true;
    } catch (err: any) {
      console.error("[useGlobalChat] sendMessage error:", err);
      setError(err?.message || "Erreur lors de l'envoi");
      // Verifier si c'est une erreur de bannissement
      if (err?.message?.includes("ne pouvez pas")) {
        setIsBanned(true);
      }
      return false;
    }
  }, []);

  // Bannir un utilisateur (admin)
  const banUser = useCallback(
    async (userId: number, reason?: string): Promise<boolean> => {
      try {
        setError(null);
        await banUserService(userId, reason);
        return true;
      } catch (err: any) {
        console.error("[useGlobalChat] banUser error:", err);
        setError(err?.message || "Erreur lors du bannissement");
        return false;
      }
    },
    []
  );

  // Debannir un utilisateur (admin)
  const unbanUser = useCallback(async (userId: number): Promise<boolean> => {
    try {
      setError(null);
      await unbanUserService(userId);
      return true;
    } catch (err: any) {
      console.error("[useGlobalChat] unbanUser error:", err);
      setError(err?.message || "Erreur lors du debannissement");
      return false;
    }
  }, []);

  // Effacer l'erreur
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Handler pour les nouveaux messages Realtime
  const handleNewMessage = useCallback((message: Message) => {
    // Eviter les doublons (si on a deja ajoute le message localement)
    setMessages((prev) => {
      if (prev.find((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
    // Les notifications push sont envoyees via le backend (chatService.sendMessage)
  }, []);

  // Effet initial : charger tout et s'abonner
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      // Charger les donnees
      await Promise.all([loadMessages(), checkBanStatus(), loadUserInfo()]);

      // S'abonner aux nouveaux messages
      unsubscribe = subscribeToMessages(handleNewMessage);
    };

    init();

    // Cleanup
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [loadMessages, checkBanStatus, loadUserInfo, handleNewMessage]);

  return {
    // State
    messages,
    isLoading,
    isLoadingMore,
    isBanned,
    isAdmin,
    userInfo,
    hasMore,
    error,

    // Actions
    sendMessage,
    loadMore,
    refresh,
    banUser,
    unbanUser,
    clearError,
  };
}
