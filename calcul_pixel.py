import streamlit as st
import json
import os
import random
import bcrypt
import hashlib
import time
import pandas as pd
from PIL import Image
import numpy as np
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime
from supabase import create_client

# --- 🔹 Initialisation de la session ---
if "page" not in st.session_state:
    st.session_state.page = "login"  # page par défaut

if "user_id" not in st.session_state:
    st.session_state.user_id = None

if "user" not in st.session_state:
    st.session_state.user = None  # Dictionnaire utilisateur complet

# --- 🔹 Lecture de l'user_id depuis l'URL avec la nouvelle API ---
params = st.query_params  # ✅ Pas de parenthèses
if "user_id" in params:
    try:
        st.session_state.user_id = int(params["user_id"])
    except ValueError:
        st.session_state.user_id = None

# --- 🔹 Connexion Supabase ---
supabase_url = st.secrets["SUPABASE_URL"]
supabase_key = st.secrets["SUPABASE_KEY"]
supabase = create_client(supabase_url, supabase_key)

# --- 🔹 OpenAI ---
load_dotenv()
client = OpenAI(api_key=st.secrets["OPENAI_API_KEY"])

# --- 🔹 Réinitialisation d'un nouvel entraînement ---

def start_new_training():
    """Réinitialise l'état de session pour un nouvel entraînement"""
    st.session_state.responses_logged = False
    st.session_state.answers = []
    st.session_state.page = "mental_calc"  # Page d'entraînement

# --------------------- UTILISATEURS ---------------------

def authenticate_user(email: str, password: str):
    """Vérifie l'email et le mot de passe de l'utilisateur dans Supabase."""
    user_data = (
        supabase.table("Users")
        .select("id, email, password_hash")

        .eq("email", email)
        .execute()
        .data
    )

    if not user_data:
        return None  # Aucun utilisateur trouvé

    user = user_data[0]

    # Vérification du hash bcrypt
    if bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return user

    return None  # Mot de passe incorrect

def login_page():
    """Affiche la page de connexion"""
    st.title("🔐 Connexion à Calcul Pixel Mental")

    email = st.text_input("Email")
    password = st.text_input("Mot de passe", type="password")

    if st.button("Connexion"):
        user = authenticate_user(email, password)
        if user:
            # 1️⃣ Stockage complet en session
            st.session_state.user = user
            st.session_state.user_id = user["id"]

            # 2️⃣ Ajout de l'user_id dans l'URL
            st.query_params["user_id"] = str(user["id"])

            # 3️⃣ Redirection vers la page d'accueil
            st.session_state.page = "home"
            st.rerun()
        else:
            st.error("Email ou mot de passe incorrect.")

def signup_page():
    st.title("Créer un compte")

    name = st.text_input("Nom complet")
    email = st.text_input("Adresse email")
    password = st.text_input("Mot de passe", type="password")
    confirm = st.text_input("Confirmer le mot de passe", type="password")

    if st.button("S'inscrire"):
        if password != confirm:
            st.error("Les mots de passe ne correspondent pas.")
            return

        # Vérifier si l'utilisateur existe déjà
        existing_user = supabase.table("Users").select("id").eq("email", email).execute()
        if existing_user.data:
            st.error("Un compte avec cet email existe déjà ❌")
            return

        # 🔹 Hachage sécurisé du mot de passe
        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        # 🔹 Créer l'utilisateur dans Supabase
        response = supabase.table("Users").insert({
            "name": name,
            "email": email,
            "password_hash": hashed_password
        }).execute()

        if response.data:
            st.success("Compte créé avec succès 🎉")
            st.session_state.page = "login"
            st.rerun()
        else:
            st.error("Erreur lors de la création du compte ❌")

def check_credentials(email, password):
    resp = supabase.table("Users").select("*").eq("email", email).execute()
    if not resp.data:
        return None
    row = resp.data[0]
    if row["password_hash"] == password:
        return {"id": row["id"], "name": row["name"], "email": row["email"]}
    return None

def save_user(name, email, password):
    supabase.table("Users").insert({
        "name": name,
        "email": email,
        "password_hash": password
    }).execute()

# --------------------- STATS & CLASSEMENT ---------------------

