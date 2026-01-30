// src/screens/LeaderboardScreen.tsx
import * as React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from "react-native";
import { theme } from "../theme";
import { supabase } from "../supabase";

type Scope = "all" | "this_week";

type RpcRow = {
  user_id: number;
  display_name: string | null;
  avatar_url: string | null;
  score_total: number;
};

type Item = {
  user_id: number;
  rank: number;
  display_name: string | null;
  avatar_url: string | null;
  score_total: number;
};

// ============================================
// COMPOSANT AVATAR
// ============================================

type AvatarProps = {
  uri: string | null;
  name: string;
  size: number;
  rank: number;
};

function Avatar({ uri, name, size, rank }: AvatarProps) {
  // Couleurs speciales pour le podium
  const getPodiumColor = (r: number) => {
    if (r === 1) return "#FFD700"; // Or
    if (r === 2) return "#C0C0C0"; // Argent
    if (r === 3) return "#CD7F32"; // Bronze
    return null;
  };

  // Generer une couleur basee sur le nom
  const getColor = (str: string) => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const initial = (name || "U")[0].toUpperCase();
  const bgColor = getPodiumColor(rank) || getColor(name || "User");
  const podiumBorder = getPodiumColor(rank);

  if (uri) {
    return (
      <View style={podiumBorder ? [styles.avatarBorder, { borderColor: podiumBorder }] : undefined}>
        <Image
          source={{ uri }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarPlaceholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
        podiumBorder && styles.avatarPodium,
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// ============================================
// ECRAN PRINCIPAL
// ============================================

export default function LeaderboardScreen() {
  const [scope, setScope] = React.useState<Scope>("all");
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Essayer d'abord la RPC avec avatar
      const { data, error: rpcError } = await supabase.rpc("get_leaderboard_with_names", {
        p_limit: 100,
        p_weekly: scope === "this_week",
      });

      if (rpcError) throw rpcError;

      const rows = (data ?? []) as RpcRow[];

      // Si la RPC ne retourne pas avatar_url, on enrichit avec users_map
      let enrichedRows = rows;
      if (rows.length > 0 && rows[0].avatar_url === undefined) {
        const userIds = rows.map((r) => r.user_id);
        const { data: avatarData } = await supabase
          .from("users_map")
          .select("user_id, avatar_url, display_name")
          .in("user_id", userIds);

        const avatarMap = new Map(
          (avatarData || []).map((a) => [a.user_id, { avatar_url: a.avatar_url, display_name: a.display_name }])
        );

        enrichedRows = rows.map((r) => ({
          ...r,
          avatar_url: avatarMap.get(r.user_id)?.avatar_url || null,
          display_name: r.display_name || avatarMap.get(r.user_id)?.display_name || null,
        }));
      }

      const mapped: Item[] = enrichedRows.map((r, i) => ({
        user_id: r.user_id,
        rank: i + 1,
        display_name: r.display_name,
        avatar_url: r.avatar_url || null,
        score_total: r.score_total,
      }));

      setItems(mapped);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    load();
  }, [load]);

  const renderName = (it: Item) =>
    (it.display_name && it.display_name.trim()) || `User #${it.user_id}`;

  const renderItem = React.useCallback(
    ({ item }: { item: Item }) => (
      <View style={[styles.row, item.rank <= 3 && styles.rowPodium]}>
        {/* Position */}
        <View style={styles.rankContainer}>
          <Text style={[styles.rank, item.rank <= 3 && styles.rankPodium]}>
            {item.rank}
          </Text>
        </View>

        {/* Avatar */}
        <Avatar
          uri={item.avatar_url}
          name={renderName(item)}
          size={40}
          rank={item.rank}
        />

        {/* Nom */}
        <View style={styles.nameContainer}>
          <Text style={[styles.name, item.rank <= 3 && styles.namePodium]} numberOfLines={1}>
            {renderName(item)}
          </Text>
        </View>

        {/* Score */}
        <Text style={[styles.score, item.rank <= 3 && styles.scorePodium]}>
          {item.score_total.toLocaleString()}
        </Text>
      </View>
    ),
    []
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Onglets */}
      <View style={styles.tabs}>
        <TouchableOpacity
          onPress={() => setScope("all")}
          disabled={loading || scope === "all"}
          style={[
            styles.tab,
            scope === "all" && styles.tabActive,
            (loading || scope === "all") && styles.tabDisabled,
          ]}
        >
          <Text style={[styles.tabText, scope === "all" && styles.tabTextActive]}>Tous</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setScope("this_week")}
          disabled={loading || scope === "this_week"}
          style={[
            styles.tab,
            scope === "this_week" && styles.tabActive,
            (loading || scope === "this_week") && styles.tabDisabled,
          ]}
        >
          <Text style={[styles.tabText, scope === "this_week" && styles.tabTextActive]}>Semaine</Text>
        </TouchableOpacity>
      </View>

      {/* Liste */}
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.user_id)}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.text} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {error ?? "Aucun resultat pour cette vue."}
              </Text>
            </View>
          ) : null
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },

  // Onglets
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
  },
  tabActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  tabDisabled: {
    opacity: 0.6,
  },
  tabText: {
    color: theme.colors.text,
    fontWeight: "600",
    fontSize: 14,
  },
  tabTextActive: {
    color: theme.colors.bg,
  },

  // Liste
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    gap: 12,
  },
  rowPodium: {
    borderWidth: 1,
    borderColor: theme.colors.accent + "40",
  },

  // Rank
  rankContainer: {
    width: 28,
    alignItems: "center",
  },
  rank: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
    opacity: 0.7,
  },
  rankPodium: {
    opacity: 1,
    fontWeight: "800",
    fontSize: 18,
  },

  // Avatar
  avatar: {
    backgroundColor: theme.colors.border,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontWeight: "700",
  },
  avatarBorder: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 1,
  },
  avatarPodium: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },

  // Name
  nameContainer: {
    flex: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  namePodium: {
    fontWeight: "700",
  },

  // Score
  score: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  scorePodium: {
    color: theme.colors.accent,
    fontWeight: "800",
    fontSize: 16,
  },

  // Empty
  emptyContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    color: theme.colors.text,
    opacity: 0.6,
  },
});
