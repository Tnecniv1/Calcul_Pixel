import streamlit as st
import json
import os
import bcrypt
import random
from datetime import datetime
from PIL import Image
import numpy as np
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime
from supabase import create_client

# --- Connexion Supabase ---
supabase = create_client(st.secrets["SUPABASE_URL"], st.secrets["SUPABASE_KEY"])
supabase_url = st.secrets["SUPABASE_URL"]
supabase_key = st.secrets["SUPABASE_KEY"]
supabase = create_client(supabase_url, supabase_key)


# --- OpenAI ---
load_dotenv()
client = OpenAI(api_key=st.secrets["OPENAI_API_KEY"])

# --- Initialisation état Streamlit ---
if "page" not in st.session_state:
    st.session_state.page = "login"


# --------------------- UTILISATEURS ---------------------

def login_page():
    st.title("Connexion")

    email = st.text_input("Adresse email")
    password = st.text_input("Mot de passe", type="password")

    if st.button("Se connecter"):
        # Récupère l'utilisateur par email
        response = supabase.table("Users")\
            .select("id, name, email, password_hash")\
            .eq("email", email)\
            .execute()
        user_data = response.data

        if user_data and len(user_data) > 0:
            user = user_data[0]

            # 🔹 Vérification bcrypt
            stored_hash = user["password_hash"]
            if bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")):
                st.success("Connexion réussie ✅")
                st.session_state.user = {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"]
                }
                st.session_state.page = "home"
                st.rerun()
            else:
                st.error("Mot de passe incorrect ❌")
        else:
            st.error("Utilisateur introuvable ❌")

    if st.button("Créer un compte"):
        st.session_state.page = "signup"

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

def get_user_total_score(user_id):
    # Récupère toutes les observations liées à l'utilisateur
    entrainements = supabase.table("Entrainement").select("id").eq("Users_Id", user_id).execute().data or []
    if not entrainements:
        return 0
    entrainement_ids = [e["id"] for e in entrainements]
    observations = supabase.table("Observation").select("Score,Entrainement_Id").in_("Entrainement_Id", entrainement_ids).execute().data or []
    return sum(obs["Score"] for obs in observations)

def get_position_actuelle(user_id):
    suivi = supabase.table("Suivi_Parcours").select("Parcours_Id").eq("Users_Id", user_id).order("id", desc=True).limit(1).execute().data
    if not suivi:
        return {"sujet": "Comptage", "Lecon": "Les nombres de 0 a 9", "niveau": "Maternelle"}
    parcours_id = suivi[0]["Parcours_Id"]
    parcours = supabase.table("Parcours").select("Sujet,Lecon,Niveau").eq("id", parcours_id).execute().data
    if not parcours:
        return {"sujet": "Comptage", "Lecon": "Les nombres de 0 a 9", "niveau": "Maternelle"}
    row = parcours[0]
    return {"sujet": row["Sujet"], "Lecon": row["Lecon"], "niveau": row["Niveau"]}

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
    observations = supabase.table("Observation")\
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
    observations = supabase.table("Observation").select("Score,Entrainement_Id").execute().data or []
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

def generate_calcul_mental_batch(user_id, volume):
    difficulte = get_user_difficulty(user_id)
    questions = []

    # Définir bornes selon difficulté
    if difficulte <= 10:
        min_val, max_val = 1, 10
    elif difficulte <= 20:
        min_val, max_val = 1, 20
    elif difficulte <= 30:
        min_val, max_val = 1, 50
    else:
        min_val, max_val = 1, 100

    # 1️⃣ Additions
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        questions.append({"problem": f"{x} + {y}", "answer": x + y, "type": "addition"})

    # 2️⃣ Soustractions
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        x, y = max(x, y), min(x, y)  # éviter négatifs
        questions.append({"problem": f"{x} - {y}", "answer": x - y, "type": "soustraction"})

    # 3️⃣ Multiplications
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        questions.append({"problem": f"{x} x {y}", "answer": x * y, "type": "multiplication"})

    return questions