def ensure_initial_suivi(user_id: int):
    """
    S'assure qu'il existe une ligne de Suivi_Parcours pour chacun des 3 types :
    Addition, Soustraction, Multiplication. Si absente, on insère le Niveau 1.
    """
    types = ["Addition", "Soustraction", "Multiplication"]
    today = datetime.now().strftime("%Y-%m-%d")

    # Récupère des suivis récents pour l'utilisateur
    suivis = (
        supabase.table("Suivi_Parcours")
        .select("id, Parcours_Id")
        .eq("Users_Id", user_id)
        .order("id", desc=True)
        .limit(100)
        .execute()
        .data or []
    )

    deja = set()
    for s in suivis:
        p = (
            supabase.table("Parcours")
            .select("id, Type_Operation")
            .eq("id", s["Parcours_Id"])
            .limit(1)
            .execute()
            .data
        )
        if p:
            deja.add(p[0]["Type_Operation"])

    for type_op in types:
        if type_op in deja:
            continue

        # Essai strict par valeur canonique
        first_parcours = (
            supabase.table("Parcours")
            .select("id")
            .eq("Type_Operation", type_op)   # "Addition" / "Soustraction" / "Multiplication"
            .order("Niveau")
            .limit(1)
            .execute()
            .data
        )

        # Fallback 1 : casse/espaces (ilike)
        if not first_parcours:
            try:
                first_parcours = (
                    supabase.table("Parcours")
                    .select("id")
                    .ilike("Type_Operation", type_op)  # ilike est tolérant
                    .order("Niveau")
                    .limit(1)
                    .execute()
                    .data
                )
            except Exception:
                pass

        # Fallback 2 : symboles historiques
        if not first_parcours:
            symbol_map = {"Addition": "+", "Soustraction": "-", "Multiplication": "*"}
            symbol = symbol_map[type_op]
            first_parcours = (
                supabase.table("Parcours")
                .select("id")
                .eq("Type_Operation", symbol)
                .order("Niveau")
                .limit(1)
                .execute()
                .data
            )

        # Fallback 3 : pas de colonne/valeur Niveau -> ordre par id
        if not first_parcours:
            first_parcours = (
                supabase.table("Parcours")
                .select("id")
                .ilike("Type_Operation", type_op)
                .order("id")
                .limit(1)
                .execute()
                .data
            )

        if not first_parcours:
            st.error(f"❌ Aucun Parcours disponible pour {type_op}. Vérifie Type_Operation/Niveau.")
            continue


        parcours_id = first_parcours[0]["id"]
        supabase.table("Suivi_Parcours").insert({
            "Users_Id": user_id,
            "Parcours_Id": parcours_id,
            "Date": today,
            "Taux_Reussite": 0,
            "Type_Evolution": "initialisation",
            "Derniere_Observation_Id": None
        }).execute()

        st.write(f"[DEBUG] Suivi initial créé pour {type_op} (Parcours {parcours_id})")

def get_position_actuelle(user_id: int, type_operation: str):
    """
    Retourne la ligne Parcours correspondant AU DERNIER suivi de l'utilisateur
    pour le type demandé (Addition / Soustraction / Multiplication).
    Si aucun suivi pour ce type, retourne None.
    """
    # On récupère quelques suivis récents et on filtre par type côté Python
    last_suivi = (
        supabase.table("Suivi_Parcours")
        .select("id, Parcours_Id")
        .eq("Users_Id", user_id)
        .order("id", desc=True)
        .limit(20)
        .execute()
        .data or []
    )
    if not last_suivi:
        return None

    for s in last_suivi:
        p = (
            supabase.table("Parcours")
            .select("*")
            .eq("id", s["Parcours_Id"])
            .limit(1)
            .execute()
            .data
        )
        if p and p[0].get("Type_Operation") == type_operation:
            return p[0]

    return None

def get_user_streak(user_id):
    entrainements = supabase.table("Entrainement").select("Date").eq("Users_Id", user_id).order("Date", desc=True).execute().data or []
    dates = [datetime.strptime(e["Date"], "%Y-%m-%d").date() for e in entrainements]
    if not dates:
        return 0
    streak = 1
    today = datetime.now().date()
    for i in range(1, len(dates)):
        if (dates[i-1] - dates[i]).days == 1:
            streak += 1
        elif i == 1 and (today - dates[0]).days == 1:
            streak = 1
        else:
            break
    return streak

def get_user_total_score(user_id: int) -> int:
    """Retourne le score total cumulé de l'utilisateur via ses observations."""

    # 1️⃣ Récupérer tous les entraînements de l'utilisateur
    entrainements = (
        supabase.table("Entrainement")
        .select("id")
        .eq("Users_Id", user_id)
        .execute()
        .data
    )

    if not entrainements:
        return 0

    entrainement_ids = [e["id"] for e in entrainements]

    # 2️⃣ Récupérer les scores dans Observation
    observations = (
        supabase.table("Observations")
        .select("Score")
        .in_("Entrainement_Id", entrainement_ids)
        .execute()
        .data
    )

    if not observations:
        return 0

    # 3️⃣ Somme des scores
    return sum(obs.get("Score", 0) for obs in observations)

