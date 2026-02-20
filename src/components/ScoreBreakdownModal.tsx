import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Modal, StyleSheet, Animated, TouchableOpacity } from 'react-native';

interface ScoreBreakdownModalProps {
  visible: boolean;
  onClose: () => void;
  scoreBase: number;
  bonusVitesse: number;
  bonusPrecision: number;
  scoreTotal: number;
}

export default function ScoreBreakdownModal({
  visible,
  onClose,
  scoreBase,
  bonusVitesse,
  bonusPrecision,
  scoreTotal,
}: ScoreBreakdownModalProps) {
  const line1Opacity = useRef(new Animated.Value(0)).current;
  const line2Opacity = useRef(new Animated.Value(0)).current;
  const line3Opacity = useRef(new Animated.Value(0)).current;
  const totalOpacity = useRef(new Animated.Value(0)).current;
  const [countedTotal, setCountedTotal] = useState(0);

  useEffect(() => {
    if (!visible) {
      // Reset animations when hidden
      line1Opacity.setValue(0);
      line2Opacity.setValue(0);
      line3Opacity.setValue(0);
      totalOpacity.setValue(0);
      setCountedTotal(0);
      return;
    }

    // Animation séquentielle des lignes
    Animated.sequence([
      Animated.timing(line1Opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(line2Opacity, {
        toValue: 1,
        duration: 300,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(line3Opacity, {
        toValue: 1,
        duration: 300,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(totalOpacity, {
        toValue: 1,
        duration: 500,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Compteur animé pour le total
    const counterTimeout = setTimeout(() => {
      const duration = 800;
      const steps = 30;
      const increment = scoreTotal / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (
          (increment >= 0 && current >= scoreTotal) ||
          (increment < 0 && current <= scoreTotal)
        ) {
          setCountedTotal(scoreTotal);
          clearInterval(timer);
        } else {
          setCountedTotal(Math.round(current));
        }
      }, duration / steps);
    }, 1600);

    return () => {
      clearTimeout(counterTimeout);
    };
  }, [visible]);

  const getColor = (value: number) => {
    if (value > 0) return '#00B894';
    if (value < 0) return '#FF6B6B';
    return '#E0E0E0';
  };

  const formatValue = (value: number) =>
    `${value > 0 ? '+' : ''}${value}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Ligne 1 : Score de base */}
          <Animated.View style={[styles.row, { opacity: line1Opacity }]}>
            <Text style={styles.label}>Score de base</Text>
            <Text style={[styles.value, { color: getColor(scoreBase) }]}>
              {formatValue(scoreBase)}
            </Text>
          </Animated.View>

          {/* Ligne 2 : Bonus vitesse */}
          <Animated.View style={[styles.row, { opacity: line2Opacity }]}>
            <Text style={styles.label}>Bonus vitesse  &#x26A1;</Text>
            <Text style={[styles.value, { color: getColor(bonusVitesse) }]}>
              {formatValue(bonusVitesse)}
            </Text>
          </Animated.View>

          {/* Ligne 3 : Bonus précision */}
          <Animated.View style={[styles.row, { opacity: line3Opacity }]}>
            <Text style={styles.label}>Bonus pr&#xe9;cision  &#x1F3AF;</Text>
            <Text style={[styles.value, { color: getColor(bonusPrecision) }]}>
              {formatValue(bonusPrecision)}
            </Text>
          </Animated.View>

          {/* Séparateur */}
          <View style={styles.divider} />

          {/* Total animé */}
          <Animated.View style={[styles.totalRow, { opacity: totalOpacity }]}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={[styles.totalValue, { color: getColor(scoreTotal) }]}>
              {formatValue(countedTotal)} Pixels
            </Text>
          </Animated.View>

          {/* Bouton Continuer */}
          <Animated.View style={[styles.buttonContainer, { opacity: totalOpacity }]}>
            <TouchableOpacity
              style={styles.button}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Continuer</Text>
            </TouchableOpacity>
          </Animated.View>
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
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.3)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  value: {
    fontSize: 20,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  totalValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  buttonContainer: {
    marginTop: 24,
  },
  button: {
    backgroundColor: '#FFA94D',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1F3A',
  },
});
