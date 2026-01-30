// src/screens/EntrainementScreen.tsx
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import Constants from "expo-constants";
import Purchases from "react-native-purchases";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../supabase";
import { theme } from "../theme";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { fetchWithSupabaseAuth } from "../api";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import SubscriptionModal from "../components/SubscriptionModal";

/** ---------- Types & route ---------- */
type Props = NativeStackScreenProps<RootStackParamList, "Entrainement">;
type EntrainementRoute = RouteProp<RootStackParamList, "Entrainement">;

type Position = {
  niveau: number;
  parcours_id: number;
  taux?: number;
  type_evolution?: string;
  date?: string;
  critere?: number;
  restantes?: number;
};

type Positions = {
  Addition?: Position | null;
  Soustraction?: Position | null;
  Multiplication?: Position | null;
  score_points?: number | null;
  score_global?: number | null;
};

/** ---------- Config ---------- */
const API_BASE: string =
  (Constants?.expoConfig?.extra?.API_BASE_URL as string) ||
  (Constants as any)?.manifest?.extra?.API_BASE_URL ||
  "";

const TRIAL_DAYS = 3;
const TRIAL_KEY = "pixel_trial_started_at";

/** ---------- Paywall guard ---------- */
async function hasActiveEntitlement(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    const active = info?.entitlements?.active ?? {};
    return Object.keys(active).length > 0;
  } catch {
    return false;
  }
}

/** Vrai si l'essai local (3 jours) est encore en cours */
async function isInLocalTrial(): Promise<boolean> {
  // 🚀 Mode développement : toujours actif
  if (__DEV__ || Constants.appOwnership === 'expo') {
    console.log('[Trial] Mode développement : essai infini activé');
    return true;
  }

  const nowMs = Date.now();
  const raw = await AsyncStorage.getItem(TRIAL_KEY);

  // Pas d'essai démarré → on le démarre maintenant
  if (!raw) {
    await AsyncStorage.setItem(TRIAL_KEY, String(nowMs));
    console.log('[Trial] 🆕 Nouveau démarrage essai');
    return true;
  }

  // Conversion en nombre
  let startedMs = Number(raw);
  if (!Number.isFinite(startedMs) || startedMs <= 0) {
    await AsyncStorage.setItem(TRIAL_KEY, String(nowMs));
    console.log('[Trial] 🔄 Réinitialisation (valeur invalide)');
    return true;
  }

  // Normaliser : si c'est en secondes, convertir en millisecondes
  if (startedMs < 1e12) {
    startedMs = startedMs * 1000;
    await AsyncStorage.setItem(TRIAL_KEY, String(startedMs));
    console.log('[Trial] 🔄 Conversion s → ms');
  }

  // Calcul des jours écoulés
  const elapsedMs = nowMs - startedMs;
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));
  const isActive = days < TRIAL_DAYS;
  
  console.log(`[Trial] ⏰ Jour ${days}/${TRIAL_DAYS} - Actif: ${isActive ? '✅' : '❌'}`);
  
  return isActive;
}

/** Autorise à jouer si essai actif OU abonnement actif */
async function canStartTraining(): Promise<boolean> {
  const trialActive = await isInLocalTrial();
  if (trialActive) {
    console.log('[Access] ✅ Autorisé (essai actif)');
    return true;
  }
  
  const hasSubscription = await hasActiveEntitlement();
  console.log(`[Access] ${hasSubscription ? '✅' : '❌'} ${hasSubscription ? 'Autorisé (abonnement)' : 'Refusé'}`);
  return hasSubscription;
}

