// src/components/SubscriptionModal.tsx
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => Promise<void>;
}

const { width } = Dimensions.get('window');

export default function SubscriptionModal({
  visible,
  onClose,
  onSubscribe,
}: SubscriptionModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setIsLoading(true);
      await onSubscribe();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header avec icône */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <AntDesign name="lock1" size={40} color="#FFD93D" />
            </View>
          </View>

          {/* Titre */}
          <Text style={styles.title}>Période d'essai terminée</Text>

          {/* Message principal */}
          <Text style={styles.message}>
            Soutenez le projet et renforcez votre engagement, en vous abonnant à{' '}
            <Text style={styles.pixelText}>Pixel</Text>
          </Text>

          {/* Avantages */}
          <View style={styles.benefitsContainer}>
            <BenefitItem icon="check" text="Accès illimité à tous les niveaux" />
            <BenefitItem icon="check" text="Progression sauvegardée en cloud" />
            <BenefitItem icon="check" text="Statistiques détaillées" />
            <BenefitItem icon="check" text="Classements et défis" />
          </View>

          {/* Bouton principal */}
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={handleSubscribe}
            activeOpacity={0.9}
            disabled={isLoading}
          >
            <LinearGradient
              colors={['#FFD93D', '#FFC93D']}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <ActivityIndicator color="#0F0E20" />
              ) : (
                <Text style={styles.subscribeText}>Découvrir les offres 🚀</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Bouton fermer */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.7}
            disabled={isLoading}
          >
            <Text style={[styles.closeText, isLoading && { opacity: 0.5 }]}>
              Plus tard
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function BenefitItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.checkCircle}>
        <AntDesign name="check" size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 14, 32, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    width: width * 0.9,
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F0E20',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFD93D',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F0E20',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  pixelText: {
    fontWeight: '900',
    color: '#0F0E20',
  },
  benefitsContainer: {
    width: '100%',
    marginBottom: 28,
    gap: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2ECC71',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '600',
    flex: 1,
  },
  subscribeButton: {
    width: '100%',
    height: 54,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gradientButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscribeText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F0E20',
    letterSpacing: 0.3,
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  closeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9CA3AF',
  },
});