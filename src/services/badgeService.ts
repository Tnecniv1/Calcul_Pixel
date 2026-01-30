// src/services/badgeService.ts
import { supabase } from "../supabase";

// ============================================
// TYPES
// ============================================

export type BadgeCategory = "niveau" | "streak" | "rapidite" | "performance";

export type BadgeDefinition = {
  badge_id: string;
  category: BadgeCategory;
  name: string;
  description: string;
  emoji: string;
  threshold: number;
  sort_order: number;
};

export type UserBadge = BadgeDefinition & {
  unlocked: boolean;
  unlocked_at: string | null;
  progress: number;
};

export type BadgeStats = {
  niveau_moyen: number;
  streak_current: number;
  streak_max: number;
  temps_moyen_ms: number;
  sessions_parfaites: number;
  total_sessions: number;
  taux_reussite: number;
  score_cumule: number;
};

export type CheckBadgesResult = {
  stats: BadgeStats;
  newly_unlocked: BadgeDefinition[];
  total_unlocked: number;
};

export type MainBadge = {
  badge_id: string;
  name: string;
  emoji: string;
  description: string;
  threshold: number;
};

// ============================================
// CONFIGURATION DES BADGES (pour affichage)
// ============================================

export const BADGE_CATEGORIES: {
  id: BadgeCategory;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "niveau",
    label: "Badges de Niveau",
    emoji: "🏅",
    description: "Basés sur ton niveau moyen",
  },
  {
    id: "streak",
    label: "Badges de Régularité",
    emoji: "🔥",
    description: "Basés sur tes jours consécutifs",
  },
  {
    id: "rapidite",
    label: "Badges de Rapidité",
    emoji: "⚡",
    description: "Basés sur ton temps de réponse",
  },
  {
    id: "performance",
    label: "Badges de Performance",
    emoji: "🎖️",
    description: "Basés sur tes accomplissements",
  },
];

// Seuils pour calcul de progression (adaptés aux 92 niveaux du parcours)
export const NIVEAU_THRESHOLDS = [0, 10, 25, 45, 65, 85];
export const STREAK_THRESHOLDS = [3, 7, 14, 30];
export const RAPIDITE_THRESHOLDS = [5000, 3000, 2000, 1500]; // ms (décroissant)
export const PERF_THRESHOLDS = {
  sessions_parfaites: 10,
  total_sessions: 100,
  taux_reussite: 90,
  score_cumule: 10000,
};

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Récupère le user_id depuis l'auth_uid
 */
async function getCurrentUserId(): Promise<number | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("users_map")
      .select("user_id")
      .eq("auth_uid", user.id)
      .single();

    if (error || !data) return null;
    return data.user_id;
  } catch {
    return null;
  }
}

/**
 * Vérifie et débloque les badges pour l'utilisateur courant
 * À appeler après chaque session d'entraînement
 */
export async function checkAndUnlockBadges(): Promise<CheckBadgesResult | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("[badgeService] User not found");
      return null;
    }

    const { data, error } = await supabase.rpc("check_and_unlock_badges", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[badgeService] checkAndUnlockBadges error:", error);
      return null;
    }

    console.log("[badgeService] Check result:", data);
    return data as CheckBadgesResult;
  } catch (err) {
    console.error("[badgeService] checkAndUnlockBadges failed:", err);
    return null;
  }
}

/**
 * Récupère tous les badges de l'utilisateur (débloqués et verrouillés)
 */
export async function getUserBadges(): Promise<UserBadge[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error("[badgeService] User not found");
      return [];
    }

    const { data, error } = await supabase.rpc("get_user_badges", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[badgeService] getUserBadges error:", error);
      return [];
    }

    return (data || []) as UserBadge[];
  } catch (err) {
    console.error("[badgeService] getUserBadges failed:", err);
    return [];
  }
}

/**
 * Récupère le badge principal (animal) de l'utilisateur
 */
export async function getMainBadge(): Promise<MainBadge | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      // Retourner Asticot par défaut
      return {
        badge_id: "niveau_asticot",
        name: "Asticot Élémentaire",
        emoji: "🐛",
        description: "Tu débutes ton aventure mathématique",
        threshold: 0,
      };
    }

    const { data, error } = await supabase.rpc("get_main_badge", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[badgeService] getMainBadge error:", error);
      return null;
    }

    return data as MainBadge;
  } catch (err) {
    console.error("[badgeService] getMainBadge failed:", err);
    return null;
  }
}

/**
 * Récupère les stats pour badges de l'utilisateur
 */
export async function getBadgeStats(): Promise<BadgeStats | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase.rpc("get_user_stats_for_badges", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[badgeService] getBadgeStats error:", error);
      return null;
    }

    return data as BadgeStats;
  } catch (err) {
    console.error("[badgeService] getBadgeStats failed:", err);
    return null;
  }
}

// ============================================
// FONCTIONS DE PROGRESSION
// ============================================

/**
 * Calcule la progression vers le prochain badge de niveau
 */
