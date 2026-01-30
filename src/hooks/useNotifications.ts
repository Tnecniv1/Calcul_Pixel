import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, NotificationToken } from '../services/notificationService';
import { supabase } from '../supabase';

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

    useEffect(() => {
    // Enregistrer pour les notifications push
    registerForPushNotifications().then(async (tokenData) => {
        if (tokenData) {
        setExpoPushToken(tokenData.token);
        
        // Sauvegarder le token dans Supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await saveTokenToDatabase(user.id, tokenData.token); // user.id = auth_uid
        }
        }
    });


    // Écouter les notifications reçues quand l'app est ouverte
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('[Notifications] Reçue:', notification);
      setNotification(notification);
    });

    // Écouter les interactions avec les notifications
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[Notifications] Cliquée:', response);
      // Ici vous pouvez naviguer vers un écran spécifique selon response.notification.request.content.data
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    expoPushToken,
    notification,
  };
}

/**
 * Sauvegarder le token de notification dans Supabase
 */
async function saveTokenToDatabase(authUid: string, token: string) {
  try {
    // 1. Récupérer le user_id depuis users_map
    const { data: mapData, error: mapError } = await supabase
      .from('users_map')
      .select('user_id')
      .eq('auth_uid', authUid)
      .single();

    if (mapError || !mapData) {
      console.error('[Notifications] Erreur mapping user:', mapError);
      return;
    }

    const userId = mapData.user_id;

    // 2. Mettre à jour la table Users avec le user_id (bigint)
    const { error } = await supabase
      .from('Users')
      .update({ 
        notification_token: token,
        notification_enabled: true
      })
      .eq('id', userId);

    if (error) {
      console.error('[Notifications] Erreur sauvegarde token:', error);
    } else {
      console.log('[Notifications] Token sauvegardé pour user_id:', userId);
    }
  } catch (error) {
    console.error('[Notifications] Erreur:', error);
  }
}

