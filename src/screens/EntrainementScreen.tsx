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
function getTauxColor(taux: number): string {
  if (taux >= 95) return "#00B894";
  if (taux >= 70) return "#FFD93D";
  if (taux >= 50) return "#FFA94D";
  return "#FF6B6B";
}

function TrendIcon({ evolution }: { evolution?: string }) {
  const ev = (evolution ?? "").toLowerCase();
  if (ev === "progression") {
    return <AntDesign name="arrowup" size={16} color="#00B894" style={{ marginLeft: 6 }} />;
  }
  if (ev === "régression" || ev === "regression") {
    return <AntDesign name="arrowdown" size={16} color="#FF6B6B" style={{ marginLeft: 6 }} />;
  }
  if (ev === "stagnation") {
    return <AntDesign name="minus" size={16} color="#9CA3AF" style={{ marginLeft: 6 }} />;
  }
  return null;
}

function OperationCard({ operation, pos }: { operation: string; pos?: Position | null }) {
  if (!pos) return null;

  const taux = typeof pos.taux === "number" ? Math.round(pos.taux * 100) : 0;
  const restantes = pos.restantes ?? 0;

  return (
    <View style={styles.operationCard}>
      <View style={styles.cardHeader}>
        <View style={styles.operationNameRow}>
          <Text style={styles.operationName}>{operation}</Text>
          <TrendIcon evolution={pos.type_evolution} />
        </View>
        <Text style={styles.niveau}>Niv {pos.niveau ?? "--"}</Text>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>📊 Taux de réussite</Text>
          <Text style={[styles.statValue, { color: getTauxColor(taux) }]}>
            {taux}%
          </Text>
        </View>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>⏳ Prochaine évolution</Text>
          <Text style={styles.statValue}>
            {restantes > 0 ? `dans ${restantes} ops` : "prêt !"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function PositionsTable({
  positions,
  loading,
}: {
  positions: Positions | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.operationsContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.operationsContainer}>
      <OperationCard operation="Addition" pos={positions?.Addition} />
      <OperationCard operation="Soustraction" pos={positions?.Soustraction} />
      <OperationCard operation="Multiplication" pos={positions?.Multiplication} />
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

  // --- Cartes opérations ---
  operationsContainer: {
    gap: 12,
  },
  operationCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  operationNameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  operationName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1A1F3A",
  },
  niveau: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6C5CE7",
  },
  cardStats: {
    gap: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 14,
    color: "rgba(0, 0, 0, 0.6)",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1F3A",
  },

  // --- Volume pills ---
  volRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 8 },
  volPill: { flex: 1, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  volText: { fontWeight: "800", fontSize: 16 },

  // --- CTA ---
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