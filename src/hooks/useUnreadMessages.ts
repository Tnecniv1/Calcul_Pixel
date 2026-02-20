import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_READ_KEY = 'chat_last_read_timestamp';

export function useUnreadMessages(authUid: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!authUid) return;

    let subscription: any;

    const loadUnreadCount = async () => {
      try {
        // Récupérer le timestamp de dernière lecture
        const lastRead = await AsyncStorage.getItem(LAST_READ_KEY);
        const lastReadDate = lastRead ? new Date(lastRead) : new Date(0);

        // Compter les messages depuis cette date
        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .gt('created_at', lastReadDate.toISOString());

        if (!error && count !== null) {
          setUnreadCount(count);
        }
      } catch (e) {
        console.error('[useUnreadMessages] Error:', e);
      }
    };

    // Charger au montage
    loadUnreadCount();

    // Écouter les nouveaux messages en temps réel
    subscription = supabase
      .channel('messages-unread')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      subscription?.unsubscribe();
    };
  }, [authUid]);

  return { unreadCount };
}

// Marquer les messages comme lus (appelée depuis GlobalChatScreen)
export async function markMessagesAsRead() {
  try {
    await AsyncStorage.setItem(LAST_READ_KEY, new Date().toISOString());
  } catch (e) {
    console.error('[markMessagesAsRead] Error:', e);
  }
}
