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

def get_position_actuelle(user_id: int):
    """
    Retourne la position actuelle de l'utilisateur dans le parcours,
    en regardant la dernière ligne de Suivi_Parcours.
    Si aucune entrée, initialise au premier niveau (le plus bas).
    """
    # 1. Récupérer les suivis existants, triés par ordre croissant (plus ancien -> plus récent)
    suivi = (
        supabase.table("Suivi_Parcours")
        .select("id, Parcours_Id")
        .eq("Users_Id", user_id)
        .order("id", desc=True)  # Dernière ligne = position actuelle
        .limit(1)
        .execute()
        .data
    )

    # 1.2. Si vide → Initialisation au premier parcours
    if not suivi:
        print(f"DEBUG: Aucun suivi trouvé pour user_id={user_id}, initialisation…")

        # Prendre le premier niveau dans Parcours (trié par Niveau)
        premier_parcours = (
            supabase.table("Parcours")
            .select("*")
            .order("Niveau")  # Niveau croissant
            .limit(1)
            .execute()
            .data
        )

        if not premier_parcours:
            print("ERREUR: Aucun parcours défini dans la base.")
            return None

        parcours_id = premier_parcours[0]["id"]

        # Créer une entrée de suivi
        supabase.table("Suivi_Parcours").insert({
            "Users_Id": user_id,
            "Parcours_Id": parcours_id
        }).execute()

        return premier_parcours[0]  # Renvoie la ligne du parcours (position actuelle)

    # 1.1. Si déjà présent → On récupère le parcours associé à la dernière ligne
    parcours_id = suivi[0].get("Parcours_Id")

    if not parcours_id:
        print("ERREUR: 'Parcours_Id' manquant dans Suivi_Parcours")
        return None

    parcours = (
        supabase.table("Parcours")
        .select("*")
        .eq("id", parcours_id)
        .limit(1)
        .execute()
        .data
    )

    if parcours:
        return parcours[0]
    else:
        print(f"ERREUR: Parcours introuvable pour id={parcours_id}")
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


def analyser_progression(user_id, last_obs_id=None):
    import math
    st.write("[DEBUG] Début de l’analyse de progression")

    # 1️⃣ Récupérer le dernier suivi
    last_suivi = supabase.table("Suivi_Parcours")\
        .select("Parcours_Id,Derniere_Observation_Id,id")\
        .eq("Users_Id", user_id)\
        .order("id", desc=True)\
        .limit(1)\
        .execute().data

    # 2️⃣ Initialisation si aucun suivi
    if not last_suivi:
        st.write("[DEBUG] Initialisation du premier suivi")
        first_parcours = supabase.table("Parcours")\
            .select("id")\
            .order("id")\
            .limit(1)\
            .execute().data
        if first_parcours:
            parcours_id = first_parcours[0]["id"]
            supabase.table("Suivi_Parcours").insert({
                "Users_Id": user_id,
                "Parcours_Id": parcours_id,
                "Date": datetime.now().strftime("%Y-%m-%d"),
                "Taux_Reussite": 0,
                "Type_Evolution": "initialisation",
                "Derniere_Observation_Id": last_obs_id or 0
            }).execute()
        return

    parcours_id = last_suivi[0]["Parcours_Id"]
    last_obs_used = last_suivi[0]["Derniere_Observation_Id"]

    # 3️⃣ Récupérer le critère
    parcours_data = supabase.table("Parcours")\
        .select("Critere")\
        .eq("id", parcours_id)\
        .execute().data
    if not parcours_data:
        return
    critere_initial = parcours_data[0]["Critere"]

    # 4️⃣ Récupérer toutes les nouvelles observations depuis le dernier suivi
    observations = supabase.table("Observations")\
        .select("id,Etat")\
        .gt("id", last_obs_used)\
        .execute().data

    total_obs = len(observations)
    st.write(f"[DEBUG] Total nouvelles observations : {total_obs}")

    if total_obs < critere_initial:
        st.write("[DEBUG] Pas encore assez de données pour évaluer le test.")
        return

    # 5️⃣ Calcul du taux de réussite
    selection = observations[-critere_initial:]
    nb_bonnes = sum(1 for obs in selection if obs["Etat"] == "VRAI")
    taux = round(nb_bonnes / critere_initial, 2)
    st.write(f"[DEBUG] Taux de réussite : {taux}")

    # 6️⃣ Déterminer évolution
    evolution = "stagnation"
    if taux >= 0.8:
        evolution = "progression"
        next_parcours = supabase.table("Parcours")\
            .select("id")\
            .gt("id", parcours_id)\
            .order("id")\
            .limit(1)\
            .execute().data
        if next_parcours:
            parcours_id = next_parcours[0]["id"]
    elif taux < 0.5:
        evolution = "régression"
        prev_parcours = supabase.table("Parcours")\
            .select("id")\
            .lt("id", parcours_id)\
            .order("id", desc=True)\
            .limit(1)\
            .execute().data
        if prev_parcours:
            parcours_id = prev_parcours[0]["id"]

    # 7️⃣ Insérer le suivi mis à jour
    supabase.table("Suivi_Parcours").insert({
        "Users_Id": user_id,
        "Parcours_Id": parcours_id,
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Taux_Reussite": taux,
        "Type_Evolution": evolution,
        "Derniere_Observation_Id": last_obs_id
    }).execute()

    st.write(f"[DEBUG] Test critique enregistré : {evolution.upper()} — nouvelle position {parcours_id}")

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
    """
    Génère N additions, N soustractions et N multiplications basées sur le niveau de l'utilisateur.
    """
    st.write("DEBUG: generate_mental_calculation() appelée ✅")
    st.write("DEBUG user_id =", user_id)
    st.write("DEBUG nb_questions =", nb_questions)

    # 1️⃣ Récupération de la position (niveau actuel)
    pos = get_position_actuelle(user_id)
    if not pos:
        st.error("ERREUR: Impossible de récupérer la position utilisateur.")
        return []

    st.write("DEBUG position =", pos)

    # 2️⃣ Lire les bornes du niveau
    try:
        op1_min = pos["Operateur1_Min"]
        op1_max = pos["Operateur1_Max"]
        op2_min = pos["Operateur2_Min"]
        op2_max = pos["Operateur2_Max"]
    except KeyError as e:
        st.error(f"ERREUR: Clé manquante dans la table Parcours : {e}")
        return []

    # 3️⃣ Générer les questions par type
    questions = []

    for operateur in ["+", "-", "*"]:
        for _ in range(nb_questions):
            op1 = random.randint(op1_min, op1_max)
            op2 = random.randint(op2_min, op2_max)

            if operateur == "+":
                solution = op1 + op2
            elif operateur == "-":
                solution = op1 - op2
            elif operateur == "*":
                solution = op1 * op2

            questions.append({
                "operation": f"{op1} {operateur} {op2}",
                "solution": solution
            })

    # 4️⃣ Mélanger les opérations
    random.shuffle(questions)

    st.write("DEBUG: Nombre total de questions générées =", len(questions))
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