export function getNiveauProgress(niveauMoyen: number): {
  current: BadgeDefinition | null;
  next: BadgeDefinition | null;
  progress: number; // 0-100
  remaining: number; // niveaux restants
} {
  // Seuils adaptés aux 92 niveaux du parcours
  const badges = [
    { badge_id: "niveau_asticot", name: "Asticot Élémentaire", emoji: "🐛", threshold: 0 },
    { badge_id: "niveau_abeille", name: "Abeille Collège", emoji: "🐝", threshold: 10 },
    { badge_id: "niveau_ours", name: "Ours Lycée", emoji: "🐻", threshold: 25 },
    { badge_id: "niveau_aigle", name: "Aigle Licence", emoji: "🦅", threshold: 45 },
    { badge_id: "niveau_licorne", name: "Licorne Master", emoji: "🦄", threshold: 65 },
    { badge_id: "niveau_dragon", name: "Dragon Doctorat", emoji: "🐉", threshold: 85 },
  ];

  let currentIdx = 0;
  for (let i = badges.length - 1; i >= 0; i--) {
    if (niveauMoyen >= badges[i].threshold) {
      currentIdx = i;
      break;
    }
  }

  const current = badges[currentIdx] as BadgeDefinition | null;
  const next = currentIdx < badges.length - 1 ? badges[currentIdx + 1] as BadgeDefinition | null : null;

  if (!next) {
    return { current, next: null, progress: 100, remaining: 0 };
  }

  const rangeStart = current?.threshold || 0;
  const rangeEnd = next.threshold;
  const progress = Math.min(100, Math.round(((niveauMoyen - rangeStart) / (rangeEnd - rangeStart)) * 100));
  const remaining = Math.max(0, Math.ceil(next.threshold - niveauMoyen));

  return { current, next, progress, remaining };
}

/**
 * Calcule la progression vers le prochain badge de streak
 */
export function getStreakProgress(streakDays: number): {
  current: { name: string; emoji: string; threshold: number } | null;
  next: { name: string; emoji: string; threshold: number } | null;
  progress: number;
  remaining: number;
} {
  const badges = [
    { name: "Discipline", emoji: "💧", threshold: 3 },
    { name: "Concentration", emoji: "⚡", threshold: 7 },
    { name: "Score de feu", emoji: "🔥", threshold: 14 },
    { name: "Progression", emoji: "📈", threshold: 30 },
  ];

  let currentIdx = -1;
  for (let i = badges.length - 1; i >= 0; i--) {
    if (streakDays >= badges[i].threshold) {
      currentIdx = i;
      break;
    }
  }

  const current = currentIdx >= 0 ? badges[currentIdx] : null;
  const next = currentIdx < badges.length - 1 ? badges[currentIdx + 1] : null;

  if (!next) {
    return { current, next: null, progress: 100, remaining: 0 };
  }

  const rangeStart = current?.threshold || 0;
  const rangeEnd = next.threshold;
  const progress = Math.min(100, Math.round(((streakDays - rangeStart) / (rangeEnd - rangeStart)) * 100));
  const remaining = Math.max(0, next.threshold - streakDays);

  return { current, next, progress, remaining };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Groupe les badges par catégorie
 */
export function groupBadgesByCategory(badges: UserBadge[]): Record<BadgeCategory, UserBadge[]> {
  const grouped: Record<BadgeCategory, UserBadge[]> = {
    niveau: [],
    streak: [],
    rapidite: [],
    performance: [],
  };

  for (const badge of badges) {
    if (grouped[badge.category]) {
      grouped[badge.category].push(badge);
    }
  }

  // Trier par sort_order
  for (const category of Object.keys(grouped) as BadgeCategory[]) {
    grouped[category].sort((a, b) => a.sort_order - b.sort_order);
  }

  return grouped;
}

/**
 * Compte les badges débloqués par catégorie
 */
export function countUnlockedByCategory(badges: UserBadge[]): Record<BadgeCategory, { unlocked: number; total: number }> {
  const grouped = groupBadgesByCategory(badges);
  const counts: Record<BadgeCategory, { unlocked: number; total: number }> = {
    niveau: { unlocked: 0, total: 0 },
    streak: { unlocked: 0, total: 0 },
    rapidite: { unlocked: 0, total: 0 },
    performance: { unlocked: 0, total: 0 },
  };

  for (const category of Object.keys(grouped) as BadgeCategory[]) {
    counts[category].total = grouped[category].length;
    counts[category].unlocked = grouped[category].filter((b) => b.unlocked).length;
  }

  return counts;
}

/**
 * Formate une date de déblocage
 */
export function formatUnlockDate(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Récupère le badge le plus récemment débloqué
 */
export function getMostRecentBadge(badges: UserBadge[]): UserBadge | null {
  const unlocked = badges.filter((b) => b.unlocked && b.unlocked_at);
  if (unlocked.length === 0) return null;

  return unlocked.reduce((most, badge) => {
    if (!most.unlocked_at) return badge;
    if (!badge.unlocked_at) return most;
    return new Date(badge.unlocked_at) > new Date(most.unlocked_at) ? badge : most;
  });
}
