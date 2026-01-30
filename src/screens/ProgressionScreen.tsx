import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Constants from "expo-constants";
import { supabase } from "../supabase";
import { theme } from "../theme";
import Svg, {
  Line as SvgLine,
  Path as SvgPath,
  Defs,
  LinearGradient,
  Stop,
  Circle,
} from "react-native-svg";
import { fetchWithSupabaseAuth } from "../api";

/* ========================== Types ========================== */
type ChartPoint = { x: number; y: number; label?: string };
type ScoreSeries = { points: ChartPoint[]; step: number; windows: number };

/* ========================== Config ========================= */
const API_BASE: string =
  (Constants?.expoConfig?.extra?.API_BASE_URL as string) ||
  (Constants?.manifest?.extra?.API_BASE_URL as string) ||
  "http://192.168.1.16:8000";

const SCREEN_W = Dimensions.get("window").width;

/* ====================== Palette de couleurs ===================== */
const COLORS = {
  bg: "#0F0F1A",
  cardDark: "rgba(20,20,35,0.95)",
  cardGlow: "rgba(139,92,246,0.08)",
  text: "#FFFFFF",
  textMuted: "#8B8BA3",
  textSoft: "#A5A5C0",

  // Accent colors
  purple: "#8B5CF6",
  purpleGlow: "rgba(139,92,246,0.4)",
  purpleSoft: "rgba(139,92,246,0.15)",

  orange: "#F97316",
  orangeGlow: "rgba(249,115,22,0.35)",
  orangeSoft: "rgba(249,115,22,0.12)",

  green: "#22C55E",
  greenSoft: "rgba(34,197,94,0.15)",

  blue: "#3B82F6",
  blueSoft: "rgba(59,130,246,0.15)",

  border: "rgba(139,92,246,0.2)",
  trackBg: "rgba(255,255,255,0.06)",
};

/* ======================= Composants UI ======================= */

function StatCard({
  emoji,
  value,
  label,
  accentColor = COLORS.purple,
  glowColor = COLORS.purpleSoft,
}: {
  emoji: string;
  value: string;
  label: string;
  accentColor?: string;
  glowColor?: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: accentColor + "30" }]}>
      <View style={[styles.statIconBg, { backgroundColor: glowColor }]}>
        <Text style={styles.statEmoji}>{emoji}</Text>
      </View>
      <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StreakCard({
  current,
  max,
  loading
}: {
  current: number;
  max: number;
  loading: boolean;
}) {
  const getMessage = () => {
    if (current === 0) return "Commence une nouvelle série !";
    if (current >= 30) return "Incroyable ! Tu es un champion !";
    if (current >= 14) return "Impressionnant ! Continue !";
    if (current >= 7) return "Une semaine ! Bravo !";
    if (current >= 3) return "Beau début, continue !";
    return "C'est parti !";
  };

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakHeader}>
        <View style={styles.streakFireBg}>
          <Text style={styles.streakFireEmoji}>🔥</Text>
        </View>
        <View style={styles.streakTextContainer}>
          <Text style={styles.streakLabel}>Série en cours</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.orange} size="small" />
          ) : (
            <Text style={styles.streakValue}>
              {current} <Text style={styles.streakUnit}>jour{current > 1 ? "s" : ""}</Text>
            </Text>
          )}
        </View>
      </View>

      {!loading && (
        <>
          <Text style={styles.streakMessage}>{getMessage()}</Text>

          {/* Progress vers objectif */}
          <View style={styles.streakProgressContainer}>
            <View style={styles.streakProgressTrack}>
              <View
                style={[
                  styles.streakProgressFill,
                  { width: `${Math.min(100, (current / 30) * 100)}%` }
                ]}
              />
            </View>
            <View style={styles.streakMilestones}>
              <Text style={[styles.milestone, current >= 3 && styles.milestoneActive]}>3j</Text>
              <Text style={[styles.milestone, current >= 7 && styles.milestoneActive]}>7j</Text>
              <Text style={[styles.milestone, current >= 14 && styles.milestoneActive]}>14j</Text>
              <Text style={[styles.milestone, current >= 30 && styles.milestoneActive]}>30j</Text>
            </View>
          </View>

          {max > 0 && (
            <Text style={styles.streakRecord}>Record personnel : {max} jours</Text>
          )}
        </>
      )}
    </View>
  );
}