def log_responses_to_supabase():
    st.write("DEBUG: log_responses_to_supabase appelée")
    st.write("DEBUG: responses_logged =", st.session_state.get("responses_logged", None))
    st.write("DEBUG: answers =", st.session_state.get("answers", None))

    # ⚠️ Empêche les doublons
    if st.session_state.get("responses_logged", False):
        return

    now = datetime.now()
    user_id = st.session_state.user["id"]
    nb_q = len(st.session_state.answers)

    # 1️⃣ Créer un nouvel Entrainement
    entr = supabase.table("Entrainement").insert({
        "Users_Id": user_id,
        "Date": now.strftime("%Y-%m-%d"),
        "Time": now.strftime("%H:%M"),
        "Volume": nb_q
    }).execute()

    st.write("DEBUG Entrainement insert:", entr.data)

    # 2️⃣ Vérifie que la ligne a bien été créée
    if not entr.data:
        st.error("❌ Impossible de créer un entraînement dans Supabase")
        return

    entrainement_id = entr.data[0]["id"]

    # 3️⃣ Confirme qu'elle existe vraiment dans la DB
    exists = supabase.table("Entrainement").select("id").eq("id", entrainement_id).execute()
    st.write("DEBUG Vérification Entrainement existe:", exists.data)

    if not exists.data:
        st.error("❌ Entrainement introuvable dans la base")
        return

    # 4️⃣ Construction des Observations
    observations_data = []  # ✅ doit être toujours défini avant la boucle

    for entry in st.session_state.answers:
        is_correct = entry["is_correct"]
        first_try_correction = entry.get("first_try_correction", False)

        score = 1 if (is_correct or first_try_correction) else -1
        etat = "VRAI" if (is_correct or first_try_correction) else "FAUX"
        correction = "OUI" if entry.get("corrected", False) else "NON"
        operation_str = entry["question"]

        # Extraction des opérateurs (ex : "7 x 8")
        try:
            parts = operation_str.split()
            operateur_un = int(parts[0])
            operateur_deux = int(parts[2])
        except Exception:
            operateur_un = None
            operateur_deux = None

        observations_data.append({
            "Entrainement_Id": entrainement_id,  # ✅ clé étrangère correcte
            "Operateur_Un": operateur_un,
            "Operateur_Deux": operateur_deux,
            "Operation": operation_str,
            "Etat": etat,
            "Correction": correction,
            "Score": score
        })

    # 5️⃣ Debug : Vérifie les données à insérer
    st.write("DEBUG Observations à insérer:", observations_data)

    # 6️⃣ Insertion dans Observations (si données valides)
    if observations_data:
        supabase.table("Observations").insert(observations_data).execute()
    else:
        st.warning("⚠️ Aucune observation à insérer")

    # 7️⃣ Appelle l’analyse de progression
    try:
        last_obs_id = supabase.table("Observations") \
            .select("id") \
            .order("id", desc=True) \
            .limit(1) \
            .execute().data[0]["id"]

        analyser_progression(user_id, last_obs_id)
    except Exception as e:
        st.warning(f"⚠️ Analyse de progression impossible : {e}")

    # 8️⃣ Marque la session comme loggée
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
    total_score = get_user_total_score(user_id)
    position = get_position_actuelle(user_id)
    streak = get_user_streak(user_id)

    niveau = position["Niveau"] if position else "Inconnu"
    st.title(f"Bienvenue, {user.get('name', 'Utilisateur')} 👋")
    st.markdown(f"### 🏆 Score cumulé : **{total_score}** points")
    st.markdown(f"### 📚 Niveau actuel : **{niveau}**")
    st.markdown(f"### 🔥 Série en cours : **{streak}** jours !")

    # Pixel-Monstre
    if "pixel_image" not in st.session_state:
        try:
            mask = load_monstre_mask("monstre.png")
            st.session_state.pixel_image = render_monstre_progress(int(total_score), mask)
            st.session_state.pixel_caption = f"{total_score} / {mask.sum()} pixels allumés"
        except Exception as e:
            st.warning(f"Impossible d'afficher le monstre : {e}")

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
    if "pixel_image" in st.session_state:
        st.image(st.session_state.pixel_image,
                 caption=st.session_state.pixel_caption,
                 use_container_width=True)

    if st.button("🏆 Voir le classement"):
        st.session_state.page = "classement"

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