def analyser_progression(user_id, last_obs_id=None, parcours_id=None, type_operation=None):
    """
    Analyse et met à jour la progression POUR UN TYPE d'opération donné,
    en ne considérant que les observations rattachées au Parcours_Id courant.
    - user_id: int
    - last_obs_id: int | None  -> id max de l'observation après l'entraînement (peut être None)
    - parcours_id: int | None  -> parcours courant pour ce type (si None, on init niveau 1)
    - type_operation: str      -> "Addition" | "Soustraction" | "Multiplication"
    """
    import math
    from datetime import datetime

    if type_operation not in ("Addition", "Soustraction", "Multiplication"):
        st.error("❌ analyser_progression(): 'type_operation' doit être Addition/Soustraction/Multiplication")
        return

    st.write(f"[DEBUG] Analyse progression pour {type_operation}")

    # 1) Récupérer le dernier suivi EXISTANT pour CE TYPE (via Parcours -> Type_Operation)
    last_suivis = (
        supabase.table("Suivi_Parcours")
        .select("Parcours_Id,Derniere_Observation_Id,id")
        .eq("Users_Id", user_id)
        .order("id", desc=True)
        .limit(50)
        .execute().data or []
    )

    suivi_match = None
    for s in last_suivis:
        p = (
            supabase.table("Parcours")
            .select("id,Type_Operation")
            .eq("id", s["Parcours_Id"])
            .limit(1)
            .execute().data
        )
        if p and p[0]["Type_Operation"] == type_operation:
            suivi_match = s
            break

    # 2) CAS INITIAL: pas de suivi pour ce type -> on pointe sur le 1er niveau de ce type et on insère "initialisation"
    if not suivi_match:
        st.write(f"[DEBUG] Aucun suivi pour {type_operation} — initialisation")
        if not parcours_id:
            first_parcours = (
                supabase.table("Parcours")
                .select("id")
                .eq("Type_Operation", type_operation)
                .order("Niveau")         # utilise la colonne Niveau si dispo
                .limit(1)
                .execute().data
            )
            if not first_parcours:
                # fallback si pas de Niveau/valeurs
                first_parcours = (
                    supabase.table("Parcours")
                    .select("id")
                    .eq("Type_Operation", type_operation)
                    .order("id")
                    .limit(1)
                    .execute().data
                )
            if not first_parcours:
                st.error(f"❌ Aucun parcours disponible pour {type_operation}")
                return
            parcours_id = first_parcours[0]["id"]

        # Première observation existante (si tu veux stocker une référence)
        first_obs = (
            supabase.table("Observations")
            .select("id")
            .order("id")
            .limit(1)
            .execute().data
        )
        first_obs_id = first_obs[0]["id"] if first_obs else None

        supabase.table("Suivi_Parcours").insert({
            "Users_Id": user_id,
            "Parcours_Id": parcours_id,
            "Date": datetime.now().strftime("%Y-%m-%d"),
            "Taux_Reussite": 0,
            "Type_Evolution": "initialisation",
            "Derniere_Observation_Id": first_obs_id
        }).execute()

        st.write(f"[DEBUG] {type_operation}: suivi initialisé (Parcours {parcours_id})")
        return

    # 3) CAS NORMAL: analyser depuis la dernière observation prise en compte pour CE TYPE
    parcours_id = suivi_match["Parcours_Id"]
    last_obs_used = suivi_match["Derniere_Observation_Id"] or 0

    # 3.1 Critère du niveau courant
    parcours_row = (
        supabase.table("Parcours")
        .select("Critere, Type_Operation")
        .eq("id", parcours_id)
        .limit(1)
        .execute().data
    )
    if not parcours_row:
        st.error("❌ Parcours introuvable pour l'analyse")
        return
    critere = parcours_row[0]["Critere"]

    # 3.2 Nouvelles observations de CE PARCOURS (clé !)
    # On ne prend que les Observations rattachées à ce Parcours_Id et postérieures au last_obs_used.
    observations = (
        supabase.table("Observations")
        .select("id, Etat")
        .eq("Parcours_Id", parcours_id)
        .gt("id", last_obs_used)
        .order("id")
        .limit(10000)
        .execute().data or []
    )

    total_obs = len(observations)
    st.write(f"[DEBUG] {type_operation}: nouvelles obs pour Parcours {parcours_id} = {total_obs}")

    if total_obs < critere:
        st.write(f"[DEBUG] {type_operation}: pas assez de données ({total_obs}/{critere}).")
        return

    # 3.3 Calcul du taux sur les 'critere' dernières obs
    selection = observations[-critere:]
    nb_bonnes = sum(1 for obs in selection if obs["Etat"] == "VRAI")
    taux = round(nb_bonnes / critere, 2)
    st.write(f"[DEBUG] {type_operation}: taux={taux} sur {critere} obs")

    # 3.4 Déterminer l'évolution et le prochain parcours (toujours DANS LE MÊME TYPE)
    evolution = "stagnation"
    next_parcours_id = parcours_id

    if taux >= 0.8:
        evolution = "progression"
        next_row = (
            supabase.table("Parcours")
            .select("id")
            .eq("Type_Operation", type_operation)
            .gt("id", parcours_id)
            .order("id")
            .limit(1)
            .execute().data
        )
        if next_row:
            next_parcours_id = next_row[0]["id"]

    elif taux < 0.5:
        evolution = "régression"
        prev_row = (
            supabase.table("Parcours")
            .select("id")
            .eq("Type_Operation", type_operation)
            .lt("id", parcours_id)
            .order("id", desc=True)
            .limit(1)
            .execute().data
        )
        if prev_row:
            next_parcours_id = prev_row[0]["id"]

    # 3.5 Enregistrer un nouveau Suivi_Parcours pour CE TYPE
    supabase.table("Suivi_Parcours").insert({
        "Users_Id": user_id,
        "Parcours_Id": next_parcours_id,
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Taux_Reussite": taux,
        "Type_Evolution": evolution,
        "Derniere_Observation_Id": last_obs_id  # id max observé lors de CET entraînement
    }).execute()

    st.write(f"[DEBUG] {type_operation}: suivi enregistré ({evolution}) — nouveau parcours {next_parcours_id}")

def get_classement(limit=None):
    users = supabase.table("Users").select("id,name").execute().data or []
    if not users:
        return []
    entrainements = supabase.table("Entrainement").select("id,Users_Id").execute().data or []
    observations = supabase.table("Observations").select("Score,Entrainement_Id").execute().data or []
    # Mapping Entrainement -> User
    e_to_u = {e["id"]: e["Users_Id"] for e in entrainements}
    scores = {u["id"]: 0 for u in users}
    for obs in observations:
        uid = e_to_u.get(obs["Entrainement_Id"])
        if uid in scores:
            scores[uid] += obs["Score"]
    classement = [(u["id"], u["name"], scores[u["id"]]) for u in users]
    classement.sort(key=lambda x: x[2], reverse=True)
    return classement[:limit] if limit else classement

def _infer_type_from_operation(op_str: str) -> str:
    if " + " in op_str or "+" in op_str: return "Addition"
    if " - " in op_str or "-" in op_str: return "Soustraction"
    if " * " in op_str or "*" in op_str: return "Multiplication"
    return "Addition"
# --------------------- PIXEL MONSTRE ---------------------

