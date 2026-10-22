// Adds keep rules that R8 needs in release builds. Without them R8 strips the generated
// Room database class that WorkManager (pulled in by Google Mobile Ads) creates by reflection,
// and the app crashes on launch with "Failed to create an instance of androidx.work.impl.WorkDatabase".
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const RULES = `
# Room databases are created by reflection (WorkManager, used by Google Mobile Ads)
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.** { *; }
`;

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.readFileSync(file, 'utf8');
      if (!current.includes('androidx.room.RoomDatabase')) fs.writeFileSync(file, current + RULES);
      return cfg;
    },
  ]);
};