def save_exercice_to_supabase(question_data, parcours_id):
    """Enregistre un exercice généré dans la table Exercices."""
    try:
        supabase.table("Exercices").insert({
            "Parcours_Id": parcours_id,
            "Origine": "GPT",
            "Probleme": question_data["question"],
            "Solution": question_data["answer"],
            "Choix_Un": question_data["choices"][0],
            "Choix_Deux": question_data["choices"][1],
            "Choix_Trois": question_data["choices"][2],
            "Choix_Quatre": question_data["choices"][3],
            "Indice_Un": question_data["hints"][0] if len(question_data["hints"]) > 0 else None,
            "Indice_Deux": question_data["hints"][1] if len(question_data["hints"]) > 1 else None,
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
    # ✅ Empêche une double exécution
    if st.session_state.get("responses_logged", False):
        return

    now = datetime.now()
    user_id = st.session_state.user["id"]
    nb_q = len(st.session_state.answers)

    # 1️⃣ Créer un Entrainement
    entr = supabase.table("Entrainement").insert({
        "Users_Id": user_id,
        "Date": now.strftime("%Y-%m-%d"),
        "Time": now.strftime("%H:%M"),
        "Volume": nb_q
    }).execute()
    entrainement_id = entr.data[0]["id"]

    # 2️⃣ Préparer les observations à insérer en batch
    observations_data = []
    for entry in st.session_state.answers:
        is_correct = entry["is_correct"]
        first_try_correction = entry.get("first_try_correction", False)

        # 🔹 Calcul du score final
        if is_correct:
            score = 1
        elif first_try_correction:
            score = 1
        else:
            score = -1

        etat = "VRAI" if is_correct or first_try_correction else "FAUX"
        correction = "OUI" if entry.get("corrected", False) else "NON"

        observations_data.append({
            "Entrainement_Id": entrainement_id,
            "Question": entry["question"],
            "Etat": etat,
            "Correction": correction,
            "Score": score
        })

    # 3️⃣ Insérer toutes les observations d’un coup
    inserted = supabase.table("Observation").insert(observations_data).execute()

    # 4️⃣ Récupérer l’ID de la dernière observation
    last_obs_id = max(obs["id"] for obs in inserted.data)

    # 5️⃣ Analyser la progression immédiatement
    try:
        analyser_progression(user_id, last_obs_id)
    except Exception as e:
        st.warning(f"⚠️ Impossible d'analyser la progression : {e}")

    # 6️⃣ Marquer comme déjà loggé pour éviter doublon
    st.session_state.responses_logged = True

# --------------------- PAGES ---------------------

def home_page():
    if "user" in st.session_state:
        user_id = st.session_state.user["id"]
        total_score = get_user_total_score(user_id)
        position = get_position_actuelle(user_id)
        streak = get_user_streak(user_id)

        st.markdown(f"### 🏆 Score cumulé : **{total_score}** points")
        st.markdown(f"### 📚 Niveau {position['niveau']} : **{position['sujet']} | {position['Lecon']}**")
        st.markdown(f"### 🔥 Série en cours : **{streak}** jours !")

        if "pixel_image" not in st.session_state:
            try:
                mask = load_monstre_mask("monstre.png")
                st.session_state.pixel_image = render_monstre_progress(int(total_score), mask)
                st.session_state.pixel_caption = f"{total_score} / {mask.sum()} pixels allumés"
            except Exception as e:
                st.warning(f"Impossible d'afficher le monstre : {e}")

    user = st.session_state.get("user", {"name": "Utilisateur"})
    st.title(f"Bienvenue, {user['name']} 👋")
    st.subheader("Combien d'opérations veux-tu faire aujourd'hui ?")

    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("5 calculs"):
            st.session_state.nb_questions = 5
            st.session_state.page = "calcul_mental"
    with col2:
        if st.button("10 calculs"):
            st.session_state.nb_questions = 10
            st.session_state.page = "calcul_mental"
    with col3:
        if st.button("50 calculs"):
            st.session_state.nb_questions = 50
            st.session_state.page = "calcul_mental"

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


def get_user_difficulty(user_id):
    suivi = supabase.table("Suivi_Parcours")\
        .select("Parcours_Id")\
        .eq("Users_Id", user_id)\
        .order("id", desc=True)\
        .limit(1)\
        .execute().data
    
    if not suivi:
        return 1  # difficulté minimale par défaut
    
    parcours_id = suivi[0]["Parcours_Id"]
    parcours = supabase.table("Parcours")\
        .select("Difficulte")\
        .eq("id", parcours_id)\
        .execute().data
    
    return parcours[0]["Difficulte"] if parcours else 1


def generate_calcul_mental_batch(user_id, volume):
    """Génère un batch ordonné de calculs mentaux selon la difficulté utilisateur"""
    difficulte = get_user_difficulty(user_id)
    questions = []

    # Paramétrage dynamique selon difficulté
    if difficulte <= 10:
        min_val, max_val = 1, 10
    elif difficulte <= 20:
        min_val, max_val = 1, 20
    elif difficulte <= 30:
        min_val, max_val = 1, 50
    else:
        min_val, max_val = 1, 100

    # --- Additions
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        questions.append({"problem": f"{x} + {y}", "answer": x + y, "type": "addition"})

    # --- Soustractions
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        x, y = max(x, y), min(x, y)  # éviter négatifs
        questions.append({"problem": f"{x} - {y}", "answer": x - y, "type": "soustraction"})

    # --- Multiplications
    for _ in range(volume):
        x, y = random.randint(min_val, max_val), random.randint(min_val, max_val)
        questions.append({"problem": f"{x} x {y}", "answer": x * y, "type": "multiplication"})

    return questions


def calcul_mental_page():
    st.title("🧠 Session de Calcul Mental")

    # Initialisation session
    if "questions" not in st.session_state:
        user_id = st.session_state.user["id"]
        volume = st.session_state.get("nb_questions", 5)
        st.session_state.questions = generate_calcul_mental_batch(user_id, volume)
        st.session_state.current_q = 0
        st.session_state.answers = []
        st.session_state.current_answer = ""

    q = st.session_state.questions[st.session_state.current_q]

    # Conteneur centré
    with st.container():
        st.markdown(
            """
            <div style="display:flex;justify-content:center;">
                <div style="background-color:#f9f9f9;padding:30px;border-radius:15px;width:300px;text-align:center;box-shadow:0px 0px 10px rgba(0,0,0,0.1);">
            """,
            unsafe_allow_html=True
        )

        st.subheader(f"Question {st.session_state.current_q + 1}/{len(st.session_state.questions)}")
        st.markdown(f"### {q['problem']}")
        st.markdown(f"**Réponse actuelle :** {st.session_state.current_answer or '_'}")

        # --- Calculette
        digits = list(map(str, range(10)))
        random.shuffle(digits)

        # Formulaire pour éviter rerun multiples
        with st.form(key=f"calc_form_{st.session_state.current_q}"):
            cols = st.columns(5)
            for i, digit in enumerate(digits):
                if cols[i % 5].form_submit_button(digit):
                    st.session_state.current_answer += digit

            col_del, col_val = st.columns(2)
            if col_del.form_submit_button("🗑"):
                st.session_state.current_answer = st.session_state.current_answer[:-1]
            if col_val.form_submit_button("✅ Valider"):
                # Stocker la réponse
                st.session_state.answers.append(int(st.session_state.current_answer or 0))
                st.session_state.current_answer = ""
                if st.session_state.current_q + 1 < len(st.session_state.questions):
                    st.session_state.current_q += 1
                else:
                    st.session_state.page = "result"
                st.rerun()

        st.markdown("</div></div>", unsafe_allow_html=True)


def result_page():
    st.title("Résultats de la session 🧠")
    total = len(st.session_state.questions)
    score = st.session_state.correct
    st.success(f"Tu as obtenu {score} / {total} bonnes réponses ✅")
    st.info(f"💯 Score total : {st.session_state.get('score', 0)} points")

    for entry in st.session_state.answers:
        st.write(f"- **Q:** {entry['question']}")
        st.write(f"   👉 Ta réponse : `{entry['user_answer']}`")
        if entry["is_correct"]:
            st.markdown("✅ **Bonne réponse**")
        else:
            st.markdown(f"❌ Mauvaise réponse !")
        st.markdown("---")

    if any(not e["is_correct"] for e in st.session_state.answers):
        if st.button("Corriger mes erreurs"):
            st.session_state.page = "correction"
            st.rerun()

    if st.button("Retour à l’accueil"):
        log_responses_to_supabase()
        for k in ["questions", "current_q", "correct", "answers", "nb_questions", "score"]:
            st.session_state.pop(k, None)
        st.session_state.page = "home"

def correction_page():
    st.title("Correction interactive des erreurs 🛠️")
    if "correction_index" not in st.session_state:
        st.session_state.correction_index = 0
        st.session_state.attempts = 0
    erreurs = [e for e in st.session_state.answers if not e["is_correct"]]
    if st.session_state.correction_index >= len(erreurs):
        st.success("Tu as terminé toutes les corrections 👏")
        if st.button("Retour à l’accueil"):
            log_responses_to_supabase()
            for k in ["correction_index", "attempts", "hint_index", "questions", "current_q", "correct", "answers", "nb_questions", "score"]:
                st.session_state.pop(k, None)
            st.session_state.page = "home"
        return

    current = erreurs[st.session_state.correction_index]
    st.subheader(f"Question {st.session_state.correction_index + 1} sur {len(erreurs)}")
    st.write(current["question"])
    hints = current.get("hints", ["Pas d’indice disponible."])
    if "hint_index" not in st.session_state:
        st.session_state.hint_index = 0
    if st.session_state.hint_index < len(hints):
        st.info(f"💡 Indice : {hints[st.session_state.hint_index]}")
    else:
        st.warning("Tu as vu tous les indices. Essaie encore.")

    for choice in current["choices"]:
        if st.button(choice):
            if choice == current["correct_answer"]:
                st.success("✅ Bonne réponse !")

                # 🔹 Marquer la correction dans la session
                current["corrected"] = True
                current["first_try_correction"] = (st.session_state.attempts == 0)

                # 🔹 Ajustement du score affiché
                if st.session_state.attempts == 0:
                    # On annule le -1 initial et on donne +1 net
                    st.session_state.score += 2  # (-1 initial +2 = +1 final)
                else:
                    # On ne change rien : le score reste à -1
                    pass

                # 🔹 Passage à la question suivante
                st.session_state.correction_index += 1
                st.session_state.hint_index = 0
                st.session_state.attempts = 0
                st.rerun()

            else:
                st.session_state.hint_index += 1
                st.session_state.attempts += 1
                st.error("❌ Mauvaise réponse")
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
elif st.session_state.page == "calcul_mental":
    calcul_mental_page()
elif st.session_state.page == "result":
    result_page()
elif st.session_state.page == "correction":
    correction_page()
elif st.session_state.page == "classement":
    classement_page()



