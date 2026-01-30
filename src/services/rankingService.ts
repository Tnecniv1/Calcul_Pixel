import { supabase } from '../supabase';

/**
 * Récupère la distribution des niveaux pour un type d'opération
 */
export async function getUserRankingPercentile(
  userId: number,
  operationType: 'Multiplication' | 'Addition' | 'Soustraction'
): Promise<{ percentile: number; userLevel: number; totalUsers: number } | null> {
  try {
    console.log(`[Ranking] Calcul ranking pour user ${userId}, type ${operationType}`);
    
    // 1. Récupérer le dernier parcours de l'utilisateur
    const { data: suiviData, error: suiviError } = await supabase
      .from('Suivi_Parcours')
      .select('Parcours_Id')
      .eq('Users_Id', userId)
      .order('Date', { ascending: false })
      .limit(1);

    if (suiviError || !suiviData || suiviData.length === 0) {
      console.error('[Ranking] Erreur récupération suivi:', suiviError);
      return null;
    }

    const userParcoursId = suiviData[0].Parcours_Id;
    console.log(`[Ranking] Parcours ID utilisateur: ${userParcoursId}`);

    // 2. Récupérer le niveau depuis Parcours
    const { data: userParcoursData, error: userParcoursError } = await supabase
      .from('Parcours')
      .select('Niveau, Type_Operation')
      .eq('id', userParcoursId)
      .single();

    if (userParcoursError || !userParcoursData) {
      console.error('[Ranking] Erreur récupération parcours utilisateur:', userParcoursError);
      return null;
    }

    if (userParcoursData.Type_Operation !== operationType) {
      console.log(`[Ranking] Type ne correspond pas: ${userParcoursData.Type_Operation} vs ${operationType}`);
      return null;
    }

    const userLevel = userParcoursData.Niveau;
    console.log(`[Ranking] Niveau utilisateur: ${userLevel}`);

    // 3. Récupérer tous les parcours du même type
    const { data: allParcours, error: allParcoursError } = await supabase
      .from('Parcours')
      .select('id, Niveau, Type_Operation')
      .eq('Type_Operation', operationType);

    if (allParcoursError || !allParcours) {
      console.error('[Ranking] Erreur récupération tous parcours:', allParcoursError);
      return null;
    }

    const parcoursIds = allParcours.map(p => p.id);
    console.log(`[Ranking] ${parcoursIds.length} parcours trouvés pour ${operationType}`);

    // 4. Récupérer tous les suivis pour ces parcours
    const { data: allSuivis, error: allSuivisError } = await supabase
      .from('Suivi_Parcours')
      .select('Users_Id, Parcours_Id')
      .in('Parcours_Id', parcoursIds);

    if (allSuivisError || !allSuivis) {
      console.error('[Ranking] Erreur récupération tous suivis:', allSuivisError);
      return null;
    }

    // 5. Grouper par utilisateur pour prendre leur niveau max
    const userMaxLevels = new Map<number, number>();
    
    for (const suivi of allSuivis) {
      const parcours = allParcours.find(p => p.id === suivi.Parcours_Id);
      if (!parcours) continue;
      
      const currentMax = userMaxLevels.get(suivi.Users_Id) || 0;
      if (parcours.Niveau > currentMax) {
        userMaxLevels.set(suivi.Users_Id, parcours.Niveau);
      }
    }

    const totalUsers = userMaxLevels.size;
    if (totalUsers === 0) {
      console.log('[Ranking] Aucun utilisateur trouvé');
      return null;
    }

    // 6. Compter combien d'utilisateurs ont un niveau inférieur
    let lowerRankedUsers = 0;
    for (const [, level] of userMaxLevels) {
      if (level < userLevel) {
        lowerRankedUsers++;
      }
    }

    // 7. Calculer le percentile
    const percentile = Math.round((lowerRankedUsers / totalUsers) * 100);

    console.log(`[Ranking] Résultat: Level ${userLevel}, Top ${100 - percentile}% (${lowerRankedUsers}/${totalUsers} en dessous)`);

    return {
      percentile,
      userLevel,
      totalUsers
    };

  } catch (error) {
    console.error('[Ranking] Erreur:', error);
    return null;
  }
}

/**
 * Vérifie si l'utilisateur a progressé ou régressé
 */
