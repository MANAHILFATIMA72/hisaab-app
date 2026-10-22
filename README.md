# Hisaab

A money organizer for Pakistan: track spending, set budgets, keep udhaar records, save for goals and calculate zakat. English and Urdu, works fully offline, no sign-up.

Built with Expo (SDK 58), Expo Router and an encrypted SQLite database (SQLCipher). Android first.

## What is in v1.1

| Area | Features | FRs |
|---|---|---|
| Onboarding | Guest use, profile type with matching categories, English/Urdu, currency, month start (salary) day | 01, 03–06 |
| Accounts | Cash, bank, wallet, card; opening balance and correction; transfers; total and per-account balance; hide balances | 08–12 |
| Transactions | Add/edit/delete income, expense, transfer; time; receipt photo; tags; split one bill across categories; search and filters (incl. tag); recurring (daily/weekly/monthly); category picked automatically from the note | 13–19 |
| Bank SMS paste | Copy a bank or wallet SMS: amount, income/expense, bank (HBL, Meezan, UBL, MCB, JazzCash, Easypaisa and 20+ more), card/account digits, date, time, shop or sender, balance, fee and reference are read; account selected or created; ATM withdrawals become bank → cash transfers | 20 (without SMS permission) |
| Categories | Defaults per profile, custom categories and subcategories with icon and color, edit, delete (archives if used) | 22–24 |
| Budget | Monthly budget, category limits, safe-to-spend today, progress bars, 80% and 100% alerts; quick setup (daily allowance, 50/30/20, from last 2 months); rollover; event budgets by tag (Eid, trip, shaadi) | 25–32, 34 |
| Group bills | Groups (hostel room, trip, friends) with members by name; split equally, by amount, by percent or item-wise with tax; who pays whom with fewest payments; settle up; WhatsApp summary and reminders; monthly group bills (rent, internet); my share counted in my spending | 35–42 |
| Udhaar | Money given/taken, partial repayments, to receive / to pay totals, due-date reminders, WhatsApp reminder message | 43–47 |
| Goals | Savings goals with templates (Umrah, Hajj, shaadi, education, laptop, bike, emergency fund), progress, monthly amount needed, emergency fund recommendation | 54–57 |
| Reports | Monthly summary, category donut, 6-month bars, comparison with last month, insights, net worth, PDF and CSV export, share summary | 58–63 |
| Reminders | Bill due reminders, daily "log expenses" reminder, weekly and monthly summary reminders, each one on/off | 65–68 |
| Islamic | Zakat calculator (silver or gold nisab), sadqa/charity total for the year | 75, 76 |
| Security and data | PIN lock with fingerprint, encrypted database, backup file and restore, CSV export, delete all data | 77–81 |
| Settings | Dark mode, large text, privacy note, feedback (when a support email is set) | 82, 83 |

Planned for later releases: committee (BC), shopkeeper khata, multi-currency, sign-in and sync, family sharing, SMS auto-read, voice input, admin tools. See the phased plan in the project files.

## Run it

```bash
npm install
npx expo start          # scan the QR code with a development build, or press w for the web preview
npm test                # unit tests for the money logic
npm run typecheck
npm run lint
```

SQLCipher, notifications and biometrics are native modules, so the Android app needs a development or preview build rather than Expo Go:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android      # installable APK for testing
npx eas-cli@latest build --profile production --platform android   # .aab for Google Play
```

## Project layout

```
src/app/        screens (Expo Router; every file is a route)
src/lib/        pure money logic with unit tests (budgets, periods, udhaar, zakat, reports, SMS parsing)
src/db/         SQLite schema, migrations, queries, default categories, encryption key
src/services/   notifications, budget alerts, backup/export, app lock
src/state/      app settings, translations hook, startup gate
src/i18n/       English and Urdu strings
src/ui/         shared components (kit, charts, lock screen)
docs/           privacy policy and Play Store listing drafts
```

## Notes

- Amounts are stored as integer paisa; dates as local `YYYY-MM-DD` strings.
- The database key is random per install and kept in the Android Keystore. Android auto-backup is off, because a restored database could not be opened without that key. Users back up with the in-app backup file instead.
- Urdu right-to-left layout comes from the in-app language setting, not the phone language, so the app never flips unexpectedly.
- The app requests no SMS, contacts, location, camera or microphone permissions.