@st.cache_data
def load_monstre_mask(path="monstre.png", grid_size=333):
    img = Image.open(path).convert("L")
    img = img.resize((grid_size, grid_size))
    arr = np.array(img)
    binary_mask = (arr < 200).astype(np.uint8)
    return binary_mask

def render_monstre_progress(score, mask):
    grid_size = mask.shape[0]
    total_pixels = int(mask.sum())
    score = min(score, total_pixels)
    coords = np.argwhere(mask == 1)
    np.random.seed(42)
    np.random.shuffle(coords)
    activated = coords[:score]
    img = np.zeros((grid_size, grid_size, 3), dtype=np.uint8)
    img[:, :] = [30, 30, 30]
    for y, x in activated:
        img[y, x] = [180, 0, 255]
    img = Image.fromarray(img).resize((grid_size*2, grid_size*2), Image.NEAREST)
    return img

# --------------------- GPT QCM ---------------------

def generate_mental_calculation(user_id: int, nb_questions_per_type: int):
    """
    Génère nb_questions_per_type additions, soustractions et multiplications
    en fonction du parcours actuel de l'utilisateur pour chaque type d'opération.
    Retourne une liste mélangée de questions, chaque question = {operation, solution}.
    """
    all_questions = []

    # On gère les 3 types séparément
    for type_op in ["Addition", "Soustraction", "Multiplication"]:
        # Récupère la position actuelle pour ce type
        parcours_info = get_position_actuelle(user_id, type_op)
        if not parcours_info:
            st.error(f"❌ Aucun parcours disponible pour {type_op}")
            continue

        op1_min = parcours_info.get("Operateur1_Min", 0)
        op1_max = parcours_info.get("Operateur1_Max", 10)
        op2_min = parcours_info.get("Operateur2_Min", 0)
        op2_max = parcours_info.get("Operateur2_Max", 10)

        # Génération des N questions pour ce type
        for _ in range(nb_questions_per_type):
            a = random.randint(op1_min, op1_max)
            b = random.randint(op2_min, op2_max)

            if type_op == "Addition":
                op_str = f"{a} + {b}"
                sol = a + b
            elif type_op == "Soustraction":
                op_str = f"{a} - {b}"
                sol = a - b
            elif type_op == "Multiplication":
                op_str = f"{a} * {b}"
                sol = a * b
            else:
                continue

            all_questions.append({
                "operation": op_str,
                "solution": sol,
                "type_operation": type_op
            })

    # Mélanger toutes les questions pour ne pas grouper par type
    random.shuffle(all_questions)
    st.write(f"DEBUG: Total questions générées = {len(all_questions)}")
    return all_questions

def save_mental_exercise(exo, parcours_id):
    """
    Enregistre l'exercice généré dans la table Exercices avec la nouvelle structure.
    """
    try:
        supabase.table("Exercices").insert({
            "Parcours_Id": parcours_id,
            "Probleme": exo["operation"],
            "Solution": str(exo["solution"])
        }).execute()
    except Exception as e:
        st.warning(f"⚠️ Impossible d'enregistrer l'exercice : {e}")

def generate_questions(n):
    user_id = st.session_state.user["id"]
    parcours = get_position_actuelle(user_id)
    return [q for _ in range(n) if (q := generate_question_from_openai(
        parcours["sujet"], parcours["Lecon"], parcours["niveau"]
    ))]

# --------------------- LOGIQUE QCM ---------------------

def _infer_type_from_operation(op_str: str) -> str:
    if " + " in op_str or "+" in op_str: return "Addition"
    if " - " in op_str or "-" in op_str: return "Soustraction"
    if " * " in op_str or "*" in op_str: return "Multiplication"
    return "Addition"

def log_responses_to_supabase():
    st.write("DEBUG: log_responses_to_supabase appelée")
    if st.session_state.get("responses_logged", False):
        return

    now = datetime.now()
    user_id = st.session_state.user["id"]
    nb_q = len(st.session_state.answers)

    # 1) Créer l'entraînement (multi-parcours → Parcours_Id NULL)
    entr = supabase.table("Entrainement").insert({
        "Users_Id": user_id,
        "Date": now.strftime("%Y-%m-%d"),
        "Time": now.strftime("%H:%M"),
        "Volume": nb_q,
        "Parcours_Id": None
    }).execute()
    if not entr.data:
        st.error("❌ Impossible de créer un entraînement dans Supabase")
        return
    entrainement_id = entr.data[0]["id"]

    # 2) Mapping Type -> Parcours courant
    parcours_by_type = {}
    for type_op in ["Addition", "Soustraction", "Multiplication"]:
        pos = get_position_actuelle(user_id, type_op)
        parcours_by_type[type_op] = pos["id"] if pos else None

    # 3) Construire Observations (avec temps & marge)
    observations_data = []
    obs_by_type = {"Addition": [], "Soustraction": [], "Multiplication": []}

    for entry in st.session_state.answers:
        op_str = entry["question"]
        type_op = entry.get("type_operation") or _infer_type_from_operation(op_str)
        parcours_id_for_obs = parcours_by_type.get(type_op)

        is_correct = entry["is_correct"]
        first_try_correction = entry.get("first_try_correction", False)

        score = 1 if (is_correct or first_try_correction) else -1
        etat = "VRAI" if (is_correct or first_try_correction) else "FAUX"
        correction = "OUI" if entry.get("corrected", False) else "NON"

        # Temps & marge
        temps_seconds = int(entry.get("elapsed", 0))
        marge_erreur = int(entry.get("error_margin", 0))

        try:
            parts = op_str.split()
            operateur_un = int(parts[0]); operateur_deux = int(parts[2])
        except Exception:
            operateur_un = None; operateur_deux = None

        obs = {
            "Entrainement_Id": entrainement_id,
            "Parcours_Id": parcours_id_for_obs,
            "Operateur_Un": operateur_un,
            "Operateur_Deux": operateur_deux,
            "Operation": op_str,
            "Etat": etat,
            "Correction": correction,
            "Score": score,
            "Temps_Seconds": temps_seconds,     # <-- NOUVEAU
            "Marge_Erreur": marge_erreur        # <-- NOUVEAU
        }
        observations_data.append(obs)
        obs_by_type[type_op].append(obs)

    if observations_data:
        supabase.table("Observations").insert(observations_data).execute()
    else:
        st.warning("⚠️ Aucune observation à insérer")

    # 4) Appels progression par type
    last_obs_row = (
        supabase.table("Observations")
        .select("id")
        .eq("Entrainement_Id", entrainement_id)
        .order("id", desc=True)
        .limit(1)
        .execute().data
    )
    last_obs_id = last_obs_row[0]["id"] if last_obs_row else None

    for type_op, obs_list in obs_by_type.items():
        if not obs_list:
            continue
        p = get_position_actuelle(user_id, type_op)
        parcours_id = p["id"] if p else None
        try:
            analyser_progression(user_id, last_obs_id, parcours_id, type_op)
        except Exception as e:
            st.warning(f"⚠️ Analyse de progression impossible pour {type_op} : {e}")

    st.session_state.responses_logged = True

