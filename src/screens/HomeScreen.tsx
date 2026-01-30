import * as React from "react";
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import BigPixel from "../components/BigPixel";
import { getPixelState } from "../api";
import { useLayoutEffect } from "react";
import NotificationTestButton from '../components/NotificationTestButton';

// Calculer la taille du pixel en fonction de l'ecran
const SCREEN_WIDTH = Dimensions.get("window").width;
const PIXEL_SIZE = Math.min(SCREEN_WIDTH - 40, 280); // Max 280px, avec marges

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const COLORS = {
  bg: "#18162A",
  text: "#ffffffff",
  subtext: "#9a9ca1ff",
  orange: "#FFD93D",
  orangeText: "#171717",
  blue: "#4DB7FF",
  blueText: "#11283F",
  purple: "#B88BEB",
  purpleText: "#1A1025",
  card: "#FFFFFF",
  shadow: "rgba(0,0,0,0.08)",
};

export default function HomeScreen({ navigation }: Props) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 10 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Profile")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#4DB7FF",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "700", color: "#FFF", fontSize: 14 }}>P</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("Badges")}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: "#FFD93D",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16 }}>🏆</Text>
          </TouchableOpacity>
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate("Info")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#b648c0ff",
            justifyContent: "center",
            alignItems: "center",
            marginRight: 10,
          }}
        >
          <Text style={{ fontWeight: "600", color: "#000" }}>i</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const [pixel, setPixel] = React.useState<{ lit: number; capacity: number; ratio: number } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadPixel = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPixelState();
      setPixel({ lit: data.lit, capacity: data.capacity, ratio: data.ratio });
    } catch (e) {
      console.error("getPixelState failed:", e);
      setPixel(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPixel();
  }, [loadPixel]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>SUCCES OU ECHEC ?</Text>
          <Text style={styles.subtitle}>Parviendras-tu à remplir ton pixel ?</Text>
        </View>

        {/* Grand Pixel - Taille reduite */}
        <View style={styles.pixelBlock}>
          {loading ? (
            <View style={[styles.pixelPlaceholder, { width: PIXEL_SIZE, height: PIXEL_SIZE }]}>
              <Text style={styles.pixelPlaceholderText}>Chargement…</Text>
            </View>
          ) : pixel ? (
            <BigPixel lit={pixel.lit} cols={350} rows={350} size={PIXEL_SIZE} />
          ) : (
            <View style={[styles.pixelPlaceholder, { width: PIXEL_SIZE, height: PIXEL_SIZE }]}>
              <Text style={styles.pixelPlaceholderText}>Impossible de charger le Pixel</Text>
            </View>
          )}
        </View>

        <View style={styles.ctaBlock}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaOrange]}
            onPress={() => navigation.navigate("Entrainement")}
          >
            <Text style={styles.ctaOrangeText}>ENTRAÎNEMENT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaBlue]}
            onPress={() => navigation.navigate("Progression", { parcoursId: 1 })}
          >
            <Text style={styles.ctaBlueText}>PROGRESSION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaBlue]}
            onPress={() => navigation.navigate("Leaderboard")}
          >
            <Text style={styles.ctaBlueText}>CLASSEMENT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.cta, styles.ctaPurple]}
            onPress={() => navigation.navigate("GlobalChat")}
          >
            <Text style={styles.ctaPurpleText}>CONVERSATION</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scrollView: { flex: 1 },
  container: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  header: { marginBottom: 16, alignItems: "center" },
  title: { color: COLORS.text, fontWeight: "800", fontSize: 18 },
  subtitle: { color: COLORS.subtext, fontSize: 12, marginTop: 4 },

  pixelBlock: { alignItems: "center", marginBottom: 12 },
  pixelPlaceholder: {
    borderWidth: 1,
    borderColor: "#E5E5E5",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  pixelPlaceholderText: { color: "#6B7280" },

  ctaBlock: { gap: 14, marginTop: 12 },
  cta: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: COLORS.card,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
    alignItems: "center",
  },
  ctaOrange: { backgroundColor: COLORS.orange },
  ctaBlue: { backgroundColor: COLORS.blue },
  ctaPurple: { backgroundColor: COLORS.purple },
  ctaOrangeText: { color: COLORS.orangeText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
  ctaBlueText: { color: COLORS.blueText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
  ctaPurpleText: { color: COLORS.purpleText, fontWeight: "900", fontSize: 17, letterSpacing: 0.4 },
});
