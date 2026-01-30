import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { sendLocalNotification } from '../services/notificationService';

export default function NotificationTestButton() {
  const testNotification = async () => {
    try {
      await sendLocalNotification(
        '🎉 Bravo !',
        'Vous avez complété le niveau 5 !',
        { level: 5, type: 'level_completed' }
      );
      
      Alert.alert('✅ Notification envoyée', 'Vérifiez vos notifications');
    } catch (error) {
      console.error('[Test] Erreur:', error);
      Alert.alert('❌ Erreur', 'Impossible d\'envoyer la notification');
    }
  };

  return (
    <TouchableOpacity 
      style={styles.button} 
      onPress={testNotification}
    >
      <Text style={styles.text}>🔔 Tester Notification</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginVertical: 10,
  },
  text: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});