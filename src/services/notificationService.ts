import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Configuration du comportement des notifications quand l'app est ouverte
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface NotificationToken {
  token: string;
  type: 'ios' | 'android';
}

/**
 * Demande la permission et récupère le token de notification
 */
export async function registerForPushNotifications(): Promise<NotificationToken | null> {
  try {
    // Vérifier que c'est un appareil physique (pas simulateur)
    if (!Device.isDevice) {
      console.log('[Notifications] Doit être testé sur un appareil physique');
      return null;
    }

    // Demander la permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission refusée');
      return null;
    }

    // Récupérer le token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    if (!projectId) {
      console.error('[Notifications] Project ID manquant dans app.json');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('[Notifications] Token obtenu:', tokenData.data);

    return {
      token: tokenData.data,
      type: Platform.OS === 'ios' ? 'ios' : 'android',
    };
  } catch (error) {
    console.error('[Notifications] Erreur:', error);
    return null;
  }
}

/**
 * Envoyer une notification locale (in-app)
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: any
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // Immédiat
  });
}

/**
 * Programmer une notification pour plus tard
 */
export async function scheduleNotification(
  title: string,
  body: string,
  triggerDate: Date,
  data?: any
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: triggerDate,
  });
}

/**
 * Annuler toutes les notifications programmées
 */
export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}