export async function checkLevelChange(
  userId: number,
  parcoursId: number,
  newLevel: number
): Promise<'progress' | 'stagnant' | 'regress' | 'same'> {
  try {
    console.log(`[LevelChange] Vérification pour user ${userId}, parcours ${parcoursId}, niveau ${newLevel}`);
    
    // Récupérer l'historique des entraînements avec leur parcours
    const { data: history, error } = await supabase
      .from('Entrainement')
      .select(`
        Parcours_Id,
        Created_At
      `)
      .eq('Users_Id', userId)
      .order('Created_At', { ascending: false })
      .limit(5);

    if (error || !history || history.length === 0) {
      console.log('[LevelChange] Pas d\'historique trouvé');
      return 'same';
    }

    // Récupérer les niveaux des parcours
    const parcoursIds = [...new Set(history.map(h => h.Parcours_Id))];
    const { data: parcoursData, error: parcoursError } = await supabase
      .from('Parcours')
      .select('id, Niveau, Type_Operation')
      .in('id', parcoursIds);

    if (parcoursError || !parcoursData) {
      console.error('[LevelChange] Erreur récupération parcours:', parcoursError);
      return 'same';
    }

    // Obtenir le type d'opération du parcours actuel
    const currentParcours = parcoursData.find(p => p.id === parcoursId);
    if (!currentParcours) {
      console.log('[LevelChange] Parcours actuel non trouvé');
      return 'same';
    }

    const operationType = currentParcours.Type_Operation;

    // Filtrer l'historique pour le même type d'opération
    const relevantHistory = history.filter(h => {
      const parcours = parcoursData.find(p => p.id === h.Parcours_Id);
      return parcours?.Type_Operation === operationType;
    });

    if (relevantHistory.length === 0) {
      console.log('[LevelChange] Pas d\'historique pour ce type d\'opération');
      return 'same';
    }

    // Obtenir le niveau précédent (plus récent avant celui-ci)
    const previousParcoursId = relevantHistory[0]?.Parcours_Id;
    const previousParcours = parcoursData.find(p => p.id === previousParcoursId);
    
    if (!previousParcours) {
      console.log('[LevelChange] Pas de niveau précédent');
      return 'same';
    }

    const previousLevel = previousParcours.Niveau;
    
    console.log(`[LevelChange] Niveau précédent: ${previousLevel}, Nouveau: ${newLevel}`);
    
    if (newLevel > previousLevel) {
      console.log('[LevelChange] 🚀 PROGRESSION !');
      return 'progress';
    }
    if (newLevel < previousLevel) {
      console.log('[LevelChange] 📉 Régression');
      return 'regress';
    }
    
    // Vérifier la stagnation (même niveau sur les 3 derniers)
    const recentLevels = relevantHistory.slice(0, 3).map(h => {
      const parcours = parcoursData.find(p => p.id === h.Parcours_Id);
      return parcours?.Niveau;
    }).filter(Boolean);
    
    const isStagnant = recentLevels.length >= 3 && recentLevels.every(level => level === newLevel);
    
    if (isStagnant) {
      console.log('[LevelChange] 😐 Stagnation');
      return 'stagnant';
    }
    
    console.log('[LevelChange] = Même niveau');
    return 'same';

  } catch (error) {
    console.error('[LevelChange] Erreur:', error);
    return 'same';
  }
}

/**
 * Calcule le niveau moyen pondéré de l'utilisateur
 */
export async function getWeightedAverageLevel(userId: number): Promise<{
  weightedLevel: number;
  additionLevel: number;
  soustractionLevel: number;
  multiplicationLevel: number;
} | null> {
  try {
    console.log(`[WeightedLevel] Calcul pour user ${userId}`);
    
    // Récupérer tous les suivis de l'utilisateur
    const { data: suivis, error: suivisError } = await supabase
      .from('Suivi_Parcours')
      .select('Parcours_Id')
      .eq('Users_Id', userId)
      .order('Date', { ascending: false });

    if (suivisError || !suivis || suivis.length === 0) {
      console.error('[WeightedLevel] Pas de suivi trouvé');
      return null;
    }

    // Récupérer les parcours correspondants
    const parcoursIds = suivis.map(s => s.Parcours_Id);
    const { data: parcours, error: parcoursError } = await supabase
      .from('Parcours')
      .select('"Niveau", "Type_Operation"')
      .in('id', parcoursIds);

    if (parcoursError || !parcours) {
      console.error('[WeightedLevel] Erreur récupération parcours');
      return null;
    }

    // Trouver le niveau max pour chaque type
    let additionLevel = 1;
    let soustractionLevel = 1;
    let multiplicationLevel = 1;

    for (const p of parcours) {
      if (p.Type_Operation === 'Addition' && p.Niveau > additionLevel) {
        additionLevel = p.Niveau;
      } else if (p.Type_Operation === 'Soustraction' && p.Niveau > soustractionLevel) {
        soustractionLevel = p.Niveau;
      } else if (p.Type_Operation === 'Multiplication' && p.Niveau > multiplicationLevel) {
        multiplicationLevel = p.Niveau;
      }
    }

    // Calculer le niveau moyen pondéré
    const weightedLevel = 
      0.25 * additionLevel + 
      0.25 * soustractionLevel + 
      0.5 * multiplicationLevel;

    console.log(`[WeightedLevel] Addition: ${additionLevel}, Soustraction: ${soustractionLevel}, Multiplication: ${multiplicationLevel}`);
    console.log(`[WeightedLevel] Niveau pondéré: ${weightedLevel.toFixed(2)}`);

    return {
      weightedLevel: Math.round(weightedLevel * 100) / 100, // 2 décimales
      additionLevel,
      soustractionLevel,
      multiplicationLevel
    };

  } catch (error) {
    console.error('[WeightedLevel] Erreur:', error);
    return null;
  }
}