# --------------------- PAGES ---------------------

def home_page():
    user = st.session_state.get("user")
    if not user:
        st.warning("⚠️ Utilisateur non connecté, retour à la page de login...")
        st.session_state.page = "login"
        st.rerun()
        return

    user_id = user["id"]

    # S'assurer que les 3 suivis existent
    try:
        ensure_initial_suivi(user_id)
    except Exception as e:
        st.error(f"Erreur d'initialisation du suivi : {e}")
        return

    # Stats globales
    total_score = get_user_total_score(user_id)
    streak = get_user_streak(user_id)

    # Header
    st.title(f"Bienvenue, {user.get('name','Utilisateur')} 👋")

    # Pixel en haut
    try:
        mask = load_monstre_mask("monstre.png")
        pixel_image = render_monstre_progress(int(total_score), mask)
        st.image(pixel_image, caption=f"{total_score} / {mask.sum()} pixels allumés", use_container_width=True)
    except Exception as e:
        st.warning(f"Impossible d'afficher le monstre : {e}")

    # 2 boutons principaux
    st.markdown("### ")
    col1, col2 = st.columns(2)
    with col1:
        if st.button("🏋️ Entraînement", use_container_width=True):
            st.session_state.page = "training_lobby"
            st.rerun()
    with col2:
        if st.button("📈 Progression", use_container_width=True):
            st.session_state.page = "progression"
            st.rerun()

    # Petit pied de page
    st.markdown("### ")
    c1, c2 = st.columns(2)
    c1.metric("🔥 Série (jours)", streak)
    c2.metric("🏆 Score cumulé", total_score)

    st.markdown("---")
    if st.button("Se déconnecter"):
        st.session_state.clear()
        st.session_state.page = "login"

def _get_scores_by_type(user_id: int):
    """
    Additionne Observations.Score par type d'opération pour l'utilisateur.
    Ne compte QUE les observations rattachées à un Parcours_Id (donc typées).
    """
    # 1) Tous les entraînements de l'utilisateur
    entr_rows = (
        supabase.table("Entrainement")
        .select("id")
        .eq("Users_Id", user_id)
        .execute()
        .data or []
    )
    if not entr_rows:
        return {"Addition": 0, "Soustraction": 0, "Multiplication": 0}
    entr_ids = [e["id"] for e in entr_rows]

    # 2) Observations avec leurs Parcours_Id
    obs_rows = (
        supabase.table("Observations")
        .select("Score,Parcours_Id")
        .in_("Entrainement_Id", entr_ids)
        .execute()
        .data or []
    )

    # Filtrer celles qui n'ont pas (encore) de Parcours_Id
    obs_rows = [o for o in obs_rows if o.get("Parcours_Id")]

    if not obs_rows:
        return {"Addition": 0, "Soustraction": 0, "Multiplication": 0}

    # 3) Charger les types pour ces Parcours_Id
    pids = sorted({o["Parcours_Id"] for o in obs_rows})
    p_rows = (
        supabase.table("Parcours")
        .select("id,Type_Operation")
        .in_("id", pids)
        .execute()
        .data or []
    )
    type_by_pid = {p["id"]: p["Type_Operation"] for p in p_rows}

    # 4) Agréger par type
    out = {"Addition": 0, "Soustraction": 0, "Multiplication": 0}
    for o in obs_rows:
        t = type_by_pid.get(o["Parcours_Id"])
        if t in out:
            out[t] += o.get("Score", 0)

    return out

