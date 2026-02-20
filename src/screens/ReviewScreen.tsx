// src/screens/ReviewScreen.tsx
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { theme } from "../theme";
import { getLastReviewItems, verifyReview, recordCorrection } from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "Review">;

type ReviewItemLoaded = {
  id: number;
  Operation?: "Addition" | "Soustraction" | "Multiplication";
  Type?: "Addition" | "Soustraction" | "Multiplication";
  Operateur_Un: number;
  Operateur_Deux: number;
  Proposition?: number | null;
  Solution?: number | null;
  Temps_Seconds?: number | null;
  Marge_Erreur?: number | null;
};

/* =========================================================================
   Helpers
   ========================================================================= */
const opSymbol = (op: string): string => {
  const o = (op ?? "").toLowerCase();
  if (o.startsWith("add")) return "+";
  if (o.startsWith("sou") || o.startsWith("sub")) return "-";
  if (o.startsWith("mul")) return "×";
  return "?";
};

/* =========================================================================
   Screen
   ========================================================================= */
export default function ReviewScreen({ route, navigation }: Props) {
  const { entrainementId, mistakes } = route.params;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ReviewItemLoaded[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wrongSet, setWrongSet] = useState<Set<number>>(new Set());
  const [correctSet, setCorrectSet] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const res = await getLastReviewItems(entrainementId);
        const arr: ReviewItemLoaded[] = Array.isArray(res?.items) ? res.items : [];
        setItems(arr);

        const init: Record<number, string> = {};
        for (const it of arr) init[it.id] = "";
        setAnswers(init);
      } catch (e: any) {
        setErrorMsg(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [entrainementId]);

  const onChangeAns = useCallback((id: number, txt: string) => {
    setAnswers((prev) => ({ ...prev, [id]: txt }));
    setWrongSet((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleValidateAndMark = useCallback(async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);

      const tries = items.map((it) => {
        const v = Number(answers[it.id]);
        return { id: it.id, reponse: Number.isFinite(v) ? v : NaN };
      });

      const hasEmpty = tries.some((t) => !Number.isFinite(t.reponse));
      if (hasEmpty) {
        Alert.alert("Reponses incompletes", "Merci de saisir une reponse pour chaque operation.");
        return;
      }

      const res = await verifyReview(entrainementId, tries);

      let wrongIds: number[] = [];
      if (Array.isArray((res as any)?.wrong_ids)) {
        wrongIds = (res as any).wrong_ids.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n));
      }
      if (wrongIds.length === 0 && Array.isArray((res as any)?.incorrect_sample)) {
        wrongIds = (res as any).incorrect_sample
          .map((x: any) => Number(x?.id))
          .filter((n: any) => Number.isFinite(n));
      }
      if (wrongIds.length === 0 && Array.isArray((res as any)?.missing_ids)) {
        wrongIds = (res as any).missing_ids.map((x: any) => Number(x)).filter((n: any) => Number.isFinite(n));
      }

      const incorrectCount = Number((res as any)?.incorrect ?? 0);
      const missingCount = Number((res as any)?.missing ?? 0);
      if (wrongIds.length === 0 && (incorrectCount > 0 || missingCount > 0)) {
        wrongIds = items.map((it) => it.id);
      }

      // Mark correct items
      const wrongSetNew = new Set(wrongIds);
      const correctIds = items.filter((it) => !wrongSetNew.has(it.id)).map((it) => it.id);
      setCorrectSet(new Set(correctIds));

      if (wrongIds.length === 0) {
        try {
          const r = await recordCorrection(entrainementId);
          const attempt = r?.attempt ?? r?.Tentative ?? 1;
          Alert.alert(
            "Bravo 🎉",
            `Toutes les erreurs ont ete corrigees.\nTentative de correction n°${attempt}.`,
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
        } catch (e: any) {
          Alert.alert(
            "Corrige",
            `Erreurs corrigees, mais l'enregistrement a echoue: ${e?.message ?? e}`,
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
        }
        return;
      }

      setWrongSet(wrongSetNew);
      Alert.alert(
        "Encore des erreurs",
        `${wrongIds.length} reponse${wrongIds.length > 1 ? "s" : ""} incorrecte${wrongIds.length > 1 ? "s" : ""}. Corrige-les pour valider.`
      );
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }, [items, answers, entrainementId, navigation]);

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={s.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Try to match items with mistakes from route params for extra info
  const getMistakeInfo = (it: ReviewItemLoaded) => {
    if (!mistakes) return null;
    return mistakes.find(
      (m) =>
        m.operateurUn === it.Operateur_Un &&
        m.operateurDeux === it.Operateur_Deux
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Correction des erreurs</Text>
          <Text style={s.headerSubtitle}>
            {items.length} erreur{items.length > 1 ? "s" : ""} a corriger
          </Text>
        </View>

        {/* Error cards */}
        {items.map((it, idx) => {
          const opName = it.Operation || it.Type || "Addition";
          const symbol = opSymbol(opName);
          const expression = `${it.Operateur_Un} ${symbol} ${it.Operateur_Deux}`;
          const isWrong = wrongSet.has(it.id);
          const isCorrectItem = correctSet.has(it.id);
          const mistakeInfo = getMistakeInfo(it);

          const borderColor = isCorrectItem
            ? C.green
            : isWrong
            ? C.red
            : C.border;

          return (
            <View key={it.id} style={[s.card, { borderColor }]}>
              {/* Card header */}
              <View style={s.cardHeader}>
                <View style={s.typeBadge}>
                  <Text style={s.typeBadgeText}>{opName}</Text>
                </View>
                <Text style={s.cardIndex}>
                  {isCorrectItem ? "✅" : `${idx + 1}/${items.length}`}
                </Text>
              </View>

              {/* Expression */}
              <Text style={s.expression}>{expression} = ?</Text>

              {/* Input */}
              <TextInput
                value={answers[it.id]}
                onChangeText={(t) => onChangeAns(it.id, t)}
                keyboardType="numeric"
                placeholder="Ta correction"
                placeholderTextColor={C.subtext}
                returnKeyType="done"
                editable={!isCorrectItem}
                style={[
                  s.input,
                  {
                    borderColor: isCorrectItem
                      ? C.green
                      : isWrong
                      ? C.red
                      : C.border,
                    opacity: isCorrectItem ? 0.6 : 1,
                  },
                ]}
              />

              {/* Info row: first answer + correct answer + margin + time */}
              {(isWrong || isCorrectItem) && mistakeInfo && (
                <View style={s.infoBlock}>
                  <View style={s.infoRow}>
                    <Text style={s.infoIcon}>❌</Text>
                    <Text style={s.infoLabel}>Ta premiere reponse</Text>
                    <Text style={[s.infoValue, { color: C.red }]}>
                      {mistakeInfo.userAnswer}
                    </Text>
                  </View>
                  <View style={s.infoRow}>
                    <Text style={s.infoIcon}>✅</Text>
                    <Text style={s.infoLabel}>Bonne reponse</Text>
                    <Text style={[s.infoValue, { color: C.green }]}>
                      {mistakeInfo.expected}
                    </Text>
                  </View>
                  <View style={s.infoRow}>
                    <Text style={s.infoIcon}>📊</Text>
                    <Text style={s.infoLabel}>Marge d'erreur</Text>
                    <Text style={[s.infoValue, { color: C.subtext }]}>
                      {mistakeInfo.expected !== 0
                        ? `${((mistakeInfo.userAnswer - mistakeInfo.expected) >= 0 ? "+" : "")}${mistakeInfo.userAnswer - mistakeInfo.expected} (${Math.abs(((mistakeInfo.userAnswer - mistakeInfo.expected) / mistakeInfo.expected) * 100).toFixed(1)}%)`
                        : "–"}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}

        {/* Validate button */}
        <TouchableOpacity
          onPress={handleValidateAndMark}
          disabled={submitting || items.length === 0}
          activeOpacity={0.85}
          style={[s.validateBtn, (submitting || items.length === 0) && { opacity: 0.5 }]}
        >
          <Text style={s.validateBtnText}>
            {submitting ? "Verification..." : "Valider les corrections"}
          </Text>
        </TouchableOpacity>

        {/* Spacer for keyboard */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* =========================================================================
   Styles
   ========================================================================= */
const C = {
  bg: "#0B0C1A",
  card: "#0F0E20",
  border: "#2A2940",
  text: "#E8EAF6",
  subtext: "#8892a4",
  red: "#FF4D4D",
  green: "#4ADE80",
  accent: "#FFD93D",
  purple: "rgba(122,90,248,0.28)",
  purpleBorder: "rgba(122,90,248,0.4)",
};

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
    gap: 12,
  },
  loadingText: {
    color: C.subtext,
    fontSize: 15,
  },

  scroll: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },

  /* Header */
  header: {
    marginBottom: 4,
  },
  headerTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "900",
  },
  headerSubtitle: {
    color: C.subtext,
    fontSize: 14,
    marginTop: 4,
  },

  /* Card */
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.purple,
    borderWidth: 1,
    borderColor: C.purpleBorder,
  },
  typeBadgeText: {
    color: C.text,
    fontSize: 13,
    fontWeight: "800",
  },
  cardIndex: {
    color: C.subtext,
    fontSize: 13,
    fontWeight: "700",
  },

  /* Expression */
  expression: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 1,
  },

  /* Input */
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  /* Info block */
  infoBlock: {
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoIcon: {
    fontSize: 14,
    width: 22,
  },
  infoLabel: {
    color: C.subtext,
    fontSize: 14,
    flex: 1,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "800",
  },

  /* Error */
  errorText: {
    color: C.red,
    fontSize: 14,
    textAlign: "center",
  },

  /* Validate button */
  validateBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: "#FFB86B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  validateBtnText: {
    color: "#171717",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.2,
  },
});
