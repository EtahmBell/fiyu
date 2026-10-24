import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { authErrorMessage } from "@/auth/service";
import { colors, fontFamilies, radii, spacing } from "@/design";

export function AuthScreen({ mode }: { mode: "signin" | "signup" }) {
  const signup = mode === "signup";
  const auth = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const submit = async () => {
    if (submitting) return;
    const normalizedIdentifier = identifier.trim();
    const normalizedUsername = username.trim().replace(/^@+/, "");
    if (!normalizedIdentifier || !password) return setError("Enter your account details to continue.");
    if (signup && !/^\S+@\S+\.\S+$/.test(normalizedIdentifier)) return setError("Enter a valid email address.");
    if (signup && !/^[a-zA-Z0-9_]{3,30}$/.test(normalizedUsername)) return setError("Username must use 3–30 letters, numbers, or underscores.");
    setSubmitting(true);
    setError(null);
    try {
      if (signup) {
        const result = await auth.signUp({ email: normalizedIdentifier, password, username: normalizedUsername });
        if (result.emailVerificationRequired) setVerificationEmail(result.email);
      } else {
        await auth.signIn({ identifier: normalizedIdentifier, password });
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (verificationEmail) {
    return (
      <View style={styles.centeredPage}>
        <Text style={styles.brand}>Fiyu</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.copy}>We sent a verification link to {verificationEmail}.</Text>
        <Link href="/(auth)/sign-in" style={styles.link}>Return to sign in</Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Fiyu</Text>
        <Text style={styles.title}>{signup ? "Create your account" : "Welcome back"}</Text>
        <Text style={styles.copy}>{signup ? "Start your Fiyu account." : "Sign in to continue to Fiyu."}</Text>
        <View style={styles.form}>
          <Text style={styles.label}>{signup ? "Email" : "Email or username"}</Text>
          <TextInput accessibilityLabel={signup ? "Email" : "Email or username"} autoCapitalize="none" autoCorrect={false} inputMode={signup ? "email" : "text"} onChangeText={setIdentifier} style={styles.input} value={identifier} />
          <Text style={styles.label}>Password</Text>
          <TextInput accessibilityLabel="Password" autoCapitalize="none" onChangeText={setPassword} secureTextEntry style={styles.input} value={password} />
          {signup ? <><Text style={styles.label}>Username</Text><TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} onChangeText={setUsername} style={styles.input} value={username} /></> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void submit()} style={[styles.submit, submitting && styles.disabled]}>
            <Text style={styles.submitText}>{submitting ? "Please wait…" : signup ? "Create account" : "Sign in"}</Text>
          </Pressable>
        </View>
        <Text style={styles.switchCopy}>
          {signup ? "Already have an account? " : "New to Fiyu? "}
          <Link href={signup ? "/(auth)/sign-in" : "/(auth)/sign-up"} style={styles.link}>{signup ? "Sign in" : "Sign up"}</Link>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing[6] },
  centeredPage: { flex: 1, justifyContent: "center", padding: spacing[6], backgroundColor: colors.canvas },
  brand: { color: colors.ink, fontFamily: fontFamilies.display, fontSize: 28 },
  title: { marginTop: spacing[8], color: colors.ink, fontFamily: fontFamilies.display, fontSize: 40, lineHeight: 46 },
  copy: { marginTop: spacing[3], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 15, lineHeight: 23 },
  form: { marginTop: spacing[8] },
  label: { marginTop: spacing[4], marginBottom: spacing[2], color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: radii.control, backgroundColor: colors.surface, paddingHorizontal: spacing[3], color: colors.ink, fontFamily: fontFamilies.body, fontSize: 16 },
  error: { marginTop: spacing[4], color: colors.roseDust, fontFamily: fontFamilies.body, fontSize: 14, lineHeight: 21 },
  submit: { alignItems: "center", justifyContent: "center", minHeight: 50, marginTop: spacing[6], borderRadius: radii.control, backgroundColor: colors.plum },
  disabled: { opacity: 0.55 },
  submitText: { color: colors.surface, fontFamily: fontFamilies.bodyMedium, fontSize: 15 },
  switchCopy: { marginTop: spacing[6], color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 14, textAlign: "center" },
  link: { color: colors.lavender[700], fontFamily: fontFamilies.bodySemiBold },
});