def training_lobby_page():
    user = st.session_state.get("user")
    if not user:
        st.warning("⚠️ Non connecté.")
        st.session_state.page = "login"; st.rerun(); return
    user_id = user["id"]

    st.title("Préparer l'entraînement")

    # Positions actuelles par type
    pos_add = get_position_actuelle(user_id, "Addition")
    pos_sou = get_position_actuelle(user_id, "Soustraction")
    pos_mul = get_position_actuelle(user_id, "Multiplication")

    niveau_add = pos_add.get("Niveau") if pos_add else "—"
    niveau_sou = pos_sou.get("Niveau") if pos_sou else "—"
    niveau_mul = pos_mul.get("Niveau") if pos_mul else "—"

    # Scores par type
    scores = _get_scores_by_type(user_id)

    # Tableau récap (simple, MVP)
    st.subheader("Position dans le parcours")
    import pandas as pd
    df = pd.DataFrame([
        {"Opération": "Addition",       "Niveau": niveau_add, "Score": scores.get("Addition", 0)},
        {"Opération": "Soustraction",   "Niveau": niveau_sou, "Score": scores.get("Soustraction", 0)},
        {"Opération": "Multiplication", "Niveau": niveau_mul, "Score": scores.get("Multiplication", 0)},
    ])
    st.dataframe(df, use_container_width=True, hide_index=True)

    st.markdown("### ")
    st.markdown("#### Nombre d'opérations par type")
    nb = st.radio("Sélection rapide :", [10, 50, 100], index=0, horizontal=True, label_visibility="collapsed")

    st.caption("Ce nombre s'applique à chaque type (Addition, Soustraction, Multiplication).")

    st.markdown("### ")
    if st.button("CALCULEZ !", use_container_width=True):
        st.session_state.nb_questions = int(nb)        # utilisé par generate_mental_calculation(user_id, nb)
        start_new_training()                           # initialise l'état et route vers mental_calc
        st.rerun()

    st.markdown("---")
    if st.button("⬅️ Retour"):
        st.session_state.page = "home"
        st.rerun()

def mental_calc_page():
    st.title("Entraînement de calcul mental 🔢")

    user_id = st.session_state.get("user_id")
    if not user_id:
        st.error("⚠️ Vous devez être connecté pour commencer un entraînement.")
        st.session_state.page = "login"
        st.stop()

    nb_questions = st.session_state.get("nb_questions", 5)

    # 1) Init de la session d'entraînement
    if "questions" not in st.session_state or not st.session_state.questions:
        questions = generate_mental_calculation(user_id, nb_questions)
        st.session_state.questions = questions
        st.session_state.current_q = 0
        st.session_state.answers = []
        st.session_state.correct = 0
        st.session_state.score = 0
        st.session_state.q_start = time.time()  # ← départ chrono

    questions = st.session_state.questions
    q_index = st.session_state.current_q

    # 2) Fin → page résultats
    if q_index >= len(questions):
        st.session_state.page = "result"
        st.rerun()
        return

    q = questions[q_index]
    st.subheader(f"Question {q_index + 1} / {len(questions)}")
    st.markdown(f"**{q['operation']} = ?**")

    # 3) Chronomètre (se met à jour à chaque re-run)
    if "q_start" not in st.session_state:
        st.session_state.q_start = time.time()
    elapsed = int(time.time() - st.session_state.q_start)
    st.markdown(f"⏱️ Temps écoulé : **{elapsed}s**")

    # 4) Saisie + validation
    user_answer = st.text_input("Ta réponse :", key=f"answer_{q_index}")

    if st.button("Valider"):
        try:
            ua = int(user_answer)
            is_correct = ua == q["solution"]
            marge = abs(ua - int(q["solution"]))  # ← marge d’erreur absolue
        except ValueError:
            st.warning("Entre un nombre valide.")
            return

        # On enregistre la réponse avec temps & marge
        st.session_state.answers.append({
            "question": q["operation"],
            "user_answer": user_answer,
            "correct_answer": q["solution"],
            "is_correct": is_correct,
            "corrected": False,
            "elapsed": elapsed,                    # ← TEMPS
            "error_margin": marge,                 # ← MARGE
            "type_operation": _infer_type_from_operation(q["operation"])
        })

        # Passer à la suivante & reset chrono
        st.session_state.current_q += 1
        st.session_state.q_start = time.time()     # ← reset chrono
        st.rerun()

