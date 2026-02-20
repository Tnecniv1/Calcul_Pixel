import * as React from "react";
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import BigPixel from "../components/BigPixel";
import { getPixelState } from "../api";
import { useLayoutEffect } from "react";
import NotificationTestButton from '../components/NotificationTestButton';
import RegularityWarningModal from '../components/RegularityWarningModal';
import { useAuth } from "../auth";
import { useUnreadMessages } from "../hooks/useUnreadMessages";

// Calculer la taille du pixel en fonction de l'ecran
const SCREEN_WIDTH = Dimensions.get("window").width;
const PIXEL_SIZE = Math.min(SCREEN_WIDTH - 40, 280); // Max 280px, avec marges

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

// ─── Système de niveaux ────────────────────────────────────────────
const LEVELS = [
  { size: 50,  capacity: 2500,  color: "#6C5CE7", name: "Violet" },
  { size: 60,  capacity: 3600,  color: "#FFD93D", name: "Jaune" },
  { size: 70,  capacity: 4900,  color: "#4DB7FF", name: "Bleu" },
  { size: 80,  capacity: 6400,  color: "#00D084", name: "Émeraude" },
  { size: 90,  capacity: 8100,  color: "#FF6B35", name: "Orange" },
  { size: 98,  capacity: 9604,  color: "#FF006E", name: "Rose" },
  { size: 105, capacity: 11025, color: "#00F5FF", name: "Cyan" },
  { size: 112, capacity: 12544, color: "#EF233C", name: "Rouge" },
  { size: 118, capacity: 13924, color: "#D90368", name: "Magenta" },
  { size: 123, capacity: 15129, color: "#8AFF8A", name: "Vert Clair" },
  { size: 86,  capacity: 7396,  color: "#FB5607", name: "Corail" },
  { size: 70,  capacity: 4900,  color: "#1A1F3A", name: "Noir" },
];

const LEVEL_THRESHOLDS = LEVELS.reduce((acc, level, idx) => {
  acc.push((acc[idx - 1] ?? 0) + level.capacity);
  return acc;
}, [] as number[]);

function getLevelInfo(totalScore: number) {
  console.log('🔢 [getLevelInfo] Input:', totalScore);
  console.log('🔢 [getLevelInfo] LEVEL_THRESHOLDS:', LEVEL_THRESHOLDS);

  const cappedScore = Math.min(totalScore, 100000);
  console.log('🔢 [getLevelInfo] Capped:', cappedScore);

  let currentLevel = LEVELS.length - 1;
  let scoreInLevel = LEVELS[currentLevel].capacity;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (cappedScore < LEVEL_THRESHOLDS[i]) {
      currentLevel = i;
      scoreInLevel = cappedScore - (LEVEL_THRESHOLDS[i - 1] ?? 0);
      break;
    }
  }

  const level = LEVELS[currentLevel];
  const progress = scoreInLevel / level.capacity;

  const result = {
    levelNumber: currentLevel + 1,
    levelName: level.name,
    color: level.color,
    gridSize: level.size,
    capacity: level.capacity,
    pixelsLit: Math.floor(progress * level.capacity),
    progress,
    scoreInLevel,
    nextLevelAt: LEVEL_THRESHOLDS[currentLevel],
    totalScore: cappedScore,
  };

  console.log('🔢 [getLevelInfo] Output:', result);
  return result;
}

const COLORS = {
  bg: "#18162A",
  text: "#ffffffff",
  subtext: "#9a9ca1ff",
  orange: "#FFD93D",
  orangeText: "#171717",
  blue: "#4DB7FF",
  blueText: "#11283F",
  purple: "#B88BEB",
  purpleText: "#1A1025",
  card: "#FFFFFF",
  shadow: "rgba(0,0,0,0.08)",
};