/* ======================= LineChart (SVG) ======================= */
function LineChart({
  points,
  width,
  height = 180,
  padding = 24,
}: {
  points: number[];
  width: number;
  height?: number;
  padding?: number;
}) {
  if (!Array.isArray(points) || points.length < 2) {
    return (
      <View style={[styles.chartEmpty, { width, height }]}>
        <Text style={styles.chartEmptyEmoji}>📊</Text>
        <Text style={styles.chartEmptyText}>Pas encore assez de données</Text>
        <Text style={styles.chartEmptyHint}>Continue à t'entraîner !</Text>
      </View>
    );
  }

  let minY = Math.min(...points);
  let maxY = Math.max(...points);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const xSpan = Math.max(points.length - 1, 1);

  const xAt = (i: number) => padding + (i / xSpan) * innerW;
  const yAt = (v: number) =>
    height - padding - ((v - minY) / Math.max(maxY - minY, 1e-6)) * innerH;

  const coords = points.map((v, i) => [xAt(i), yAt(v)] as const);
  let path = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const cx = (x0 + x1) / 2;
    path += ` Q ${cx} ${y0}, ${x1} ${y1}`;
  }

  const lastPoint = coords[coords.length - 1];
  const lastValue = points[points.length - 1];

  return (
    <View>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={COLORS.purple} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={COLORS.blue} />
            <Stop offset="100%" stopColor={COLORS.purple} />
          </LinearGradient>
        </Defs>

        {/* Grille horizontale légère */}
        {[0.25, 0.5, 0.75].map((pct) => (
          <SvgLine
            key={pct}
            x1={padding}
            y1={padding + innerH * (1 - pct)}
            x2={width - padding}
            y2={padding + innerH * (1 - pct)}
            stroke={COLORS.trackBg}
            strokeWidth={1}
          />
        ))}

        {/* Zone sous courbe */}
        <SvgPath
          d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
          fill="url(#areaGrad)"
        />

        {/* Ligne principale avec glow */}
        <SvgPath d={path} stroke={COLORS.purpleGlow} strokeWidth={6} fill="none" />
        <SvgPath d={path} stroke="url(#lineGrad)" strokeWidth={3} fill="none" />

        {/* Point final mis en évidence */}
        <Circle cx={lastPoint[0]} cy={lastPoint[1]} r={8} fill={COLORS.purpleGlow} />
        <Circle cx={lastPoint[0]} cy={lastPoint[1]} r={5} fill={COLORS.purple} />
      </Svg>

      {/* Valeur actuelle */}
      <View style={styles.chartCurrentValue}>
        <Text style={styles.chartCurrentLabel}>Score actuel</Text>
        <Text style={styles.chartCurrentNumber}>{lastValue.toLocaleString()}</Text>
      </View>
    </View>
  );
}

/* ============== Helpers "jour Europe/Paris" ============== */
function toParisDayString(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function computeStreakFromDates(isoDates: (string | Date)[]) {
  const daySet = new Set<string>();
  for (const x of isoDates) daySet.add(toParisDayString(x));

  const todayParis = toParisDayString(new Date());
  let cur = 0;
  let probe = new Date(todayParis);
  while (daySet.has(toParisDayString(probe))) {
    cur += 1;
    probe.setDate(probe.getDate() - 1);
  }

  const allDays = Array.from(daySet).sort();
  let max = 0, run = 0, prev: string | null = null;
  for (const d of allDays) {
    if (!prev) {
      run = 1;
    } else {
      const pd = new Date(prev);
      const nd = new Date(d);
      const diff = (nd.getTime() - pd.getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > max) max = run;
    prev = d;
  }
  return { current: cur, max };
}

/* ============== Fetch functions ============== */
async function fetchScoreTimeseries(): Promise<ScoreSeries | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const url = `${API_BASE}/parcours/score_timeseries?parcours_id=1&step=100&windows=10`;

    const res = await fetchWithSupabaseAuth(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) return null;
    const data = (await res.json()) as ScoreSeries;
    if (!data || !Array.isArray(data.points)) return null;
    return data;
  } catch {
    return null;
  }
}

async function fetchDayStreakAPI(): Promise<{ current: number; max: number } | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetchWithSupabaseAuth(`${API_BASE}/stats/day_streak_current`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    return {
      current: Number(data.current_streak_days ?? 0),
      max: Number(data.max_streak_days ?? 0),
    };
  } catch {
    return null;
  }
}

