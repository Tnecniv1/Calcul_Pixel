import { sendLocalNotification } from './notificationService';
import { 
  checkWeightedLevelChange, 
  getWeightedAverageLevel 
} from './rankingService';
import { supabase } from '../supabase'; // ✅ Ajoutez ceci

/**
 * Notification globale avec score et progression
 */
/**
 * Notification globale avec progression et classement
 */
export async function sendWeightedLevelNotification(
  userId: number,
  score: number,
  total: number
) {
  try {
    const result = await checkWeightedLevelChange(userId);
    const levels = await getWeightedAverageLevel(userId);
    
    if (!levels) {
      console.log('[WeightedNotif] Impossible de récupérer les niveaux');
      await sendScoreOnlyNotification(score, total);
      return;
    }

    const { change } = result;
    const actualWeightedLevel = levels.weightedLevel;
    const percentage = (score / total) * 100;

    console.log(`[WeightedNotif] Niveau actuel: ${actualWeightedLevel.toFixed(1)}, Change: ${change}`);

    // Calculer le classement global basé sur le niveau pondéré
    const globalRanking = await calculateGlobalRanking(userId, actualWeightedLevel);
    const topPercent = globalRanking ? globalRanking.topPercent : null;

    console.log(`[WeightedNotif] Classement: TOP ${topPercent}%`);

    // Déterminer le titre selon le score
    let title = '';
    if (percentage === 100) {
      title = '🏆 Parfait !';
    } else if (percentage >= 90) {
      title = '🌟 Excellent !';
    } else if (percentage >= 75) {
      title = '👏 Bien joué !';
    } else if (percentage >= 50) {
      title = '💪 Continue !';
    } else {
      title = '🎯 Réessaye !';
    }

    // Construire le body avec progression ET classement
    let body = '';
    
    // Partie 1 : Classement
    if (topPercent !== null) {
      if (topPercent >= 95) {
        // Vérifier si c'est vraiment le #1 (arrondi peut donner 95% au lieu de 100%)
        body = `👑 TOP 0.001% - Monstre du calcul mental !`;
      } else if (topPercent >= 90) {
        body = `⭐ TOP ${100 - topPercent}% ! Excellent niveau !`;
      } else if (topPercent >= 75) {
        body = `🔥 TOP ${100 - topPercent}% ! Tu es dans le bon wagon !`;
      } else if (topPercent >= 50) {
        body = `💪 TOP ${100 - topPercent}% - Continue comme ça !`;
      } else {
        body = `📊 TOP ${100 - topPercent}% - Encore de la marge de progression !`;
      }
    } else {
      body = `Niveau moyen: ${actualWeightedLevel.toFixed(1)}`;
    }

    // Partie 2 : Progression
    if (change === 'progress') {
      body += `\n🚀 Tu progresses ! (${actualWeightedLevel.toFixed(1)})`;
    } else if (change === 'stagnant') {
      body += `\n💡 Tu stagnes (${actualWeightedLevel.toFixed(1)}). Analyse tes erreurs !`;
    } else if (change === 'regress') {
      body += `\n💪 Petit recul (${actualWeightedLevel.toFixed(1)}), mais tu vas remonter !`;
    }

    console.log(`[WeightedNotif] Envoi notification: "${title}" - "${body}"`);

    await sendLocalNotification(
      title,
      body,
      { 
        type: 'session_complete',
        score,
        total,
        weightedLevel: actualWeightedLevel,
        change,
        topPercent,
        percentage: Math.round(percentage)
      }
    );

  } catch (error) {
    console.error('[WeightedNotif] Erreur:', error);
    await sendScoreOnlyNotification(score, total);
  }
}

/**
 * Calcule le classement global basé sur le niveau pondéré
 * Utilise une fonction Postgres pour contourner les restrictions RLS
 */