export default function HomeScreen({ navigation }: Props) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Profile")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#4DB7FF",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>P</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("Badges")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#FFD93D",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16 }}>🏆</Text>
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("Info")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#b648c0ff",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 10,
          }}
        >
          <Text style={{ fontWeight: "600", color: "#000" }}>i</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const { authUid } = useAuth();
  const { unreadCount } = useUnreadMessages(authUid);

  const [pixel, setPixel] = React.useState<{ lit: number; capacity: number; ratio: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [levelInfo, setLevelInfo] = React.useState<ReturnType<typeof getLevelInfo> | null>(null);
  const [showRegularityWarning, setShowRegularityWarning] = React.useState(false);
  const [regularityData, setRegularityData] = React.useState({ jours: 0, malus: 0 });

  const loadPixel = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPixelState();

      console.log('🏠 [HOME] data reçue:', {
        score_total: data.score_total,
        lit: (data as any).lit,
        capacity: (data as any).capacity,
      });

      const info = getLevelInfo(data.score_total);

      console.log('🎯 [HOME] levelInfo calculé:', {
        levelNumber: info.levelNumber,
        levelName: info.levelName,
        gridSize: info.gridSize,
        capacity: info.capacity,
        pixelsLit: info.pixelsLit,
        scoreInLevel: info.scoreInLevel,
        totalScore: info.totalScore,
      });

      setLevelInfo(info);
      setPixel({
        lit: info.pixelsLit,
        capacity: info.capacity,
        ratio: info.progress,
      });

      console.log('✅ [HOME] States mis à jour');

      if (data.regularity_malus && data.regularity_malus.malus > 0) {
        setRegularityData({
          jours: data.regularity_malus.jours_inactif,
          malus: data.regularity_malus.malus,
        });
        setShowRegularityWarning(true);
      }

      // ─── MOCK TEMPORAIRE POUR TEST ─── (à supprimer après) ────
      /*
      setRegularityData({
        jours: 10,
        malus: 64,
      });
      setShowRegularityWarning(true);
      */
    } catch (e) {
      console.error("getPixelState failed:", e);
      setPixel(null);
      setLevelInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPixel();
  }, [loadPixel]);

  return (
    <SafeAreaView style={styles.safe}>
      <RegularityWarningModal
        visible={showRegularityWarning}
        onClose={() => setShowRegularityWarning(false)}
        joursInactif={regularityData.jours}
        malus={regularityData.malus}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>SUCCES OU ECHEC ?</Text>
          <Text style={styles.subtitle}>Parviendras-tu à remplir ton pixel ?</Text>
        </View>

        {/* Grand Pixel */}
        <View style={styles.pixelBlock}>
          {loading ? (
            <View style={[styles.pixelPlaceholder, { width: PIXEL_SIZE, height: PIXEL_SIZE }]}>
              <Text style={styles.pixelPlaceholderText}>Chargement…</Text>
            </View>
          ) : levelInfo ? (
            <>
              <BigPixel
                lit={levelInfo.pixelsLit}
                cols={levelInfo.gridSize}
                rows={levelInfo.gridSize}
                size={PIXEL_SIZE}
                color={levelInfo.color}
                maxDelta={200}
              />

              {/* Barre de progression 12 segments */}
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar}>
                  {LEVELS.map((level, i) => {
                    const isCompleted = i < levelInfo.levelNumber - 1;
                    const isCurrent = i === levelInfo.levelNumber - 1;
                    const segmentColor = isCompleted || isCurrent ? level.color : "#2A2A3E";
                    const segmentOpacity = isCurrent
                      ? 0.3 + levelInfo.progress * 0.7
                      : isCompleted ? 1 : 1;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.progressSegment,
                          { backgroundColor: segmentColor, opacity: segmentOpacity },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={styles.progressText}>
                  Niveau {levelInfo.levelNumber} / 12
                </Text>
              </View>
            </>
          ) : (
            <View style={[styles.pixelPlaceholder, { width: PIXEL_SIZE, height: PIXEL_SIZE }]}>
              <Text style={styles.pixelPlaceholderText}>Impossible de charger le Pixel</Text>
            </View>
          )}
        </View>

        <View style={styles.ctaBlock}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaOrange]}
            onPress={() => navigation.navigate("Entrainement")}
          >
            <Text style={styles.ctaOrangeText}>ENTRAÎNEMENT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaBlue]}
            onPress={() => navigation.navigate("Progression", { parcoursId: 1 })}
          >
            <Text style={styles.ctaBlueText}>PROGRESSION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaBlue]}
            onPress={() => navigation.navigate("Leaderboard")}
          >
            <Text style={styles.ctaBlueText}>CLASSEMENT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaPurple]}
            onPress={() => navigation.navigate("GlobalChat")}
          >
            <Text style={styles.ctaPurpleText}>CONVERSATION</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scrollView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  header: { marginBottom: 16, alignItems: "center" },
  title: { color: COLORS.text, fontWeight: "800", fontSize: 18 },
  subtitle: { color: COLORS.subtext, fontSize: 12, marginTop: 4 },

  pixelBlock: { alignItems: "center", marginBottom: 12 },
  pixelPlaceholder: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  pixelPlaceholderText: { color: "#6B7280" },

  ctaBlock: { gap: 14, marginTop: 12 },
  cta: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: COLORS.card,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
    alignItems: "center",
  },
  ctaOrange: { backgroundColor: COLORS.orange },
  ctaBlue: { backgroundColor: COLORS.blue },
  ctaPurple: { backgroundColor: COLORS.purple },
  ctaOrangeText: { color: COLORS.orangeText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
  ctaBlueText: { color: COLORS.blueText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
  ctaPurpleText: { color: COLORS.purpleText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },

  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  levelName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 8,
    textAlign: "center",
  },
  progressBarContainer: {
    marginTop: 12,
    alignItems: "center",
  },
  progressBar: {
    flexDirection: "row",
    gap: 3,
    marginBottom: 6,
  },
  progressSegment: {
    width: 20,
    height: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#3A3A4E",
  },
  progressText: {
    fontSize: 12,
    color: COLORS.subtext,
    marginTop: 4,
  },
});
