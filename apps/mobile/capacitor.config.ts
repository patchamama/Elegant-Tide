import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.elegantTide.app',
  appName: 'Elegant Tide',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Preferences: {
      // Uses Android SharedPreferences — secure enough for non-sensitive config
    },
  },
}

export default config
