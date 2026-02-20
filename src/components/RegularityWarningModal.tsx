import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';

interface RegularityWarningModalProps {
  visible: boolean;
  onClose: () => void;
  joursInactif: number;
  malus: number;
}

export default function RegularityWarningModal({
  visible,
  onClose,
  joursInactif,
  malus,
}: RegularityWarningModalProps) {
  const getMessage = () => {
    if (joursInactif === 1) return "Tu n'as pas joué hier";
    if (joursInactif <= 7) return `${joursInactif} jours sans entraînement`;
    if (joursInactif <= 21) return `${joursInactif} jours d'absence...`;
    return `${joursInactif} jours sans jouer !`;
  };

  const getEmoji = () => {
    if (joursInactif <= 3) return '😅';
    if (joursInactif <= 7) return '😔';
    if (joursInactif <= 14) return '😰';
    return '😱';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.emoji}>{getEmoji()}</Text>

          <Text style={styles.title}>{getMessage()}</Text>

          <Text style={styles.message}>
            Tu as perdu <Text style={styles.malusValue}>-{malus} Pixels</Text> de régularité.
          </Text>

          <Text style={styles.encouragement}>
            Reviens t'entraîner pour progresser ! 💪
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>C'est compris</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1A1F3A',
    borderRadius: 20,
    padding: 32,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 107, 107, 0.3)',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 8,
  },
  malusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  encouragement: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#FFA94D',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1F3A',
  },
});
