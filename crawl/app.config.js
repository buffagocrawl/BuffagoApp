// app.config.js
/** @type {import('@expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  name: "BuffaGo",
  slug: "buffago",
  scheme: "buffago",
  version: "1.0.3",

  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },

  // Strongly recommended once you ship both platforms:
  // Keeps OTA updates compatible with native builds.
  runtimeVersion: {
    policy: "appVersion",
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.buffago.app",
    buildNumber: "9",
    associatedDomains: ["applinks:buffago.com"],
  
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
    },
  
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "BuffaGo uses your location to verify you’re at a wing stop so you can rate wings and progress through crawls.",
      LSApplicationQueriesSchemes: ["fb", "fbauth2"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: "com.buffago.app",
    versionCode: 6,

    permissions: ["ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS"],
    blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],

    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },

    config: {
      googleMaps: {
        // Read at build time by RN Maps config plugin
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
      },
    },

    intentFilters: [
      // OAuth / magic-link callback (PKCE code flow)
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "buffago", host: "auth", pathPrefix: "/callback" }],
      },
      // Password recovery deep link
      {
        action: "VIEW",
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "buffago", host: "auth", pathPrefix: "/reset" }],
      },
      // Production referral Universal Link / App Link.
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "https", host: "buffago.com", pathPrefix: "/r" }],
      },
    ],
  },

  androidNavigationBar: {
    backgroundColor: "#050607",
    barStyle: "light-content",
    enforceContrast: false,
  },

  androidStatusBar: {
    backgroundColor: "#050607",
    barStyle: "light-content",
  },

  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/icon.png",
        color: "#FFFBE9",
        sounds: [],
      },
    ],
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        // iOS only: 320 pt generates 320/640/960 px launch assets from
        // the 1024 px source. Android continues using the legacy splash config.
        ios: {
          image: "./assets/images/BuffaGo-splash.png",
          imageWidth: 320,
          resizeMode: "contain",
          backgroundColor: "#FFFBE9",
        },
      },
    ],
    // If you later use the Expo Facebook module, add "expo-facebook" too.
  ],

  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
    eas: { projectId: "f08e790e-af47-4fc1-ba5e-707a0a15f7be" },
  },

  userInterfaceStyle: "dark",
});
