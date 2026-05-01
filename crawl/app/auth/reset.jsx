// app/auth/reset.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, AppState, Platform } from "react-native";
import * as Linking from "expo-linking";
import { ActivityIndicator, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

// Parse params from both ?query and #hash
function parseAllParams(incomingUrl) {
  if (!incomingUrl) return {};
  const { queryParams = {} } = Linking.parse(incomingUrl);
  // Manually parse hash (Linking.parse drops it)
  const hashIndex = incomingUrl.indexOf("#");
  let fragParams = {};
  if (hashIndex >= 0) {
    const hash = incomingUrl.slice(hashIndex + 1);
    const usp = new URLSearchParams(hash);
    fragParams = Object.fromEntries(usp.entries());
  }
  // Also manually parse query to cover rare parse mismatches
  const qIndex = incomingUrl.indexOf("?");
  let qParams = {};
  if (qIndex >= 0) {
    const qs = incomingUrl.slice(qIndex + 1).split("#")[0];
    const usp = new URLSearchParams(qs);
    qParams = Object.fromEntries(usp.entries());
  }
  return { ...qParams, ...queryParams, ...fragParams };
}

export default function ResetCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Preparing password reset…");
  const [urlFromHook, setUrlFromHook] = useState(Linking.useURL() ?? null);
  const [initialUrl, setInitialUrl] = useState(null);
  const processedRef = useRef(false);
  const retryTimerRef = useRef(null);

  // Keep urlFromHook updated even if the first call returned null
  useEffect(() => {
    const sub = Linking.addEventListener("url", (e) => {
      setUrlFromHook(e?.url ?? null);
    });
    return () => sub.remove();
  }, []);

  // Grab initial URL (can arrive slightly late on cold start)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const first = await Linking.getInitialURL();
        if (mounted && first) setInitialUrl(first);
      } catch {/* ignore */}
    })();
    return () => { mounted = false; };
  }, []);

  // On Android, sometimes the intent arrives only after resume
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active" && !processedRef.current) {
        const maybe = await Linking.getInitialURL();
        if (maybe && !initialUrl) setInitialUrl(maybe);
      }
    });
    return () => sub.remove();
  }, [initialUrl]);

  const url = urlFromHook || initialUrl;
  const params = useMemo(() => parseAllParams(url), [url]);

  // Core runner with a short retry window to avoid false “missing” errors
  useEffect(() => {
    let cancelled = false;

    const tryProcess = async () => {
      if (processedRef.current || cancelled) return;

      // No URL yet → wait up to ~2 seconds (in 200ms steps)
      if (!url) {
        setMsg("Waiting for recovery link…");
        let attempts = 0;
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = setInterval(async () => {
          if (processedRef.current || cancelled) return clearInterval(retryTimerRef.current);
          attempts += 1;
          const late = await Linking.getInitialURL();
          if (late) {
            setInitialUrl(late);
            clearInterval(retryTimerRef.current);
          } else if (attempts >= 10) {
            clearInterval(retryTimerRef.current);
            // Keep a gentle message; user can tap email again if scanners burned the OTP
            setMsg("Still waiting for recovery link… Try tapping the email button again.");
          }
        }, 200);
        return;
      }

      try {
        const {
          access_token,
          refresh_token,
          code,
          error_description,
          token,
          type,
        } = params;

        if (error_description) {
          throw new Error(decodeURIComponent(String(error_description)));
        }

        // PKCE code path
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(String(code));
          if (error) throw error;
        }
        // Direct session tokens path
        else if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: String(access_token),
            refresh_token: String(refresh_token),
          });
          if (error) throw error;
        }
        // Rare legacy recovery token
        else if (token && type === "recovery") {
          // Supabase normally doesn’t send this without session; advise user to resend
          throw new Error("Recovery link missing session tokens. Please request a new reset email.");
        } else {
          // If we got a URL but it lacks params, wait a beat once more on Android
          if (Platform.OS === "android") {
            const late = await Linking.getInitialURL();
            if (late && late !== url) {
              setInitialUrl(late);
              return;
            }
          }
          throw new Error("Recovery parameters missing.");
        }

        processedRef.current = true;
        if (!cancelled) {
          // All set — go change password
          router.replace("/auth/change-password");
        }
      } catch (e) {
        if (!cancelled) {
          setMsg(e?.message || "Could not complete password reset.");
        }
      }
    };

    tryProcess();
    return () => {
      cancelled = true;
      clearInterval(retryTimerRef.current);
    };
  }, [url, params, router]);

  // Minimal on-screen debug (redact tokens yourself if you screenshot)
  const debug = (() => {
    try {
      const safe = { url, params: Object.keys(params || {}).length };
      return JSON.stringify(safe, null, 2);
    } catch {
      return String(url || "");
    }
  })();

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 12, textAlign: "center" }}>{msg}</Text>
      <Text selectable style={{ marginTop: 16, fontSize: 12, opacity: 0.6 }} numberOfLines={6}>
        Debug → {debug}
      </Text>
    </View>
  );
}
