import streamlit as st
import json
import os
import random
import bcrypt
import hashlib
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
    import math
    st.write("[DEBUG] Début de l’analyse de progression (par type)")
    if type_operation not in ("Addition", "Soustraction", "Multiplication"):
        st.error("type_operation manquant ou invalide pour analyser_progression()")
        return

    # 1) Dernier suivi pour CE type
    last_suivi_rows = (
        supabase.table("Suivi_Parcours")
        .select("Parcours_Id,Derniere_Observation_Id,id")
        .eq("Users_Id", user_id)
        .order("id", desc=True)
        .limit(50)
        .execute()
        .data or []
    )

    suivi_match = None
    for s in last_suivi_rows:
        p = supabase.table("Parcours").select("id,Type_Operation").eq("id", s["Parcours_Id"]).limit(1).execute().data
        if p and p[0]["Type_Operation"] == type_operation:
            suivi_match = s
            break

    # 2) Cas initial pour CE type
    if not suivi_match:
        st.write(f"[DEBUG] Aucun suivi existant pour {type_operation}, création du premier...")
        if not parcours_id:
            first_parcours = (
                supabase.table("Parcours")
                .select("id")
                .eq("Type_Operation", type_operation)
                .order("Niveau")
                .limit(1)
                .execute()
                .data
            )
            if not first_parcours:
                st.error(f"❌ Aucun parcours disponible pour {type_operation}")
                return
            parcours_id = first_parcours[0]["id"]

        first_obs = supabase.table("Observations").select("id").order("id").limit(1).execute().data
        first_obs_id = first_obs[0]["id"] if first_obs else None

        supabase.table("Suivi_Parcours").insert({
            "Users_Id": user_id,
            "Parcours_Id": parcours_id,
            "Date": datetime.now().strftime("%Y-%m-%d"),
            "Taux_Reussite": 0,
            "Type_Evolution": "initialisation",
            "Derniere_Observation_Id": first_obs_id
        }).execute()

        st.success(f"✅ Suivi {type_operation} initialisé")
        return

    # 3) Cas normal : progression pour CE type
    parcours_id = suivi_match["Parcours_Id"]
    last_obs_used = suivi_match["Derniere_Observation_Id"]

    # Critère du niveau courant
    parcours_data = supabase.table("Parcours").select("Critere").eq("id", parcours_id).limit(1).execute().data
    if not parcours_data:
        st.error("❌ Critere introuvable pour le parcours courant")
    critere = parcours_data[0]["Critere"]

    # 4) Nouvelles observations depuis last_obs_used -> filtrer par type (via symbole)
    observations = (
        supabase.table("Observations")
        .select("id,Etat,Operation")
        .gt("id", last_obs_used if last_obs_used else 0)
        .order("id")
        .limit(10000)
        .execute()
        .data or []
    )

    def is_type(op_str: str) -> bool:
        if type_operation == "Addition": return " + " in op_str
        if type_operation == "Soustraction": return " - " in op_str
        return " * " in op_str

    observations = [o for o in observations if is_type(o.get("Operation", ""))]
    total_obs = len(observations)
    st.write(f"[DEBUG] {type_operation}: nouvelles observations filtrées = {total_obs}")

    if total_obs < critere:
        st.write(f"[DEBUG] {type_operation}: pas assez de données ({total_obs}/{critere}).")
        return

    selection = observations[-critere:]
    nb_bonnes = sum(1 for obs in selection if obs["Etat"] == "VRAI")
    taux = round(nb_bonnes / critere, 2)

    evolution = "stagnation"
    if taux >= 0.8:
        evolution = "progression"
        next_parcours = (
            supabase.table("Parcours")
            .select("id")
            .eq("Type_Operation", type_operation)
            .gt("id", parcours_id)
            .order("id")
            .limit(1)
            .execute()
            .data
        )
        if next_parcours:
            parcours_id = next_parcours[0]["id"]
    elif taux < 0.5:
        evolution = "régression"
        prev_parcours = (
            supabase.table("Parcours")
            .select("id")
            .eq("Type_Operation", type_operation)
            .lt("id", parcours_id)
            .order("id", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if prev_parcours:
            parcours_id = prev_parcours[0]["id"]

    supabase.table("Suivi_Parcours").insert({
        "Users_Id": user_id,
        "Parcours_Id": parcours_id,
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Taux_Reussite": taux,
        "Type_Evolution": evolution,
        "Derniere_Observation_Id": last_obs_id
    }).execute()

    st.write(f"[DEBUG] Suivi {type_operation} enregistré ({evolution}) — niveau {parcours_id}")


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

def generate_mental_calculation(user_id: int, nb_questions: int = 5):
    st.write("DEBUG: generate_mental_calculation() par type ✅")

    types = ["Addition", "Soustraction", "Multiplication"]
    symbol_map = {"Addition": "+", "Soustraction": "-", "Multiplication": "*"}

    questions = []

    for type_op in types:
        pos = get_position_actuelle(user_id, type_op)
        if not pos:
            st.warning(f"Aucun parcours trouvé pour {type_op} — il sera initialisé si besoin.")
            continue

        try:
            op1_min = pos["Operateur1_Min"]
            op1_max = pos["Operateur1_Max"]
            op2_min = pos["Operateur2_Min"]
            op2_max = pos["Operateur2_Max"]
        except KeyError as e:
            st.error(f"Clé manquante dans Parcours ({type_op}) : {e}")
            continue

        operateur = symbol_map[type_op]
        for _ in range(nb_questions):
            op1 = random.randint(op1_min, op1_max)
            op2 = random.randint(op2_min, op2_max)

            if operateur == "+":
                solution = op1 + op2
            elif operateur == "-":
                solution = op1 - op2
            else:
                solution = op1 * op2

            questions.append({
                "operation": f"{op1} {operateur} {op2}",
                "solution": solution,
                "type_operation": type_op
            })

    random.shuffle(questions)
    st.write("DEBUG: Total questions générées =", len(questions))
    return questions

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
    if " + " in op_str:
        return "Addition"
    if " - " in op_str:
        return "Soustraction"
    if " * " in op_str:
        return "Multiplication"
    return "Addition"

def log_responses_to_supabase():
    st.write("DEBUG: log_responses_to_supabase appelée")
    if st.session_state.get("responses_logged", False):
        return

    now = datetime.now()
    user_id = st.session_state.user["id"]
    nb_q = len(st.session_state.answers)

    # ✅ On crée l'entraînement (sans supposer un parcours global)
    entr = supabase.table("Entrainement").insert({
        "Users_Id": user_id,
        "Date": now.strftime("%Y-%m-%d"),
        "Time": now.strftime("%H:%M"),
        "Volume": nb_q,
        # Option : Parcours_Id NULL car on a 3 parcours en jeu
        "Parcours_Id": None
    }).execute()

    if not entr.data:
        st.error("❌ Impossible de créer un entraînement dans Supabase")
        return

    entrainement_id = entr.data[0]["id"]

    # 1) Préparer insert Observations + groupage par type
    obs_by_type = {"Addition": [], "Soustraction": [], "Multiplication": []}
    observations_data = []

    for entry in st.session_state.answers:
        is_correct = entry["is_correct"]
        first_try_correction = entry.get("first_try_correction", False)

        score = 1 if (is_correct or first_try_correction) else -1
        etat = "VRAI" if (is_correct or first_try_correction) else "FAUX"
        correction = "OUI" if entry.get("corrected", False) else "NON"
        operation_str = entry["question"]

        type_op = _infer_type_from_operation(operation_str)

        try:
            parts = operation_str.split()
            operateur_un = int(parts[0])
            operateur_deux = int(parts[2])
        except Exception:
            operateur_un = None
            operateur_deux = None

        obs = {
            "Entrainement_Id": entrainement_id,
            "Operateur_Un": operateur_un,
            "Operateur_Deux": operateur_deux,
            "Operation": operation_str,
            "Etat": etat,
            "Correction": correction,
            "Score": score
        }
        observations_data.append(obs)
        obs_by_type[type_op].append(obs)

    if observations_data:
        supabase.table("Observations").insert(observations_data).execute()
    else:
        st.warning("⚠️ Aucune observation à insérer")

    # 2) Pour chaque type, appeler analyser_progression avec le dernier id d'obs de l'entraînement
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
        # parcours courant pour CE type (peut être None -> init dans analyser_progression)
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

    # --- DEBUG SONDE SUPABASE ---
    try:
        sonde = (
            supabase.table("Parcours")
            .select("id,Type_Operation,Niveau")
            .limit(5)
            .execute()
            .data
        )
        st.write("[SONDE] Parcours (top 5) vus par l'appli:", sonde)

        types_distincts = (
            supabase.table("Parcours")
            .select("Type_Operation")
            .execute()
            .data
        )
        st.write("[SONDE] Types vus par l'appli:", types_distincts)
    except Exception as e:
        st.error(f"[SONDE] Erreur lecture Parcours: {e}")
    # --- FIN SONDE ---

    # 🧰 Initialisation sûre : créer les 3 suivis si absents
    try:
        ensure_initial_suivi(user_id)
    except Exception as e:
        st.error(f"Erreur lors de l'initialisation du suivi : {e}")
        return

    # 📊 Stats utilisateur
    total_score = get_user_total_score(user_id)
    streak = get_user_streak(user_id)

    # 📍 Récupérer les niveaux actuels par type
    position_add = get_position_actuelle(user_id, "Addition")
    position_sous = get_position_actuelle(user_id, "Soustraction")
    position_mult = get_position_actuelle(user_id, "Multiplication")

    niveau_add = position_add["Niveau"] if position_add and "Niveau" in position_add else "—"
    niveau_sous = position_sous["Niveau"] if position_sous and "Niveau" in position_sous else "—"
    niveau_mult = position_mult["Niveau"] if position_mult and "Niveau" in position_mult else "—"

    st.title(f"Bienvenue, {user.get('name', 'Utilisateur')} 👋")
    st.markdown(f"### 🏆 Score cumulé : **{total_score}** points")
    st.markdown(f"### 🔥 Série en cours : **{streak}** jours")

    st.subheader("📚 Niveaux actuels par opération")
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown(f"**Addition**<br/>Niveau : **{niveau_add}**", unsafe_allow_html=True)
        if position_add:
            st.caption(f"BORNES: {position_add.get('Operateur1_Min','?')}-{position_add.get('Operateur1_Max','?')} et {position_add.get('Operateur2_Min','?')}-{position_add.get('Operateur2_Max','?')}")
    with c2:
        st.markdown(f"**Soustraction**<br/>Niveau : **{niveau_sous}**", unsafe_allow_html=True)
        if position_sous:
            st.caption(f"BORNES: {position_sous.get('Operateur1_Min','?')}-{position_sous.get('Operateur1_Max','?')} et {position_sous.get('Operateur2_Min','?')}-{position_sous.get('Operateur2_Max','?')}")
    with c3:
        st.markdown(f"**Multiplication**<br/>Niveau : **{niveau_mult}**", unsafe_allow_html=True)
        if position_mult:
            st.caption(f"BORNES: {position_mult.get('Operateur1_Min','?')}-{position_mult.get('Operateur1_Max','?')} et {position_mult.get('Operateur2_Min','?')}-{position_mult.get('Operateur2_Max','?')}")

    st.subheader("Combien de questions veux-tu faire aujourd’hui ?")
    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("5 questions"):
            st.session_state.nb_questions = 5
            start_new_training()
    with col2:
        if st.button("10 questions"):
            st.session_state.nb_questions = 10
            start_new_training()
    with col3:
        if st.button("50 questions"):
            st.session_state.nb_questions = 50
            start_new_training()

    st.subheader("🧩 Ton Pixel-Monstre")
    if "pixel_image" not in st.session_state:
        try:
            mask = load_monstre_mask("monstre.png")
            st.session_state.pixel_image = render_monstre_progress(int(total_score), mask)
            st.session_state.pixel_caption = f"{total_score} / {mask.sum()} pixels allumés"
        except Exception as e:
            st.warning(f"Impossible d'afficher le monstre : {e}")

    if "pixel_image" in st.session_state:
        st.image(
            st.session_state.pixel_image,
            caption=st.session_state.pixel_caption,
            use_container_width=True
        )

    colA, colB = st.columns(2)
    with colA:
        if st.button("🏆 Voir le classement"):
            st.session_state.page = "classement"
    with colB:
        if st.button("Se déconnecter"):
            st.session_state.clear()
            st.session_state.page = "login"

def mental_calc_page():
    st.title("Entraînement de calcul mental 🔢")

    # 1️⃣ Vérification et debug de l'utilisateur
    user_id = st.session_state.get("user_id")
    st.write("DEBUG user_id =", user_id)  # 👈 debug temporaire

    if not user_id:
        st.error("⚠️ Vous devez être connecté pour commencer un entraînement.")
        st.session_state.page = "login"  # Optionnel : redirige vers login
        st.stop()  # Stoppe la page pour éviter l'erreur 22P02

    # 2️⃣ Récupération du nombre de questions choisi
    nb_questions = st.session_state.get("nb_questions", 5)

    # 3️⃣ Initialisation de la session pour cet entraînement
    if "questions" not in st.session_state or not st.session_state.questions:
        questions = generate_mental_calculation(user_id, nb_questions)
        st.session_state.questions = questions
        st.session_state.current_q = 0
        st.session_state.answers = []
        st.session_state.correct = 0
        st.session_state.score = 0

    # 4️⃣ Gestion des questions
    questions = st.session_state.questions
    q_index = st.session_state.current_q

    # Si toutes les questions ont été traitées → page résultats
    if q_index >= len(questions):
        st.session_state.page = "result"
        st.rerun()
        return

    q = questions[q_index]
    st.subheader(f"Question {q_index + 1} / {len(questions)}")
    st.markdown(f"**{q['operation']} = ?**")

    user_answer = st.text_input("Ta réponse :", key=f"answer_{q_index}")

    # 5️⃣ Validation de la réponse
    if st.button("Valider"):
        try:
            is_correct = int(user_answer) == q["solution"]
        except ValueError:
            st.warning("Entre un nombre valide.")
            return

        # On enregistre la réponse
        st.session_state.answers.append({
            "question": q["operation"],
            "user_answer": user_answer,
            "correct_answer": q["solution"],
            "is_correct": is_correct,
            "corrected": False
        })

        # Passer à la question suivante
        st.session_state.current_q += 1
        st.rerun()

def result_page():
    st.title("Résultats de l'entraînement 🧠")

    total = len(st.session_state.questions)
    correct = sum(1 for a in st.session_state.answers if a["is_correct"])
    st.info(f"Tu as {correct} / {total} bonnes réponses.")

    # 1️⃣ Affichage des réponses
    for entry in st.session_state.answers:
        st.markdown(f"**Opération :** {entry['question']}")
        st.markdown(f"👉 Ta réponse : `{entry['user_answer']}`")

        if entry["is_correct"]:
            st.success("✅ Bonne réponse")
        else:
            st.error(f"❌ Mauvaise réponse. La bonne réponse était `{entry['correct_answer']}`")

        st.markdown("---")

    # 2️⃣ Boutons de navigation
    col1, col2 = st.columns(2)

    with col1:
        if st.button("Retour à l'accueil"):
            # ⚡ On log les réponses immédiatement
            log_responses_to_supabase()
            # ⚡ On reset la session sauf les réponses
            for k in ["questions", "current_q", "correct", "nb_questions", "score"]:
                st.session_state.pop(k, None)
            # ⚡ On change la page et on relance
            st.session_state.page = "home"
            st.rerun()

    with col2:
        mistakes_exist = any(not a["is_correct"] for a in st.session_state.answers)
        if mistakes_exist and st.button("Corriger mes erreurs"):
            # ⚡ On ne reset rien, pour garder answers
            st.session_state.page = "correction"
            st.rerun()

def _reset_session():
    """Nettoyage de la session pour une prochaine partie"""
    for k in ["questions", "current_q", "correct", "answers", "nb_questions", "score"]:
        st.session_state.pop(k, None)

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

