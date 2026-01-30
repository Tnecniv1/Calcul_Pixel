// src/screens/ProfileScreen.tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../theme";
import {
  UserProfile,
  getCurrentProfile,
  updateDisplayName,
  uploadAvatar,
  checkDisplayNameAvailable,
  deleteAvatar,
} from "../services/profileService";
import { getMainBadge, MainBadge } from "../services/badgeService";

// ============================================
// COMPOSANT AVATAR
// ============================================

type AvatarProps = {
  uri: string | null;
  name: string | null;
  size: number;
};

function Avatar({ uri, name, size }: AvatarProps) {
  // Generer une couleur basee sur le nom
  const getColor = (str: string) => {
    const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const initial = (name || "U")[0].toUpperCase();
  const bgColor = getColor(name || "User");

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarPlaceholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
      ]}
    >
      <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

// ============================================
// ECRAN PRINCIPAL
// ============================================

export default function ProfileScreen() {
  // State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [mainBadge, setMainBadge] = useState<MainBadge | null>(null);

  // Charger le profil et le badge
  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [data, badge] = await Promise.all([getCurrentProfile(), getMainBadge()]);
      setProfile(data);
      setDisplayName(data?.display_name || "");
      setMainBadge(badge);
    } catch (err: any) {
      setError(err?.message || "Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Verifier disponibilite du pseudo (debounced)
  useEffect(() => {
    if (!displayName || displayName.length < 3) {
      setNameAvailable(null);
      return;
    }

    // Si c'est le meme que l'actuel, c'est disponible
    if (displayName === profile?.display_name) {
      setNameAvailable(true);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingName(true);
      try {
        const available = await checkDisplayNameAvailable(displayName, profile?.user_id);
        setNameAvailable(available);
      } catch {
        setNameAvailable(null);
      } finally {
        setIsCheckingName(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [displayName, profile]);

  // Picker d'image
  const pickImage = useCallback(async () => {
    try {
      // Demander permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorisez l'acces a la galerie pour changer votre photo.");
        return;
      }

      // Ouvrir le picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setNewAvatarUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert("Erreur", "Impossible de selectionner l'image");
    }
  }, []);

  // Prendre une photo
  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission requise", "Autorisez l'acces a la camera pour prendre une photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setNewAvatarUri(result.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert("Erreur", "Impossible de prendre la photo");
    }
  }, []);

  // Menu de selection d'image
  const showImageOptions = useCallback(() => {
    Alert.alert("Changer la photo", "Choisissez une option", [
      { text: "Galerie", onPress: pickImage },
      { text: "Camera", onPress: takePhoto },
      ...(profile?.avatar_url || newAvatarUri
        ? [
            {
              text: "Supprimer",
              style: "destructive" as const,
              onPress: () => {
                setNewAvatarUri(null);
                if (profile?.avatar_url) {
                  Alert.alert(
                    "Supprimer l'avatar",
                    "Voulez-vous vraiment supprimer votre photo de profil ?",
                    [
                      { text: "Annuler", style: "cancel" },
                      {
                        text: "Supprimer",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await deleteAvatar();
                            loadProfile();
                          } catch {
                            Alert.alert("Erreur", "Impossible de supprimer l'avatar");
                          }
                        },
                      },
                    ]
                  );
                }
              },
            },
          ]
        : []),
      { text: "Annuler", style: "cancel" },
    ]);
  }, [pickImage, takePhoto, profile, newAvatarUri, loadProfile]);

  // Sauvegarder
  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      setError(null);

      // Validation du pseudo
      const trimmedName = displayName.trim();
      if (trimmedName && trimmedName.length < 3) {
        throw new Error("Le pseudo doit contenir au moins 3 caracteres");
      }
      if (trimmedName && trimmedName.length > 20) {
        throw new Error("Le pseudo ne peut pas depasser 20 caracteres");
      }
      if (trimmedName && !/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
        throw new Error("Caracteres autorises : lettres, chiffres, - et _");
      }

      // Verifier disponibilite
      if (trimmedName && trimmedName !== profile?.display_name) {
        const available = await checkDisplayNameAvailable(trimmedName, profile?.user_id);
        if (!available) {
          throw new Error("Ce pseudo est deja pris");
        }
      }

      // Upload avatar si nouveau
      if (newAvatarUri) {
        await uploadAvatar(newAvatarUri);
        setNewAvatarUri(null);
      }

      // Mettre a jour le pseudo
      if (trimmedName !== profile?.display_name) {
        await updateDisplayName(trimmedName || null);
      }

      // Recharger le profil
      await loadProfile();

      Alert.alert("Succes", "Profil mis a jour !");
    } catch (err: any) {
      setError(err?.message || "Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  }, [displayName, newAvatarUri, profile, loadProfile]);

  // Verifier si des changements ont ete faits
  const hasChanges =
    newAvatarUri !== null || (displayName.trim() !== (profile?.display_name || ""));

  // Chargement initial
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Chargement du profil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={showImageOptions} activeOpacity={0.8}>
              <Avatar
                uri={newAvatarUri || profile?.avatar_url || null}
                name={displayName || profile?.display_name}
                size={120}
              />
              <View style={styles.editBadge}>
                <Text style={styles.editBadgeText}>+</Text>
              </View>
            </TouchableOpacity>

            {/* Badge principal */}
            {mainBadge && (
              <View style={styles.mainBadgeContainer}>
                <Text style={styles.mainBadgeEmoji}>{mainBadge.emoji}</Text>
                <Text style={styles.mainBadgeName}>{mainBadge.name}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.changePhotoButton} onPress={showImageOptions}>
              <Text style={styles.changePhotoText}>Changer la photo</Text>
            </TouchableOpacity>
          </View>

          {/* Pseudo */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Pseudo</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Choisissez un pseudo..."
                placeholderTextColor={theme.colors.text + "60"}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isCheckingName && (
                <ActivityIndicator size="small" color={theme.colors.secondary} style={styles.inputIcon} />
              )}
              {!isCheckingName && nameAvailable === true && displayName.length >= 3 && (
                <Text style={[styles.inputIcon, styles.iconSuccess]}>OK</Text>
              )}
              {!isCheckingName && nameAvailable === false && (
                <Text style={[styles.inputIcon, styles.iconError]}>Pris</Text>
              )}
            </View>
            <Text style={styles.hint}>
              3-20 caracteres. Lettres, chiffres, - et _ uniquement.
            </Text>
          </View>

          {/* Erreur */}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Bouton Enregistrer */}
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasChanges || isSaving || nameAvailable === false) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving || nameAvailable === false}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={theme.colors.bg} />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            )}
          </TouchableOpacity>

          {/* Info utilisateur */}
          <View style={styles.infoSection}>
            <Text style={styles.infoLabel}>ID Utilisateur</Text>
            <Text style={styles.infoValue}>{profile?.user_id || "-"}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    alignItems: "center",
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

  // Avatar
  avatarSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  avatar: {
    backgroundColor: theme.colors.card,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontWeight: "700",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: theme.colors.bg,
  },
  editBadgeText: {
    color: theme.colors.bg,
    fontSize: 20,
    fontWeight: "700",
    marginTop: -2,
  },
  mainBadgeContainer: {
    marginTop: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,215,61,0.12)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,215,61,0.25)",
  },
  mainBadgeEmoji: {
    fontSize: 28,
  },
  mainBadgeName: {
    color: "#FFD93D",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  changePhotoButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  changePhotoText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },

  // Input
  inputSection: {
    width: "100%",
    marginBottom: 24,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    flex: 1,
    padding: 14,
    color: theme.colors.text,
    fontSize: 16,
  },
  inputIcon: {
    paddingHorizontal: 14,
    fontSize: 12,
    fontWeight: "700",
  },
  iconSuccess: {
    color: "#4ECDC4",
  },
  iconError: {
    color: theme.colors.danger,
  },
  hint: {
    color: theme.colors.text,
    opacity: 0.5,
    fontSize: 12,
    marginTop: 6,
  },

  // Error
  errorBox: {
    width: "100%",
    backgroundColor: theme.colors.danger + "20",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 14,
    textAlign: "center",
  },

  // Save button
  saveButton: {
    width: "100%",
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 32,
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  saveButtonText: {
    color: theme.colors.bg,
    fontSize: 16,
    fontWeight: "700",
  },

  // Info
  infoSection: {
    width: "100%",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  infoLabel: {
    color: theme.colors.text,
    opacity: 0.5,
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: 14,
  },
});
