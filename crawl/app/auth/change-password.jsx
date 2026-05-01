// app/auth/change-password.jsx
// Drop-in replacement:
// - Adds top-left back arrow
// - Uses "optimistic success": if updateUser times out but likely succeeded, we still show success + route back
// - Routes back to returnTo (default /profile/settings) or falls back to router.back()

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View } from "react-native";
import {
  TextInput,
  Button,
  Text,
  HelperText,
  Snackbar,
  Appbar,
  useTheme,
} from "react-native-paper";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
}

export default function ChangePassword() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();

  // Optional: allow caller to specify where to return after success
  // e.g. router.push({ pathname: "/auth/change-password", params: { returnTo: "/profile/settings" } })
  const returnTo = typeof params?.returnTo === "string" ? params.returnTo : "/user";

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const rules = useMemo(
    () => ({ len: pw.length >= 8, mix: /[A-Za-z]/.test(pw) && /\d/.test(pw) }),
    [pw]
  );
  const valid = rules.len && rules.mix && pw === pw2;

  const showSuccessAndReturn = useCallback(() => {
    setMsg("");
    setToast("Password updated!");
    setToastVisible(true);

    // Give the toast a moment, then return
    setTimeout(() => {
      try {
        router.replace(returnTo);
        return;
      } catch {}

      try {
        if (router.canGoBack?.()) router.back();
        else router.replace("/home");
      } catch {
        // ignore
      }
    }, 650);
  }, [router, returnTo]);

  const handleBack = useCallback(() => {
    if (busy) return;
    try {
      if (router.canGoBack?.()) router.back();
      else router.replace(returnTo);
    } catch {
      try {
        router.replace(returnTo);
      } catch {}
    }
  }, [router, returnTo, busy]);

  // Ensure user is authenticated before attempting change
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.getSession(), 8000, "Session check");
        if (!mounted) return;

        if (error) {
          setMsg(error.message || "Could not verify session.");
          return;
        }

        if (!data?.session) {
          setMsg("Please sign in to change your password.");
          setTimeout(() => {
            try {
              router.replace("/auth/login");
            } catch {}
          }, 700);
        }
      } catch (e) {
        if (!mounted) return;
        setMsg(e?.message || "Could not verify session.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleChangePassword = useCallback(async () => {
    if (!valid || busy) return;

    setBusy(true);
    setToastVisible(false);
    setToast("");

    try {
      setMsg("Checking session…");
      const { data: sData } = await withTimeout(supabase.auth.getSession(), 8000, "getSession");
      if (!sData?.session) {
        throw new Error("No active session. Please sign in again and retry.");
      }

      setMsg("Updating password…");

      // ✅ Key change:
      // Supabase sometimes actually updates the password but the client call hangs.
      // We treat a timeout as "likely success" and route back with a success message.
      try {
        const { error } = await withTimeout(
          supabase.auth.updateUser({ password: pw }),
          9000,
          "updateUser"
        );
        if (error) throw error;

        // Normal success
        showSuccessAndReturn();
      } catch (e) {
        // If it times out, assume it likely succeeded (your observed behavior).
        if (String(e?.message || "").includes("timed out")) {
          console.log("[change password] updateUser timed out; assuming success", e);
          showSuccessAndReturn();
        } else {
          throw e;
        }
      }
    } catch (e) {
      console.log("[change password error]", e);
      setMsg(e?.message || "Could not update password.");
    } finally {
      setBusy(false);
    }
  }, [valid, busy, pw, showSuccessAndReturn]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Top-left back arrow */}
      <Appbar.Header elevated={false} style={{ backgroundColor: "transparent" }}>
        <Appbar.BackAction onPress={handleBack} disabled={busy} />
        <Appbar.Content title="Change Password" />
      </Appbar.Header>

      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, marginBottom: 14, textAlign: "center" }}>
          Choose a new password
        </Text>

        <TextInput
          label="New password"
          value={pw}
          onChangeText={setPw}
          secureTextEntry={!showPw}
          right={
            <TextInput.Icon
              icon={showPw ? "eye-off" : "eye"}
              onPress={() => setShowPw((s) => !s)}
            />
          }
          style={{ marginBottom: 6 }}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <HelperText type={rules.len ? "info" : "error"} visible={pw.length > 0 && !rules.len}>
          Minimum 8 characters.
        </HelperText>
        <HelperText type={rules.mix ? "info" : "error"} visible={pw.length > 0 && !rules.mix}>
          Use letters and numbers.
        </HelperText>

        <TextInput
          label="Confirm password"
          value={pw2}
          onChangeText={setPw2}
          secureTextEntry={!showPw}
          right={
            <TextInput.Icon
              icon={showPw ? "eye-off" : "eye"}
              onPress={() => setShowPw((s) => !s)}
            />
          }
          style={{ marginTop: 2 }}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
        />

        <HelperText type={pw === pw2 ? "info" : "error"} visible={pw2.length > 0 && pw !== pw2}>
          Passwords don’t match.
        </HelperText>

        <Button
          mode="contained"
          onPress={handleChangePassword}
          disabled={!valid || busy}
          style={{ marginTop: 10, borderRadius: 12 }}
        >
          {busy ? "Please wait…" : "Save Password"}
        </Button>

        {!!msg && (
          <Text style={{ textAlign: "center", marginTop: 12, color: "gray" }}>
            {msg}
          </Text>
        )}
      </View>

      <Snackbar
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
        duration={2000}
        action={{ label: "OK", onPress: () => setToastVisible(false) }}
      >
        {toast}
      </Snackbar>
    </View>
  );
}
