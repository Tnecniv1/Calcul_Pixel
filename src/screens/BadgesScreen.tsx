// src/screens/BadgesScreen.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { theme } from "../theme";
import {
  UserBadge,
  MainBadge,
  BadgeCategory,
  BADGE_CATEGORIES,
  getUserBadges,
  getMainBadge,
  getBadgeStats,
  checkAndUnlockBadges,
  groupBadgesByCategory,
  countUnlockedByCategory,
  formatUnlockDate,
  getNiveauProgress,
  BadgeStats,
} from "../services/badgeService";

const SCREEN_WIDTH = Dimensions.get("window").width;

// ============================================
// COMPOSANTS
// ============================================

/**
 * Badge Card individuel
 */
function BadgeCard({
  badge,
  onPress,
}: {
  badge: UserBadge;
  onPress: () => void;
}) {
  const isUnlocked = badge.unlocked;

  return (
    <TouchableOpacity
      style={[styles.badgeCard, isUnlocked && styles.badgeCardUnlocked]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.badgeEmoji, !isUnlocked && styles.badgeEmojiLocked]}>
        <Text style={styles.badgeEmojiText}>
          {isUnlocked ? badge.emoji : "🔒"}
        </Text>
      </View>
      <Text
        style={[styles.badgeName, !isUnlocked && styles.badgeNameLocked]}
        numberOfLines={2}
      >
        {badge.name}
      </Text>
      {isUnlocked && badge.unlocked_at && (
        <Text style={styles.badgeDate}>{formatUnlockDate(badge.unlocked_at)}</Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * Section de catégorie
 */
function CategorySection({
  category,
  badges,
  unlocked,
  total,
  onBadgePress,
}: {
  category: (typeof BADGE_CATEGORIES)[0];
  badges: UserBadge[];
  unlocked: number;
  total: number;
  onBadgePress: (badge: UserBadge) => void;
}) {
  const progress = total > 0 ? (unlocked / total) * 100 : 0;

  return (
    <View style={styles.categorySection}>
      {/* Header */}
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryEmoji}>{category.emoji}</Text>
        <View style={styles.categoryTitleBlock}>
          <Text style={styles.categoryTitle}>{category.label}</Text>
          <Text style={styles.categorySubtitle}>{category.description}</Text>
        </View>
        <View style={styles.categoryCount}>
          <Text style={styles.categoryCountText}>
            {unlocked}/{total}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {/* Grid de badges */}
      <View style={styles.badgesGrid}>
        {badges.map((badge) => (
          <BadgeCard
            key={badge.badge_id}
            badge={badge}
            onPress={() => onBadgePress(badge)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Modal de détail d'un badge
 */
function BadgeDetailModal({
  badge,
  visible,
  onClose,
  stats,
}: {
  badge: UserBadge | null;
  visible: boolean;
  onClose: () => void;
  stats: BadgeStats | null;
}) {
  if (!badge) return null;

  const isUnlocked = badge.unlocked;

  // Calculer la progression selon la catégorie
  let progressText = "";
  if (!isUnlocked && stats) {
    switch (badge.category) {
      case "niveau":
        const niveauProgress = getNiveauProgress(stats.niveau_moyen);
        progressText = `Niveau moyen actuel : ${stats.niveau_moyen.toFixed(1)} / ${badge.threshold} requis`;
        break;
      case "streak":
        progressText = `Streak actuel : ${stats.streak_current} jours / ${badge.threshold} requis`;
        break;
      case "rapidite":
        progressText = `Temps moyen : ${Math.round(stats.temps_moyen_ms)}ms / < ${badge.threshold}ms requis`;
        break;
      case "performance":
        if (badge.badge_id === "perf_perfectionniste") {
          progressText = `Sessions parfaites : ${stats.sessions_parfaites} / ${badge.threshold} requises`;
        } else if (badge.badge_id === "perf_travailleur") {
          progressText = `Sessions totales : ${stats.total_sessions} / ${badge.threshold} requises`;
        } else if (badge.badge_id === "perf_precis") {
          progressText = `Taux de réussite : ${stats.taux_reussite.toFixed(1)}% / ${badge.threshold}% requis`;
        } else if (badge.badge_id === "perf_centurion") {
          progressText = `Score cumulé : ${stats.score_cumule} / ${badge.threshold} requis`;
        }
        break;
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          {/* Badge emoji grand */}
          <View style={[styles.modalEmoji, isUnlocked && styles.modalEmojiUnlocked]}>
            <Text style={styles.modalEmojiText}>{badge.emoji}</Text>
          </View>

          {/* Nom et description */}
          <Text style={styles.modalName}>{badge.name}</Text>
          <Text style={styles.modalDescription}>{badge.description}</Text>

          {/* Statut */}
          {isUnlocked ? (
            <View style={styles.modalUnlockedBadge}>
              <Text style={styles.modalUnlockedText}>
                ✓ Débloqué le {formatUnlockDate(badge.unlocked_at)}
              </Text>
            </View>
          ) : (
            <View style={styles.modalLockedBadge}>
              <Text style={styles.modalLockedText}>🔒 Non débloqué</Text>
              {progressText && (
                <Text style={styles.modalProgressText}>{progressText}</Text>
              )}
            </View>
          )}

          {/* Bouton fermer */}
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

/**
 * Header avec badge principal
 */
function MainBadgeHeader({ mainBadge, stats }: { mainBadge: MainBadge | null; stats: BadgeStats | null }) {
  if (!mainBadge) return null;

  const niveauProgress = stats ? getNiveauProgress(stats.niveau_moyen) : null;

  return (
    <View style={styles.mainBadgeContainer}>
      <View style={styles.mainBadgeGlow}>
        <Text style={styles.mainBadgeEmoji}>{mainBadge.emoji}</Text>
      </View>
      <Text style={styles.mainBadgeName}>{mainBadge.name}</Text>
      <Text style={styles.mainBadgeDescription}>{mainBadge.description}</Text>

      {niveauProgress?.next && (
        <View style={styles.nextBadgeInfo}>
          <Text style={styles.nextBadgeText}>
            Prochain : {niveauProgress.next.emoji} {niveauProgress.next.name}
          </Text>
          <View style={styles.nextBadgeProgressBar}>
            <View
              style={[styles.nextBadgeProgressFill, { width: `${niveauProgress.progress}%` }]}
            />
          </View>
          <Text style={styles.nextBadgeRemaining}>
            Encore {niveauProgress.remaining} niveau{niveauProgress.remaining > 1 ? "x" : ""} moyen
          </Text>
        </View>
      )}

      {!niveauProgress?.next && (
        <View style={styles.maxLevelBadge}>
          <Text style={styles.maxLevelText}>🎉 Niveau maximum atteint !</Text>
        </View>
      )}
    </View>
  );
}

// ============================================
// ÉCRAN PRINCIPAL
// ============================================

export default function BadgesScreen() {
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [mainBadge, setMainBadge] = useState<MainBadge | null>(null);
  const [stats, setStats] = useState<BadgeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<UserBadge | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      // D'abord, vérifier et débloquer les badges basés sur l'historique
      // Cela permet de débloquer les badges même si l'utilisateur n'a pas fait d'entraînement récent
      await checkAndUnlockBadges();

      // Ensuite, charger les données à afficher
      const [badgesData, mainBadgeData, statsData] = await Promise.all([
        getUserBadges(),
        getMainBadge(),
        getBadgeStats(),
      ]);
      setBadges(badgesData);
      setMainBadge(mainBadgeData);
      setStats(statsData);
    } catch (err) {
      console.error("[BadgesScreen] loadData error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBadgePress = useCallback((badge: UserBadge) => {
    setSelectedBadge(badge);
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedBadge(null);
  }, []);

  // Grouper les badges
  const groupedBadges = groupBadgesByCategory(badges);
  const counts = countUnlockedByCategory(badges);

  // Calculer le total
  const totalUnlocked = Object.values(counts).reduce((sum, c) => sum + c.unlocked, 0);
  const totalBadges = Object.values(counts).reduce((sum, c) => sum + c.total, 0);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Chargement des badges...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header avec stats globales */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mes Badges</Text>
          <Text style={styles.headerSubtitle}>
            {totalUnlocked} / {totalBadges} débloqués
          </Text>
        </View>

        {/* Badge principal */}
        <MainBadgeHeader mainBadge={mainBadge} stats={stats} />

        {/* Sections par catégorie */}
        {BADGE_CATEGORIES.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            badges={groupedBadges[category.id] || []}
            unlocked={counts[category.id]?.unlocked || 0}
            total={counts[category.id]?.total || 0}
            onBadgePress={handleBadgePress}
          />
        ))}
      </ScrollView>

      {/* Modal de détail */}
      <BadgeDetailModal
        badge={selectedBadge}
        visible={modalVisible}
        onClose={handleCloseModal}
        stats={stats}
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
  scrollView: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: theme.colors.text,
    opacity: 0.7,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.text,
    opacity: 0.6,
    marginTop: 4,
  },

  // Main Badge
  mainBadgeContainer: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.accent + "40",
  },
  mainBadgeGlow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.accent + "20",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.accent + "60",
  },
  mainBadgeEmoji: {
    fontSize: 50,
  },
  mainBadgeName: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 4,
  },
  mainBadgeDescription: {
    fontSize: 14,
    color: theme.colors.text,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 16,
  },
  nextBadgeInfo: {
    width: "100%",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  nextBadgeText: {
    fontSize: 13,
    color: theme.colors.secondary,
    fontWeight: "600",
    marginBottom: 8,
  },
  nextBadgeProgressBar: {
    width: "100%",
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    overflow: "hidden",
  },
  nextBadgeProgressFill: {
    height: "100%",
    backgroundColor: theme.colors.accent,
    borderRadius: 4,
  },
  nextBadgeRemaining: {
    fontSize: 12,
    color: theme.colors.text,
    opacity: 0.5,
    marginTop: 6,
  },
  maxLevelBadge: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  maxLevelText: {
    fontSize: 14,
    color: theme.colors.accent,
    fontWeight: "700",
  },

  // Category Section
  categorySection: {
    marginBottom: 24,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  categoryEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryTitleBlock: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  categorySubtitle: {
    fontSize: 12,
    color: theme.colors.text,
    opacity: 0.5,
  },
  categoryCount: {
    backgroundColor: theme.colors.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: theme.colors.secondary,
    borderRadius: 2,
  },

  // Badges Grid
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  badgeCard: {
    width: (SCREEN_WIDTH - 32 - 30) / 4, // 4 colonnes
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeCardUnlocked: {
    borderColor: theme.colors.accent + "60",
    backgroundColor: theme.colors.accent + "10",
  },
  badgeEmoji: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.bg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  badgeEmojiLocked: {
    opacity: 0.4,
  },
  badgeEmojiText: {
    fontSize: 22,
  },
  badgeName: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.text,
    textAlign: "center",
    lineHeight: 12,
  },
  badgeNameLocked: {
    opacity: 0.5,
  },
  badgeDate: {
    fontSize: 8,
    color: theme.colors.text,
    opacity: 0.4,
    marginTop: 2,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
  },
  modalEmoji: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.bg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  modalEmojiUnlocked: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + "20",
  },
  modalEmojiText: {
    fontSize: 40,
  },
  modalName: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: theme.colors.text,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 16,
  },
  modalUnlockedBadge: {
    backgroundColor: "#4ECDC4" + "20",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalUnlockedText: {
    color: "#4ECDC4",
    fontWeight: "600",
    fontSize: 13,
  },
  modalLockedBadge: {
    backgroundColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: "center",
  },
  modalLockedText: {
    color: theme.colors.text,
    opacity: 0.7,
    fontWeight: "600",
    fontSize: 13,
  },
  modalProgressText: {
    color: theme.colors.text,
    opacity: 0.5,
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
  modalCloseButton: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalCloseText: {
    color: theme.colors.bg,
    fontWeight: "700",
    fontSize: 14,
  },
});
