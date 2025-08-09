import itertools
import math

# Définition des classes et sous-classes
def generate_classes():
    classes = {}
    letters = ['A', 'B', 'C', 'D', 'E', 'F']
    powers = [1, 10, 100, 1000, 10000, 100000]

    for i, letter in enumerate(letters):
        start = powers[i]
        end = powers[i+1] - 1 if i + 1 < len(powers) else (10 * powers[i]) - 1
        num_digits = len(str(start))
        if letter == 'A':
            parts = 2
        else:
            parts = num_digits

        interval_size = math.ceil((end - start + 1) / parts)
        sub_intervals = []

        for j in range(parts):
            sub_start = start + j * interval_size
            sub_end = min(sub_start + interval_size - 1, end)
            sub_intervals.append((f"{letter}{j+1}", sub_start, sub_end))
        
        # Also add the full class as letter only
        classes[letter] = [(letter, start, end)]
        classes[letter] += sub_intervals

    return classes

# Génère les couples ordonnés selon logique de croisement
def generate_ordered_pairs(classes):
    ordered_pairs = []
    seen_pairs = set()

    def add_pair(a, b):
        key = (a[0], b[0])
        if key not in seen_pairs:
            seen_pairs.add(key)
            ordered_pairs.append((a, b))

    # A x A
    for pair in itertools.product(classes['A'][1:], repeat=2):
        add_pair(*pair)

    # pour chaque classe suivante
    for letter in ['B', 'C', 'D', 'E', 'F']:
        # Sous-classes uniquement (on ignore la classe globale à cette étape)
        subs = classes[letter][1:]

        # Étape 1 : croise chaque sous-classe avec TOUTES les classes précédentes (incluant leur sous-classes + leur lettre)
        for sub in subs:
            for prev_letter in classes:
                if prev_letter == letter:
                    break
                for prev in classes[prev_letter]:
                    add_pair(sub, prev)

        # Étape 2 : croisement interne
        for i in range(len(subs)):
            for j in range(i + 1):
                add_pair(subs[i], subs[j])

        # Étape 3 : ajoute croisement global avec classe complète
        add_pair(classes[letter][0], classes[letter][0])

    return ordered_pairs

# Génère les niveaux avec un type d'opération
def generate_levels(classes, operation_type):
    pairs = generate_ordered_pairs(classes)
    parcours = []

    for niveau, (op1, op2) in enumerate(pairs[:100], 1):  # Limite à 100 niveaux
        record = {
            "Niveau": niveau,
            "Operateur1_Min": op1[1],
            "Operateur1_Max": op1[2],
            "Operateur2_Min": op2[1],
            "Operateur2_Max": op2[2],
            "Type_Operation": operation_type
        }
        parcours.append(record)

    return parcours

# Exemple d'insertion fictive dans Supabase (remplacer par ta logique)
def insert_into_supabase(parcours):
    from supabase import create_client, Client
    import os

    # Assure-toi que tes variables sont bien définies
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    supabase: Client = create_client(url, key)

    for row in parcours:
        supabase.table("Parcours").insert(row).execute()

# Programme principal
if __name__ == "__main__":
    classes = generate_classes()
    for operation in ["addition", "soustraction", "multiplication"]:
        niveaux = generate_levels(classes, operation)
        # Pour test local
        for row in niveaux[:5]:
            print(row)
        # Décommente pour insérer dans Supabase :
        # insert_into_supabase(niveaux)
