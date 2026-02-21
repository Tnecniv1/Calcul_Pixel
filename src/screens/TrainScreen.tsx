import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Button,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import Timer from "../components/Timer";
import Calculator from "../components/Calculator";
import { theme } from "../theme";
import { useAuth } from "../auth";
import {
  startEntrainementMixte,
  genererExercicesMixte,
  postObservationsBatch,
  type ObservationIn,
} from "../api";

const { width: W, height: H } = Dimensions.get("window");

// Layout
const PAD_W = Math.min(W * 0.8, 350);
const PAD_H_MAX = Math.round(H * 0.52);

export default function TrainScreen(props: any) {
  const volume: number = props?.route?.params?.volume ?? 30;

  const navigation = props?.navigation;
  const { authUid } = useAuth();

  const [state, setState] = useState<"loading" | "ready" | "posting">("loading");
  const [entrainementId, setEntrainementId] = useState<number | null>(null);
  const entrainementIdRef = useRef<number | null>(null);
  const [exos, setExos] = useState<any[]>([]);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const startRef = useRef<number>(Date.now());
  const nextTick = () => (startRef.current = Date.now());

  const obsBuf = useRef<ObservationIn[]>([]);
  const mistakesRef = useRef<
    {
      operation: string;
      type: string;
      parcoursId: number;
      expected: number;
      userAnswer: number;
      operateurUn: number;
      operateurDeux: number;
    }[]
  >([]);


  // INIT
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setState("loading");

        if (!authUid) {
          setErr("Vous n'êtes pas connecté.");
          setState("ready");
          return;
        }

        const start = await startEntrainementMixte(volume);
        const eid = start?.entrainement_id ?? null;
        entrainementIdRef.current = eid;
        setEntrainementId(eid);

        const g = await genererExercicesMixte(volume);
        setExos(Array.isArray(g?.exercices) ? g.exercices : []);
        nextTick();
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setState("ready");
      }
    })();
  }, [volume, authUid]);

  // VALIDATE
  const validate = useCallback(() => {
    const cur = exos[i];
    const eid = entrainementIdRef.current;

    if (!cur) return;
    if (eid == null) {
      setErr("Identifiant d'entraînement indisponible. Réessaie.");
      return;
    }

    const elapsed = Math.max(0, Math.round((Date.now() - startRef.current) / 1000));
    const repNum = Number(answer);
    const rep = Number.isFinite(repNum) ? repNum : NaN;

    const solApi: number | undefined = (cur as any).Solution;
    const expected =
      solApi != null
        ? Number(solApi)
        : cur.Type === "Addition"
        ? Number(cur.Operateur_Un) + Number(cur.Operateur_Deux)
        : cur.Type === "Soustraction"
        ? Number(cur.Operateur_Un) - Number(cur.Operateur_Deux)
        : Number(cur.Operateur_Un) * Number(cur.Operateur_Deux);

    const correct = Number.isFinite(rep) && Number.isFinite(expected) && rep === expected;

    obsBuf.current.push({
      Entrainement_Id: eid,
      Parcours_Id: cur.Parcours_Id,
      Operateur_Un: cur.Operateur_Un,
      Operateur_Deux: cur.Operateur_Deux,
      Operation: cur.Type,
      Proposition: Number.isFinite(rep) ? rep : 0,
      Temps_Seconds: elapsed,
      Correction: "NON",
    });

    if (correct) setScore((s) => s + 1);
    else {
      mistakesRef.current.push({
        operation: cur.Operation,
        type: cur.Type,
        parcoursId: cur.Parcours_Id,
        expected,
        userAnswer: Number.isFinite(rep) ? rep : NaN,
        operateurUn: cur.Operateur_Un,
        operateurDeux: cur.Operateur_Deux,
      });
    }

    setAnswer("");

    if (i + 1 < exos.length) {
      setI((k) => k + 1);
      nextTick();
    } else {
      // Fin de session : post et redirection directe vers ResultScreen
      (async () => {
        try {
          setState("posting");
          await postObservationsBatch(obsBuf.current);

          // Navigation SEULEMENT si POST réussi
          setState("ready");
          navigation?.replace("Result", {
            type: "Addition",
            entrainementId: entrainementIdRef.current!,
            parcoursId: exos[0]?.Parcours_Id || 0,
            score: score + (correct ? 1 : 0),
            total: exos.length,
            mistakes: mistakesRef.current,
          });
        } catch (e: any) {
          setErr(`Erreur envoi résultats: ${e?.message ?? e}`);
          setState("ready");
          // Pas de navigation si erreur
        }
      })();
    }
  }, [i, exos, answer, score, navigation]);


  // UI
  const current = exos[i];

  if (state === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>Préparation de la session…</Text>
      </View>
    );
  }

  if (!exos.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Aucun exercice chargé.</Text>
        {err && <Text style={styles.errorText}>{err}</Text>}
        <Button title="Revenir" onPress={() => navigation?.goBack?.()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.modeTitle}>Mixte — {i + 1}/{exos.length}</Text>
        <Timer keySeed={i} />
      </View>

      {/* Cadre opération */}
      <View style={styles.operationBox}>
        <Text style={styles.operationType}>{current?.Type}</Text>
        <Text style={styles.operationText}>{current?.Operation}</Text>
      </View>

      {/* Pavé calculatrice */}
      <View style={[styles.padWrapper, { width: PAD_W, maxHeight: PAD_H_MAX, marginTop: 24 }]}>
        <Calculator
          style={{ width: "100%", height: "100%", gap: 24 }}
          value={answer}
          onChangeText={setAnswer}
          onSubmit={validate}
          disabled={state === "posting"}
          currentIndex={i}
          destabilizeEnabled={true}
          hideChance={0.05}
          hideRange={{ min: 1, max: 5 }}
          shuffleChance={0.1}
          shuffleRange={{ min: 1, max: 3 }}
          verticalBias={0.85}
        />
      </View>

      {err && <Text style={styles.errorText}>{err}</Text>}

      {/* Overlay de chargement */}
      {state === "posting" && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingEmoji}>⏳</Text>
            <Text style={styles.postingText}>Deux petites secondes...</Text>
            <Text style={styles.postingSubtext}>Je calcule vos résultats</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 16,
    backgroundColor: theme.colors.bg,
    paddingBottom: 20,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bg,
  },
  loadingText: { color: theme.colors.text, marginTop: 8 },
  empty: { flex: 1, padding: 16, gap: 8, backgroundColor: theme.colors.bg },
  emptyText: { color: theme.colors.text },
  errorText: { color: theme.colors.danger, marginTop: 6 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modeTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },

  operationBox: {
    alignSelf: "center",
    width: Math.min(W * 0.92, 560),
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 16,
    minHeight: 120,
  },
  operationType: {
    position: "absolute",
    top: 6,
    left: 0,
    right: 0,
    textAlign: "center",
    color: theme.colors.secondary,
    fontSize: 13,
    opacity: 0.85,
  },
  operationText: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 40,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },

  padWrapper: {
    alignSelf: "center",
    borderRadius: 12,
    overflow: "hidden",
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  loadingCard: {
    backgroundColor: '#1A1F3A',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minWidth: 280,
  },
  loadingEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  postingText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  postingSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
});