/** ---------- Screen ---------- */
export default function EntrainementScreen({ navigation }: Props) {
  const route = useRoute<EntrainementRoute>();
  const [positions, setPositions] = useState<Positions | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [volume, setVolume] = useState<10 | 50 | 100>(10);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  useEffect(() => {
    console.log("[ROUTE] EntrainementScreen mounted as:", route.name);
  }, [route.name]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        const url = `${API_BASE}/parcours/positions_currentes?parcours_id=1`;

        const res = await fetchWithSupabaseAuth(url, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`HTTP ${res.status} ${txt}`);
        }

        const data = (await res.json()) as Positions;
        if (alive) setPositions(data);
      } catch (e: any) {
        if (alive) Alert.alert("Erreur", e?.message ?? "Impossible de charger les niveaux.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Au tap sur "CALCULEZ !" */
  const onStartPress = async () => {
    if (starting) return;
    setStarting(true);
    
    try {
      console.log('[Start] 🎯 Vérification accès...');
      const allowed = await canStartTraining();
      
      if (!allowed) {
        console.log('[Start] 🔒 Accès refusé → Affichage modal');
        setShowSubscriptionModal(true);
        setStarting(false);
        return;
      }

      console.log('[Start] ✅ Accès autorisé → Lancement entraînement');
      
      // Navigation vers Train
      const state = navigation.getState();
      const current = state.routes[state.index]?.name;
      if (current === "Train") {
        navigation.push("Train", { volume });
      } else {
        navigation.navigate("Train", { volume });
      }
    } catch (e: any) {
      console.error('[Start] ❌ Erreur:', e);
      Alert.alert("Oups", e?.message ?? "Action impossible pour le moment.");
    } finally {
      setStarting(false);
    }
  };

  /** Fonction pour ouvrir le paywall RevenueCat */
  const openPaywallDirect = async () => {
    try {
      console.log('[Paywall] 💳 Ouverture du paywall...');
      
      // Vérifier si on est dans Expo Go
      if (Constants.appOwnership === 'expo') {
        Alert.alert(
          "Expo Go détecté",
          "Les achats in-app ne fonctionnent pas dans Expo Go. Testez avec TestFlight ou un build de développement."
        );
        return;
      }

      // Récupérer la clé RevenueCat
      const extra: any = Constants?.expoConfig?.extra ?? {};
      const rcKey = extra?.EXPO_PUBLIC_RC_IOS_SDK_KEY || extra?.RC_API_KEY;
      
      if (!rcKey || !String(rcKey).startsWith('appl_')) {
        throw new Error('Clé RevenueCat iOS manquante ou invalide');
      }

      // Configurer RevenueCat
      await Purchases.configure({ apiKey: rcKey });
      
      // Récupérer les offerings
      const offerings: any = await Purchases.getOfferings();
      const current = offerings?.current;
      
      if (!current || !current.availablePackages?.length) {
        throw new Error('Aucune offre disponible. Vérifiez RevenueCat.');
      }

      // Trouver les packages mensuel et annuel
      const monthly = current.availablePackages.find((p: any) =>
        p?.identifier?.toLowerCase?.().includes('month')
      );
      const annual = current.availablePackages.find((p: any) =>
        p?.identifier?.toLowerCase?.().includes('annual') ||
        p?.identifier?.toLowerCase?.().includes('year')
      );

      if (!monthly && !annual) {
        throw new Error('Packages mensuel/annuel introuvables');
      }

      // Préparer les labels
      const monthlyLabel = monthly
        ? `${monthly.product?.priceString ?? '—'} · Mensuel`
        : null;
      
      const annualPrice = annual?.product?.price as number | undefined;
      const annualPerMonth = annualPrice ? (annualPrice / 12).toFixed(2) : null;
      const annualLabel = annual
        ? `${annual.product?.priceString ?? '—'} · Annuel${
            annualPerMonth ? ` (~${annualPerMonth}€/mois)` : ''
          }`
        : null;

      // Afficher l'Alert avec les options
      Alert.alert(
        'Choisir un abonnement',
        'Soutenez Pixel et continuez votre progression',
        [
          annual && {
            text: annualLabel!,
            onPress: async () => {
              try {
                console.log('[Paywall] Achat annuel...');
                await Purchases.purchasePackage(annual);
                Alert.alert('✅ Succès', 'Abonnement annuel activé !');
                setShowSubscriptionModal(false);
              } catch (e: any) {
                if (!e?.userCancelled) {
                  console.error('[Paywall] Erreur achat annuel:', e);
                  Alert.alert('Erreur', e?.message ?? 'Achat impossible.');
                }
              }
            },
          },
          monthly && {
            text: monthlyLabel!,
            onPress: async () => {
              try {
                console.log('[Paywall] Achat mensuel...');
                await Purchases.purchasePackage(monthly);
                Alert.alert('✅ Succès', 'Abonnement mensuel activé !');
                setShowSubscriptionModal(false);
              } catch (e: any) {
                if (!e?.userCancelled) {
                  console.error('[Paywall] Erreur achat mensuel:', e);
                  Alert.alert('Erreur', e?.message ?? 'Achat impossible.');
                }
              }
            },
          },
          { 
            text: 'Annuler', 
            style: 'cancel',
            onPress: () => console.log('[Paywall] Annulé')
          },
        ].filter(Boolean) as any
      );
    } catch (e: any) {
      console.error('[Paywall] Erreur globale:', e);
      Alert.alert('Erreur', e?.message ?? 'Paywall indisponible.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <PositionsTable positions={positions} loading={loading} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nombre d'opérations</Text>
          <View style={styles.volRow}>
            <VolPill value={100} active={volume === 100} onPress={() => setVolume(100)} />
            <VolPill value={50} active={volume === 50} onPress={() => setVolume(50)} />
            <VolPill value={10} active={volume === 10} onPress={() => setVolume(10)} />
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.cta, starting && { opacity: 0.6 }]}
          onPress={onStartPress}
          disabled={starting}
        >
          <Text style={styles.ctaText}>{starting ? "..." : "CALCULEZ !"}</Text>
        </TouchableOpacity>

        {/* Modal d'abonnement */}
        <SubscriptionModal
          visible={showSubscriptionModal}
          onClose={() => {
            console.log('[Modal] ❌ Fermé');
            setShowSubscriptionModal(false);
          }}
          onSubscribe={openPaywallDirect}
        />
      </View>
    </SafeAreaView>
  );
}

/** ---------- Sous-composants ---------- */
function PositionsTable({
  positions,
  loading,
}: {
  positions: Positions | null;
  loading: boolean;
}) {
  const scorePoints =
    typeof positions?.score_points === "number" ? positions!.score_points! : null;

  const evolutions = [
    positions?.Addition?.type_evolution,
    positions?.Soustraction?.type_evolution,
    positions?.Multiplication?.type_evolution,
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());

  const hasUp = evolutions.includes("progression");
  const hasDown = evolutions.includes("régression") || evolutions.includes("regression");
  const trend: "up" | "down" | "flat" = hasUp ? "up" : hasDown ? "down" : "flat";

  return (
    <View style={styles.tableCard}>
      <View style={styles.tableHeaderRow}>
        <Text style={[styles.th, styles.thLeft]}>OPÉRATIONS</Text>
        <Text style={styles.th}>NIVEAU</Text>
        <Text style={[styles.th, styles.thRight]}>SCORE</Text>
      </View>

      {loading ? (
        <View style={{ padding: 16 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.tableBodyRow}>
          <View style={styles.leftBlock}>
            <TableLine op="Addition" pos={positions?.Addition} />
            <View style={styles.rowDivider} />
            <TableLine op="Soustraction" pos={positions?.Soustraction} />
            <View style={styles.rowDivider} />
            <TableLine op="Multiplication" pos={positions?.Multiplication} />
          </View>

          <View style={styles.rightBlock}>
            <View style={[styles.scorePanel, { paddingHorizontal: 14, minWidth: 110 }]}>
              <Text style={[styles.scoreBig, { marginRight: 0 }]}>
                {scorePoints !== null ? scorePoints.toLocaleString("fr-FR") : "--"}
              </Text>
            </View>
            <View
              style={[
                styles.trendBadge,
                trend === "up"
                  ? { backgroundColor: "#2ecc71" }
                  : trend === "down"
                  ? { backgroundColor: "#e74c3c" }
                  : { backgroundColor: "#9CA3AF" },
              ]}
            >
              {trend === "up" && <AntDesign name="arrowup" size={18} color="#fff" />}
              {trend === "down" && <AntDesign name="arrowdown" size={18} color="#fff" />}
              {trend === "flat" && <AntDesign name="minus" size={18} color="#fff" />}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function TableLine({ op, pos }: { op: string; pos?: Position | null }) {
  return (
    <View style={styles.bodyRow}>
      <View style={styles.cellLeft}>
        <Text style={styles.opLabel} numberOfLines={1}>
          {op}
        </Text>
      </View>

      <View style={styles.cellMid}>
        <Text style={styles.levelCell}>Niv {pos?.niveau ?? "--"}</Text>
        {typeof pos?.restantes === "number" && (
          <Text style={styles.subLevelCell}>N-{pos!.restantes}</Text>
        )}
      </View>
    </View>
  );
}

function VolPill({
  value,
  active,
  onPress,
}: {
  value: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.volPill,
        {
          backgroundColor: active ? COLORS.blue : "#E6E6E6",
          borderColor: active ? COLORS.blueDark : "#d1d5db",
        },
      ]}
    >
      <Text style={[styles.volText, { color: active ? COLORS.blueDark : COLORS.subtext }]}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

/** ---------- Styles ---------- */
const COLORS = {
  bg: theme?.colors?.bg ?? "#0F0E20",
  text: theme?.colors?.text ?? "#F5F7FB",
  subtext: theme?.colors?.subtext ?? "#9CA3AF",
  card: "#FFFFFF",
  purple: "#D36AD6",
  blue: "#CBE0FF",
  blueDark: "#0F0E20",
  orange: "#FFD93D",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "900", color: COLORS.text, textAlign: "center" },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: COLORS.blueDark,
  },
  cardTitle: { color: COLORS.blueDark, fontWeight: "800", marginBottom: 10, fontSize: 16 },

  tableCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.blueDark,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.blue,
    borderBottomWidth: 2,
    borderColor: COLORS.blueDark,
  },
  th: {
    flex: 1,
    textAlign: "center",
    color: COLORS.blueDark,
    fontWeight: "900",
    fontSize: 12,
    paddingVertical: 10,
  },
  thLeft: { flex: 1.4, textAlign: "left", paddingLeft: 14 },
  thRight: { textAlign: "center" },

  tableBodyRow: { flexDirection: "row" },
  leftBlock: { flex: 1.8, borderRightWidth: 2, borderColor: COLORS.blueDark },
  rightBlock: { flex: 1, alignItems: "center", justifyContent: "space-evenly", paddingVertical: 12 },

  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowDivider: { height: 1.5, backgroundColor: "#D1D5DB" },

  cellLeft: { flex: 1.2, justifyContent: "center" },
  cellMid: {
    width: 110,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1.5,
    borderColor: "#D1D5DB",
  },

  opLabel: { color: COLORS.blueDark, fontWeight: "700" },
  levelCell: { color: COLORS.blueDark, fontWeight: "900", fontSize: 16 },
  levelSub: { fontSize: 11, color: COLORS.subtext, marginTop: 2, fontWeight: "600" },

  scorePanel: {
    minWidth: 88,
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: COLORS.blueDark,
    backgroundColor: "#F7F7F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreBig: { fontSize: 22, fontWeight: "900", color: COLORS.blueDark },

  subLevelCell: { fontSize: 11, fontWeight: "600", color: COLORS.subtext, marginTop: 2 },

  trendBadge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  volRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 8 },
  volPill: { flex: 1, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  volText: { fontWeight: "800", fontSize: 16 },

  cta: {
    height: 50,
    borderRadius: 999,
    backgroundColor: COLORS.orange,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  ctaText: { color: "#0F0E20", fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },
});