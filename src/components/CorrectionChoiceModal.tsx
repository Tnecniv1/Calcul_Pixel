// src/components/CorrectionChoiceModal.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from "react-native";

type Props = {
  visible: boolean;
  errorCount: number;
  onSkip: () => void;
  onCorrect: () => void;
};

export default function CorrectionChoiceModal({
  visible,
  errorCount,
  onSkip,
  onCorrect,
}: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onSkip}>
      <View style={s.overlay}>
        <View style={s.modal}>
          {/* Icon */}
          <Text style={s.icon}>📝</Text>

          {/* Title */}
          <Text style={s.title}>
            Tu as fait {errorCount} erreur{errorCount > 1 ? "s" : ""}
          </Text>

          {/* Subtitle */}
          <Text style={s.subtitle}>
            Veux-tu les corriger maintenant ?
          </Text>

          {/* Buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity onPress={onSkip} style={s.btnSkip} activeOpacity={0.8}>
              <Text style={s.btnSkipText}>Passer</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onCorrect} style={s.btnCorrect} activeOpacity={0.8}>
              <Text style={s.btnCorrectText}>Corriger</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modal: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "rgba(26,27,43,0.98)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#27283A",
    padding: 28,
    alignItems: "center",
  },
  icon: {
    fontSize: 40,
    marginBottom: 12,
  },
  title: {
    color: "#E8EAF6",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#8892a4",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  btnSkip: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#27283A",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSkipText: {
    color: "#8892a4",
    fontWeight: "800",
    fontSize: 15,
  },
  btnCorrect: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    backgroundColor: "#FFB86B",
    alignItems: "center",
    justifyContent: "center",
  },
  btnCorrectText: {
    color: "#171717",
    fontWeight: "900",
    fontSize: 15,
  },
});