def result_page():
    import math
    st.markdown("""
    <style>
      .wrap {max-width: 640px; margin: 0 auto;}
      .score-card{
        background:#e9ecef;border-radius:16px;padding:14px 16px;
        display:flex;align-items:center;justify-content:space-between;
        font-weight:700;color:#263238;margin-bottom:12px;
      }
      .score-badge{background:#d1d9e6;border-radius:12px;padding:6px 10px;}
      .score-value{color:#22c55e;font-size:22px;}
      .section{
        background:#f7f7f8;border-radius:18px;padding:16px 16px;margin:12px 0; box-shadow: 0 1px 0 rgba(0,0,0,0.03) inset;
      }
      .section h3{margin:0 0 10px 0;color:#1f2937;}
      .row{display:flex;align-items:center;gap:12px;margin:10px 0;}
      .label{
        background:#dbe7ff;color:#0f172a;border-radius:999px;padding:6px 10px;font-weight:600;white-space:nowrap;
      }
      .bar{flex:1; height:28px; background:#ffffff; border-radius:999px; position:relative; overflow:hidden; border:1px solid #e5e7eb;}
      .fill{position:absolute; left:0; top:0; bottom:0; width:0%; background:#b3ccff;}
      .value{
        position:absolute; right:10px; top:50%; transform:translateY(-50%);
        font-weight:700; color:#1f2937;
      }
      .btn-primary{
        display:block; width:100%; text-align:center; background:#f59e0b; color:#111827;
        border:none; padding:12px 14px; border-radius:999px; font-weight:800; cursor:pointer; margin-top:8px;
      }
      .pill {border-radius:10px; padding:4px 8px; background:#fff; border:1px solid #e5e7eb;}
    </style>
    """, unsafe_allow_html=True)

    # -------- Data prep ----------
    answers = st.session_state.get("answers", [])
    total = len(answers)
    # correct = 1 si bonne réponse OU correction au 1er essai (si flag présent)
    def corr(a): return 1 if (a.get("is_correct") or a.get("first_try_correction")) else 0
    score_net = sum(1 if corr(a) else -1 for a in answers)  # même logique que l’insertion Observations

    # Regroupe par type
    types = ["Addition", "Soustraction", "Multiplication"]
    grouped = {t: [] for t in types}
    for a in answers:
        t = a.get("type_operation") or _infer_type_from_operation(a["question"])
        if t in grouped: grouped[t].append(a)

    # Pour chaque type: taux, temps moyen, marge moyenne (%)
    stats = {}
    # temps et marge servent aussi pour normaliser les barres (visuel)
    all_avg_times = []
    for t in types:
        rows = grouped[t]
        n = len(rows)
        if n == 0:
            stats[t] = {"acc": 0, "avg_time": 0.0, "avg_margin_pct": 0.0}
            continue
        acc = round(100 * (sum(corr(a) for a in rows) / n))
        # temps moyen
        avg_time = sum(int(a.get("elapsed", 0)) for a in rows) / max(1, n)
        all_avg_times.append(avg_time)
        # marge: % relative à la bonne réponse quand possible
        margins = []
        for a in rows:
            try:
                correct_val = float(a.get("correct_answer"))
                err = float(a.get("error_margin", 0))
                if correct_val != 0:
                    margins.append(100.0 * err / abs(correct_val))
                else:
                    margins.append(0.0 if err == 0 else 100.0)
            except Exception:
                margins.append(float(a.get("error_margin", 0)))
        avg_margin_pct = sum(margins) / max(1, len(margins))
        stats[t] = {
            "acc": int(acc),
            "avg_time": round(avg_time, 2),
            "avg_margin_pct": round(avg_margin_pct, 2)
        }

    # Normalisation visuelle des barres "temps" (plus le temps est grand, plus la barre est longue)
    max_time = max(all_avg_times) if all_avg_times else 1.0

    def section_block(title, acc, avg_time, avg_margin):
        # acc et avg_margin sont des % entre 0 et 100
        acc_fill = max(0, min(100, acc))
        margin_fill = max(0, min(100, avg_margin))
        time_ratio = 0 if max_time == 0 else (avg_time / max_time)
        time_fill = max(0, min(100, int(round(100 * time_ratio))))

        st.markdown(f"""
            <div class="section">
              <h3>{title}</h3>

              <div class="row">
                <div class="label">Taux de Réussite</div>
                <div class="bar">
                  <div class="fill" style="width:{acc_fill}%"></div>
                  <div class="value">{acc} %</div>
                </div>
              </div>

              <div class="row">
                <div class="label">Temps par Opération</div>
                <div class="bar">
                  <div class="fill" style="width:{time_fill}%"></div>
                  <div class="value">{avg_time} sec</div>
                </div>
              </div>

              <div class="row">
                <div class="label">Marge Erreur</div>
                <div class="bar">
                  <div class="fill" style="width:{margin_fill}%"></div>
                  <div class="value">{avg_margin:.0f} %</div>
                </div>
              </div>
            </div>
        """, unsafe_allow_html=True)

    # -------- UI ----------
    st.markdown('<div class="wrap">', unsafe_allow_html=True)

    # Score net
    st.markdown(f"""
      <div class="score-card">
        <div class="score-badge">Score Net</div>
        <div class="score-value">{"+" if score_net>=0 else ""}{score_net}</div>
      </div>
    """, unsafe_allow_html=True)

    # Sections
    section_block("Addition", stats["Addition"]["acc"], stats["Addition"]["avg_time"], stats["Addition"]["avg_margin_pct"])
    section_block("Soustraction", stats["Soustraction"]["acc"], stats["Soustraction"]["avg_time"], stats["Soustraction"]["avg_margin_pct"])
    section_block("Multiplication", stats["Multiplication"]["acc"], stats["Multiplication"]["avg_time"], stats["Multiplication"]["avg_margin_pct"])

    # Boutons
    # On enregistre l'entraînement ici si ce n'est pas déjà fait, avant de repartir
    col1, col2 = st.columns(2)
    with col1:
        if st.button("CORRECTION"):
            st.session_state.page = "correction"
            st.rerun()
    with col2:
        if st.button("Retour à l'accueil"):
            # log + reset comme avant
            log_responses_to_supabase()
            for k in ["questions", "current_q", "correct", "nb_questions", "score"]:
                st.session_state.pop(k, None)
            st.session_state.page = "home"
            st.rerun()

    st.markdown('</div>', unsafe_allow_html=True)

