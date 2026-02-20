// src/api.ts
import axios from "axios";
import { API_BASE as API_URL } from "./config";
import { supabase } from "./auth";

/* ========== Axios ========== */
const api = axios.create({
  baseURL: API_URL,    // ✅ utilise l’alias importé
  timeout: 20000,
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const res = err?.response;
    const cfg = res?.config ?? err?.config;
    const method = (cfg?.method || "").toUpperCase();
    const url = (cfg?.baseURL || "") + (cfg?.url || "");
    const status = res?.status;
    const data = res?.data;

    const pretty = data ? JSON.stringify(data, null, 2) : String(err?.message);
    console.log("[api][error]", method, url, status, pretty);

    err.message = data?.detail
      ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail))
      : (data?.message || err.message);
    throw err;
  }
);

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  console.log("[api] using", API_URL, "| token?", token ? "YES" : "NO");
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

/* ========== Types ========== */
export type ObservationIn = {
  Entrainement_Id: number;
  Parcours_Id: number;
  Operateur_Un: number;
  Operateur_Deux: number;
  Operation: "Addition" | "Soustraction" | "Multiplication";
  Proposition: number;       // réponse de l’utilisateur
  Temps_Seconds?: number;
  Correction?: "OUI" | "NON";
};

export type ReviewTry = { id: number; reponse: number };

export type StartMixteRaw =
  | { id: number }
  | { entrainement_id: number }
  | { id: number; [k: string]: any }
  | { entrainement_id: number; [k: string]: any };

export type StartMixte = { entrainementId: number };

export type PositionsResponse = {
  user_id: number;
  entrainement_id: number;
  positions: {
    addition: { parcours_id: number; niveau: number; critere: number };
    soustraction: { parcours_id: number; niveau: number; critere: number };
    multiplication: { parcours_id: number; niveau: number; critere: number };
  };
};

/* ========== Endpoints: training/exercises ========== */


export async function fetchWithSupabaseAuth(input: RequestInfo, init: RequestInit = {}) {
  // 1) Récupère/rafraîchit la session
  let accessToken: string | null = null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    accessToken = data.session?.access_token ?? null;
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Cas fréquent: refresh token révoqué/absent -> on force un signOut propre
    if (msg.includes("Invalid Refresh Token")) {
      console.warn("[auth] refresh token invalide -> signOut()");
      try { await supabase.auth.signOut(); } catch {}
      // on nettoie la clé d’essai local au passage si tu l’utilises
      try { await AsyncStorage.removeItem("pixel_trial_started_at"); } catch {}
      // On propage une erreur lisible (ton UI peut alors rediriger vers Auth)
      throw new Error("SESSION_EXPIRED");
    }
    throw e;
  }

  // 2) Construit la requête avec le Bearer si présent
  const headers = new Headers(init.headers as any);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const resp = await fetch(input, { ...init, headers });

  // 3) Si le backend répond 401/403 (JWT expiré côté serveur), on resynchronise de la même façon
  if (resp.status === 401 || resp.status === 403) {
    try { await supabase.auth.signOut(); } catch {}
    try { await AsyncStorage.removeItem("pixel_trial_started_at"); } catch {}
    throw new Error("SESSION_EXPIRED");
  }

  return resp;
}










export async function startSession(
  typeOperation: "Addition" | "Soustraction" | "Multiplication",
  volume: number
) {
  const r = await api.post("/entrainement/start", {
    Type_Operation: typeOperation,
    Volume: volume,
  });
  return r.data;
}

export async function getExercises(
  typeOperation: "Addition" | "Soustraction" | "Multiplication",
  volume: number
) {
  const r = await api.get("/exercices/generer", {
    params: { Type_Operation: typeOperation, Volume: volume, include_solution: true },
  });
  return r.data;
}

export async function startEntrainementMixte(volume: number) {
  const r = await api.post("/entrainement/start_mixte", { Volume: volume });
  return r.data;
}

export async function genererExercicesMixte(volume: number) {
  const r = await api.get("/exercices/generer_mixte", {
    params: { Volume: volume, include_solution: true },
  });
  return r.data;
}

