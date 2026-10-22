# Google Play listing and release checklist (v1.0)

## Store listing

**App name (30 chars max):** Hisaab: Budget & Udhaar Khata

**Short description (80 chars max)**

- EN: Track kharcha, set budgets, keep udhaar records and calculate zakat. Offline.
- UR: خرچ لکھیں، بجٹ بنائیں، اُدھار کا حساب رکھیں اور زکوٰۃ نکالیں۔ آف لائن۔

**Full description (EN)**

Hisaab is a simple money organizer made for Pakistan. Write down every rupee in seconds, see how much you can safely spend today, and never forget who owes you money.

• Safe to spend today: tells you how much you can spend each day so the month does not run out before salary day.
• Budgets that fit your month: start your month on your salary day. Set a total budget and category limits, and get an alert at 80% and 100%.
• Udhaar record: note money you lent or borrowed, record part payments, and send a polite WhatsApp reminder in one tap.
• Savings goals: Umrah, Hajj, shaadi, laptop, emergency fund. See how much to save each month.
• Zakat calculator: with silver or gold nisab, filled from your own balances. Sadqa and charity tracking too.
• Reports: monthly summary, spending by category, last 6 months and simple insights like "Food is 30% higher than last month".
• Paste bank SMS: copy a bank or JazzCash/Easypaisa message and Hisaab fills in the amount.
• Cash, bank, mobile wallet and card accounts, transfers and recurring bills.
• English and Urdu, dark mode, large text.
• Private by design: no sign-up, works offline, data is encrypted on your phone. PIN and fingerprint lock.

Made for students, salaried people, households, freelancers and shopkeepers.

**Full description (UR)**

حساب پاکستان کے لیے بنائی گئی آسان ایپ ہے جس سے آپ اپنے پیسوں کا حساب رکھ سکتے ہیں۔

• آج کتنا خرچ کر سکتے ہیں: روزانہ کی حد تاکہ تنخواہ سے پہلے مہینہ ختم نہ ہو۔
• تنخواہ کے دن سے شروع ہونے والا بجٹ، کیٹیگری کی حد اور 80٪ اور 100٪ پر الرٹ۔
• اُدھار کا حساب: دیا یا لیا، قسطوں میں واپسی، اور واٹس ایپ پر یاد دہانی۔
• بچت کے اہداف: عمرہ، حج، شادی، لیپ ٹاپ، ایمرجنسی فنڈ۔
• زکوٰۃ کیلکولیٹر اور صدقہ کا حساب۔
• ماہانہ رپورٹ، کیٹیگری کے حساب سے خرچ اور آسان مشورے۔
• بینک SMS پیسٹ کریں، رقم خود لکھی جائے گی۔
• اردو اور انگریزی، ڈارک موڈ، بڑا متن۔
• سائن اپ کی ضرورت نہیں، آف لائن، ڈیٹا فون پر محفوظ اور انکرپٹڈ۔ PIN اور فنگر پرنٹ لاک۔

**Category:** Finance
**Tags:** budget, expense tracker, personal finance
**Contact email:** required by Play (to be decided)
**Privacy policy URL:** host `docs/privacy-policy.md` (for example on GitHub Pages) and paste the link.

## Screenshots to capture (phone, 1080×1920 or similar)

1. Home with "Safe to spend today"
2. Add expense with categories
3. Budget with category limits and progress bars
4. Udhaar list with WhatsApp reminder button
5. Reports donut and 6-month chart
6. Zakat calculator
7. Same home screen in Urdu

Feature graphic: 1024×500, green (#0E7C5A) background, app name in English and Urdu, one phone mockup.

## App content declarations (Play Console → Policy → App content)

| Section            | Answer for v1.0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Privacy policy     | URL of the hosted policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ads                | **Yes, contains ads** (Google AdMob banners)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| App access         | All functionality available without login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Content rating     | Questionnaire: utility/productivity, no violence, no user-generated content shared publicly → expected rating Everyone / 3+                                                                                                                                                                                                                                                                                                                                                                                                                |
| Target audience    | 18 and over (avoids the Families policy; the app is still usable by students 18+)                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Data safety        | Collected and shared: **Device or other IDs** (advertising ID) for **Advertising or marketing** and **Analytics**, by the Google Mobile Ads SDK; also **App activity → App interactions** and **App info and performance → Crash logs, Diagnostics** for advertising and analytics. Not collected: any financial info, messages, contacts, photos, location. Data encrypted in transit: yes. Users can request deletion: yes (in-app "Delete all data"; ad ID reset in phone settings). Ad ID permission: declare **Yes, for advertising** |
| Financial features | Select "Personal finance: budgeting / expense tracking". **Do not** select loans or lending; udhaar is a personal record, the app does not lend money                                                                                                                                                                                                                                                                                                                                                                                      |
| Government app     | No                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Health             | No                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Wording rule for the listing and screenshots: say "udhaar record / hisaab kitaab", never "loan app" or "get a loan", so the app is not reviewed under the personal loan policy.

## Release steps

1. Create the Google Play developer account (personal, $25, identity verification).
2. In Play Console, create the app "Hisaab", default language English (Urdu listing added as a translation).
3. Build the bundle: `npx eas-cli@latest build --profile production --platform android`. Let EAS create and keep the upload key.
4. Upload the .aab to **Closed testing** with at least 12 testers who stay opted in for 14 days (required for new personal accounts).
5. Fix tester feedback, upload new builds to the same track.
6. Apply for production access, then roll out to production.