def correction_page():
    st.title("Correction interactive des erreurs 🛠️")

    # 1️⃣ Initialisation de l'état de correction
    if "correction_index" not in st.session_state:
        st.session_state.correction_index = 0
        st.session_state.attempts = 0

    # 2️⃣ Filtrer uniquement les erreurs
    erreurs = [e for e in st.session_state.answers if not e["is_correct"]]

    # 3️⃣ Si toutes les erreurs sont corrigées → retour à l'accueil
    if st.session_state.correction_index >= len(erreurs):
        st.success("🎉 Tu as terminé toutes les corrections !")

        if st.button("Retour à l’accueil"):
            log_responses_to_supabase()  # Sauvegarde finale
            # Nettoyage complet de la session
            for k in [
                "correction_index", "attempts", "questions", "current_q",
                "correct", "answers", "nb_questions", "score"
            ]:
                st.session_state.pop(k, None)
            st.session_state.page = "home"
            st.rerun()
        return

    # 4️⃣ Afficher l'erreur actuelle
    current = erreurs[st.session_state.correction_index]
    st.subheader(f"Erreur {st.session_state.correction_index + 1} sur {len(erreurs)}")
    st.write(f"❌ {current['question']} (Ta réponse : {current['user_answer']})")

    # Champ de saisie pour corriger
    user_correction = st.text_input(
        "Ta correction :",
        key=f"correction_{st.session_state.correction_index}"
    )

    # 5️⃣ Boutons d'action
    col1, col2 = st.columns(2)

    with col1:
        if st.button("Valider la correction"):
            if user_correction.strip() == str(current["correct_answer"]):
                st.success("✅ Bonne correction !")

                # 🔹 Marquer la correction dans la session
                current["corrected"] = True
                current["first_try_correction"] = (st.session_state.attempts == 0)

                # 🔹 Ajustement du score
                if st.session_state.attempts == 0:
                    st.session_state.score += 2  # (-1 initial +2 = +1 net)

                # 🔹 Passer à la correction suivante
                st.session_state.correction_index += 1
                st.session_state.attempts = 0
                st.rerun()
            else:
                st.session_state.attempts += 1
                st.error("❌ Mauvaise réponse")
                st.rerun()

    with col2:
        if st.button("Ignorer les erreurs et revenir à l'accueil"):
            log_responses_to_supabase()  # Sauvegarde finale
            # Nettoyage complet de la session
            for k in [
                "correction_index", "attempts", "questions", "current_q",
                "correct", "answers", "nb_questions", "score"
            ]:
                st.session_state.pop(k, None)
            st.session_state.page = "home"
            st.rerun()

def analyse_page():
    st.title("Analyse de progression 📈")

    # Relecture du dernier entraînement de l'utilisateur
    user = st.session_state.get("user")
    if not user:
        st.warning("Non connecté")
        st.session_state.page = "login"; st.rerun(); return
    user_id = user["id"]

    last_entr = (
        supabase.table("Entrainement")
        .select("id, Date, Time, Volume")
        .eq("Users_Id", user_id)
        .order("id", desc=True)
        .limit(1)
        .execute().data
    )
    if not last_entr:
        st.info("Aucun entraînement à analyser.")
        return

    entr_id = last_entr[0]["id"]
    st.caption(f"Dernier entraînement #{entr_id} — {last_entr[0]['Date']} {last_entr[0]['Time']}")

    obs = (
        supabase.table("Observations")
        .select("Operation, Etat, Temps_Seconds, Marge_Erreur, Parcours_Id")
        .eq("Entrainement_Id", entr_id)
        .execute().data or []
    )
    if not obs:
        st.info("Aucune observation pour cet entraînement.")
        return

    df = pd.DataFrame(obs)
        # Cast des métriques en numérique pour éviter les 'object'
    for col in ["Temps_Seconds", "Marge_Erreur"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df["type"] = df["Operation"].map(_infer_type_from_operation)
    df["ok"] = (df["Etat"] == "VRAI").astype(int)

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("Précision globale", f"{int(100*df['ok'].mean()) if len(df)>0 else 0}%")
    with c2:
        st.metric("Temps moyen (s)", f"{df['Temps_Seconds'].mean():.1f}")
    with c3:
        st.metric("Marge d'erreur moy.", f"{df['Marge_Erreur'].mean():.2f}")

    st.subheader("Par opération")
    synth = df.groupby("type").agg(
        questions=("ok","count"),
        accuracy=("ok","mean"),
        temps_moyen=("Temps_Seconds","mean"),
        marge_moy=("Marge_Erreur","mean")
    ).reset_index()

    if not synth.empty:
        synth["accuracy"] = (synth["accuracy"]*100).round(0).astype(int)
        synth["temps_moyen"] = synth["temps_moyen"].round(1)
        synth["marge_moy"] = synth["marge_moy"].round(2)
        st.dataframe(synth, use_container_width=True)
        st.bar_chart(synth.set_index("type")[["accuracy","temps_moyen","marge_moy"]])

    if st.button("🏠 Retour à l'accueil"):
        st.session_state.page = "home"; st.rerun()

def classement_page():
    st.title("🏆 Classement des Pixel-Monstres")
    top_players = get_classement(limit=10)
    if not top_players:
        st.info("Aucun joueur pour le moment.")
        return

    for i, (user_id, name, total_score) in enumerate(top_players, start=1):
        col1, col2, col3, col4 = st.columns([1, 3, 2, 2])
        with col1:
            st.markdown(f"**#{i}**")
        with col2:
            st.markdown(f"**{name}**")
        with col3:
            st.markdown(f"{total_score} pts")
        with col4:
            try:
                mask = load_monstre_mask("monstre.png")
                pixel_image = render_monstre_progress(int(total_score), mask)
                st.image(pixel_image, width=50)
            except Exception:
                st.text("❌")

# --------------------- NAVIGATION ---------------------

if st.session_state.page == "login":
    login_page()
elif st.session_state.page == "signup":
    signup_page()
elif st.session_state.page == "home":
    home_page()
elif st.session_state.page == "mental_calc":
    mental_calc_page()
elif st.session_state.page == "result":
    result_page()
elif st.session_state.page == "correction":
    correction_page()
elif st.session_state.page == "classement":
    classement_page()
elif st.session_state.page == "analyse":
    analyse_page()
elif st.session_state.page == "training_lobby":
    training_lobby_page()
elif st.session_state.page == "progression":
    analyse_page()  # ou ta page progression si tu l'as renommée/simplifiée