export async function postObservationsBatch(items: ObservationIn[]) {
  const r = await api.post("/observations", { items });
  return r.data;
}

/* ========== Review / Correction ========== */

// Récupère les items FAUX pour un entraînement donné, sinon le dernier.
export async function getLastReviewItems(entrainementId?: number) {
  if (typeof entrainementId === "number") {
    const r = await api.get("/review/items", {
      params: { entrainement_id: entrainementId },
    });
    return r.data; // { entrainement_id, count, items: [...] }
  } else {
    const r = await api.get("/review/last");
    return r.data; // { entrainement_id, count, items: [...] }
  }
}

export async function verifyReview(entrainementId: number, tries: ReviewTry[]) {
  const payload = { Entrainement_Id: entrainementId, tries };
  console.log("[api] verifyReview payload", JSON.stringify(payload, null, 2));
  const r = await api.post("/review/verify_mark", payload);
  return r.data; // {status, updated, missing, incorrect, ...}
}

// (Optionnel si tu as basculé vers la table Corrections)
export async function markTrainingCorrect(entrainementId: number) {
  const r = await api.post("/review/mark_training", {
    entrainement_id: entrainementId,
  });
  return r.data;
}

// Nouvelle table Corrections: insert une ligne (tentative++)
export async function recordCorrection(entrainementId: number) {
  const r = await api.post("/corrections/record", { Entrainement_Id: entrainementId });
  return r.data; // { attempt: number } (ou { Tentative: number })
}


// --- À AJOUTER tout en bas du fichier, parmi tes fonctions exportées --- //
export async function startMixte(baseUrl: string, token?: string): Promise<StartMixte> {
  const res = await fetch(`${baseUrl}/entrainement/start_mixte`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await res.text();
  const json: StartMixteRaw | null = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = (json as any)?.detail ?? res.statusText ?? 'start_mixte failed';
    throw new Error(`POST /entrainement/start_mixte → ${res.status} ${msg}`);
  }

  const entrainementId = (json as any)?.entrainement_id ?? (json as any)?.id;
  if (typeof entrainementId !== 'number') {
    throw new Error('startMixte: id manquant dans la réponse');
  }
  return { entrainementId };
}

export async function getPositions(baseUrl: string, entrainementId: number, token?: string): Promise<PositionsResponse> {
  const res = await fetch(`${baseUrl}/parcours/positions_currentes?entrainement_id=${encodeURIComponent(entrainementId)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const text = await res.text();
  const json: PositionsResponse | null = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = (json as any)?.detail ?? res.statusText ?? 'positions_currentes failed';
    throw new Error(`GET /parcours/positions_currentes → ${res.status} ${msg}`);
  }
  return json!;
}

export async function getPixelState(): Promise<PixelState> {
  try {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData?.user) throw new Error("Utilisateur non connecté");
    const auth_uid = userData.user.id;

    const res = await fetch(`${API_URL}/pixel/state?auth_uid=${auth_uid}`);
    if (!res.ok) throw new Error(`Pixel state error ${res.status}`);
    const json = await res.json();
    console.log('📡 [API] getPixelState response:', JSON.stringify(json, null, 2));
    return json as PixelState;
  } catch (err) {
    console.error("getPixelState error:", err);
    // Valeurs sûres par défaut pour ne pas casser le rendu
    return {
      grid_cols: 350,
      grid_rows: 350,
      capacity: 122500,
      score_total: 0,
      lit: 0,
      ratio: 0,
    };
  }
}


// === Leaderboard ===
export type LeaderboardItem = {
  rank: number;
  user_id: number;
  display_name: string | null;
  score_total: number;
  pixel_ratio: number;
};

export async function getLeaderboard(scope: "all" | "this_week" = "all", limit = 50, offset = 0) {
  // si tu as déjà authHeader(): garde-le pour envoyer le JWT
  const headers: any = (typeof authHeader === "function") ? await authHeader() : {};
  const res = await fetch(`${API_URL}/classement?scope=${scope}&limit=${limit}&offset=${offset}`, { headers });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res.json() as Promise<{ scope: string; items: LeaderboardItem[]; me: LeaderboardItem | null }>;
}