async function calculateGlobalRanking(
  userId: number,
  userWeightedLevel: number
): Promise<{ topPercent: number; totalUsers: number } | null> {
  try {
    console.log('[GlobalRanking] Appel de la fonction get_global_ranking()');
    
    // Appeler la fonction Postgres qui récupère tous les utilisateurs
    const { data: rankings, error } = await supabase
      .rpc('get_global_ranking');

    if (error) {
      console.error('[GlobalRanking] Erreur fonction RPC:', error);
      return null;
    }

    if (!rankings || rankings.length === 0) {
      console.log('[GlobalRanking] Aucun utilisateur trouvé');
      return null;
    }

    console.log('[GlobalRanking] Utilisateurs récupérés:', rankings.length);
    
    const totalUsers = rankings.length;
    
    // Si un seul utilisateur, pas de classement
    if (totalUsers === 1) {
      console.log('[GlobalRanking] Un seul utilisateur, pas de classement');
      return null;
    }

    // Compter combien d'utilisateurs ont un niveau inférieur
    const lowerCount = rankings.filter((r: any) => 
      parseFloat(r.weighted_level) < userWeightedLevel
    ).length;
    
    const topPercent = Math.round((lowerCount / totalUsers) * 100);

    console.log(`[GlobalRanking] ${lowerCount}/${totalUsers} en dessous → TOP ${100 - topPercent}% (meilleur que ${topPercent}%)`);

    return { topPercent, totalUsers };

  } catch (error) {
    console.error('[GlobalRanking] Erreur:', error);
    return null;
  }
}

/**
 * Notification simple de score (fallback et pour utilisateurs non connectés)
 */
async function sendScoreOnlyNotification(score: number, total: number) {
  const percentage = (score / total) * 100;
  
  let title = '';
  let emoji = '';
  
  if (percentage === 100) {
    emoji = '🏆';
    title = 'Parfait !';
  } else if (percentage >= 90) {
    emoji = '🌟';
    title = 'Excellent !';
  } else if (percentage >= 75) {
    emoji = '👏';
    title = 'Bien joué !';
  } else if (percentage >= 50) {
    emoji = '💪';
    title = 'Continue !';
  } else {
    emoji = '🎯';
    title = 'Réessaye !';
  }
  
  await sendLocalNotification(
    `${emoji} ${title}`,
    `Score: ${score}/${total}`,
    { type: 'score_only', score, total, percentage: Math.round(percentage) }
  );
}

/**
 * Notification de félicitations (pour compatibilité)
 */
export async function sendCelebrationNotification(
  score: number,
  total: number,
  level?: number
) {
  await sendScoreOnlyNotification(score, total);
}

/**
 * Notification pour un nouveau record personnel
 */
export async function sendPersonalRecordNotification(
  newScore: number,
  oldScore: number
) {
  await sendLocalNotification(
    '🔥 Nouveau record !',
    `Tu as battu ton ancien record de ${oldScore} avec ${newScore} points !`,
    { type: 'personal_record', newScore, oldScore }
  );
}

/**
 * Notification d'encouragement
 */
export async function sendEncouragementNotification(streak: number) {
  const messages = [
    { min: 1, title: '🎯 Bon début !', body: `${streak} jour${streak > 1 ? 's' : ''} d'entraînement !` },
    { min: 3, title: '🔥 En forme !', body: `${streak} jours consécutifs ! Continue comme ça !` },
    { min: 7, title: '⭐ Une semaine !', body: `7 jours d'affilée ! Tu es au top !` },
    { min: 14, title: '🏆 Deux semaines !', body: `${streak} jours ! Rien ne t'arrête !` },
    { min: 30, title: '👑 Champion !', body: `${streak} jours ! Tu es une légende !` },
  ];
  
  const message = [...messages].reverse().find(m => streak >= m.min);
  
  if (message) {
    await sendLocalNotification(
      message.title,
      message.body,
      { type: 'encouragement', streak }
    );
  }
} 