async function fallbackDayStreakFromEntrainement(): Promise<{ current: number; max: number } | null> {
  try {
    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("Entrainement")
      .select("created_at")
      .gte("created_at", twoYearsAgo)
      .order("created_at", { ascending: true });

    if (error || !data) return null;
    return computeStreakFromDates(data.map((r: any) => r.created_at));
  } catch {
    return null;
  }
}

/* ====================== Écran principal ====================== */
export default function ProgressionScreen() {
  const [series, setSeries] = useState<ScoreSeries | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [streakCur, setStreakCur] = useState(0);
  const [streakMax, setStreakMax] = useState(0);
  const [loadingStreak, setLoadingStreak] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ts, stAPI] = await Promise.all([
          fetchScoreTimeseries(),
          fetchDayStreakAPI(),
        ]);

        if (!alive) return;

        setSeries(ts);

        if (stAPI) {
          setStreakCur(stAPI.current);
          setStreakMax(stAPI.max);
        } else {
          const stLocal = await fallbackDayStreakFromEntrainement();
          if (stLocal && alive) {
            setStreakCur(stLocal.current);
            setStreakMax(stLocal.max);
          }
        }
      } finally {
        if (alive) {
          setLoadingSeries(false);
          setLoadingStreak(false);
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  const pts = Array.isArray(series?.points) ? series!.points : [];
  const points = pts.map((p) => (typeof p?.y === "number" ? p.y : 0));

  // KPIs calculés
  const currentScore = points.length ? points[points.length - 1] : 0;
  const previousScore = points.length > 1 ? points[points.length - 2] : 0;
  const delta = currentScore - previousScore;
  const maxScore = points.length ? Math.max(...points) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >


        {/* Carte Streak - Élément principal */}
        <StreakCard
          current={streakCur}
          max={streakMax}
          loading={loadingStreak}
        />

        {/* Stats rapides */}
        <View style={styles.statsRow}>
          <StatCard
            emoji="⚡"
            value={delta >= 0 ? `+${delta}` : `${delta}`}
            label="Progression"
            accentColor={delta >= 0 ? COLORS.green : COLORS.orange}
            glowColor={delta >= 0 ? COLORS.greenSoft : COLORS.orangeSoft}
          />
          <StatCard
            emoji="🏆"
            value={maxScore.toLocaleString()}
            label="Record"
            accentColor={COLORS.purple}
            glowColor={COLORS.purpleSoft}
          />
        </View>

        {/* Graphique d'évolution */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Évolution du score</Text>
          {loadingSeries ? (
            <View style={styles.chartLoading}>
              <ActivityIndicator color={COLORS.purple} />
            </View>
          ) : (
            <LineChart
              width={SCREEN_W - 56}
              height={180}
              points={points}
            />
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

/* ============================ Styles ============================ */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Streak Card
  streakCard: {
    backgroundColor: COLORS.cardDark,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.orange + "30",
  },
  streakHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  streakFireBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.orangeSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  streakFireEmoji: {
    fontSize: 32,
  },
  streakTextContainer: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  streakValue: {
    fontSize: 36,
    fontWeight: "900",
    color: COLORS.orange,
    marginTop: 2,
  },
  streakUnit: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textSoft,
  },
  streakMessage: {
    fontSize: 14,
    color: COLORS.textSoft,
    marginTop: 16,
    textAlign: "center",
  },
  streakProgressContainer: {
    marginTop: 16,
  },
  streakProgressTrack: {
    height: 8,
    backgroundColor: COLORS.trackBg,
    borderRadius: 4,
    overflow: "hidden",
  },
  streakProgressFill: {
    height: "100%",
    backgroundColor: COLORS.orange,
    borderRadius: 4,
  },
  streakMilestones: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  milestone: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  milestoneActive: {
    color: COLORS.orange,
  },
  streakRecord: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 12,
  },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.cardDark,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
  },
  statIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statEmoji: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },

  // Chart Card
  chartCard: {
    backgroundColor: COLORS.cardDark,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 12,
  },
  chartLoading: {
    height: 180,
    justifyContent: "center",
    alignItems: "center",
  },
  chartEmpty: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.trackBg,
    borderRadius: 12,
  },
  chartEmptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  chartEmptyText: {
    fontSize: 14,
    color: COLORS.textSoft,
    fontWeight: "600",
  },
  chartEmptyHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  chartCurrentValue: {
    position: "absolute",
    top: 8,
    right: 8,
    alignItems: "flex-end",
  },
  chartCurrentLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  chartCurrentNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFD93D",
  },
});