/**
 * Vérifie l'évolution du niveau moyen pondéré
 */
export async function checkWeightedLevelChange(
  userId: number
): Promise<{
  change: 'progress' | 'stagnant' | 'regress' | 'same';
  currentWeighted: number;
  previousWeighted: number | null;
}> {
  try {
    console.log(`[WeightedChange] Vérification pour user ${userId}`);
    
    // Récupérer l'historique des entraînements (derniers 10)
    const { data: history, error } = await supabase
      .from('Entrainement')
      .select('Parcours_Id, Created_At')
      .eq('Users_Id', userId)
      .order('Created_At', { ascending: false })
      .limit(10);

    if (error || !history || history.length === 0) {
      console.log('[WeightedChange] Pas d\'historique');
      return {
        change: 'same',
        currentWeighted: 0,
        previousWeighted: null
      };
    }

    // Récupérer les infos des parcours
    const parcoursIds = [...new Set(history.map(h => h.Parcours_Id))];
    const { data: parcours, error: parcoursError } = await supabase
      .from('Parcours')
      .select('id, "Niveau", "Type_Operation"')
      .in('id', parcoursIds);

    if (parcoursError || !parcours) {
      return {
        change: 'same',
        currentWeighted: 0,
        previousWeighted: null
      };
    }

    // Fonction helper pour calculer le niveau pondéré à partir d'un set d'entraînements
    const calculateWeighted = (entrainements: typeof history) => {
      let maxAdd = 1, maxSous = 1, maxMult = 1;
      
      for (const ent of entrainements) {
        const p = parcours.find(pc => pc.id === ent.Parcours_Id);
        if (!p) continue;
        
        if (p.Type_Operation === 'Addition' && p.Niveau > maxAdd) {
          maxAdd = p.Niveau;
        } else if (p.Type_Operation === 'Soustraction' && p.Niveau > maxSous) {
          maxSous = p.Niveau;
        } else if (p.Type_Operation === 'Multiplication' && p.Niveau > maxMult) {
          maxMult = p.Niveau;
        }
      }
      
      return 0.25 * maxAdd + 0.25 * maxSous + 0.5 * maxMult;
    };

    // Niveau actuel (3 derniers entraînements)
    const currentWeighted = calculateWeighted(history.slice(0, 3));
    
    // Niveau précédent (entraînements 4-7 s'ils existent)
    let previousWeighted: number | null = null;
    if (history.length > 3) {
      previousWeighted = calculateWeighted(history.slice(3, 7));
    }

    console.log(`[WeightedChange] Actuel: ${currentWeighted.toFixed(2)}, Précédent: ${previousWeighted?.toFixed(2) || 'N/A'}`);

    if (previousWeighted === null) {
      return {
        change: 'same',
        currentWeighted,
        previousWeighted: null
      };
    }

    const diff = currentWeighted - previousWeighted;
    
    if (diff > 0.5) {
      console.log('[WeightedChange] 🚀 PROGRESSION !');
      return { change: 'progress', currentWeighted, previousWeighted };
    } else if (diff < -0.5) {
      console.log('[WeightedChange] 📉 Régression');
      return { change: 'regress', currentWeighted, previousWeighted };
    } else if (Math.abs(diff) < 0.1) {
      console.log('[WeightedChange] 😐 Stagnation');
      return { change: 'stagnant', currentWeighted, previousWeighted };
    } else {
      console.log('[WeightedChange] = Stable');
      return { change: 'same', currentWeighted, previousWeighted };
    }

  } catch (error) {
    console.error('[WeightedChange] Erreur:', error);
    return {
      change: 'same',
      currentWeighted: 0,
      previousWeighted: null
    };
  }
}