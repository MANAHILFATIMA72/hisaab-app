// Guesses a category from free text (a note, a shop name or a pasted SMS).
// Rules return category keys in priority order; the caller picks the first one the user actually has,
// so a student gets "canteen" for chai while everyone else gets "food".

type Rule = { keys: string[]; re: RegExp };

const EXPENSE_RULES: Rule[] = [
  { keys: ['hostel_rent', 'rent'], re: /\b(hostel|room rent|rent|kiraya makan|pg|flat rent)\b/i },
  { keys: ['mess', 'food'], re: /\b(mess|tiffin|hostel food)\b/i },
  {
    keys: ['canteen', 'food'],
    re: /\b(chai|tea|canteen|cafeteria|samosa|paratha|coffee|juice|shake|fries|roll|shawarma|cold ?drink|snacks?)\b/i,
  },
  {
    keys: ['food'],
    re: /\b(food ?panda|kfc|mc ?donald'?s?|pizza|burger|hardee'?s|subway|domino'?s|restaurant|biryani|karahi|bbq|dhaba|khana|lunch|dinner|breakfast|nashta|cheezious|optp|savour|ginsoy|kababjees|dine|eat|meal|food)\b/i,
  },
  {
    keys: ['groceries'],
    re: /\b(grocery|groceries|ration|imtiaz|carrefour|al[- ]?fatah|metro cash|chase ?up|naheed|sabzi|doodh|milk|kiryana|karyana|utility store|panda ?mart|airlift|daraz mart)\b/i,
  },
  {
    keys: ['transport'],
    re: /\b(careem|uber|in ?drive(?:r)?|bykea|yango|petrol|fuel|pso|shell|total ?parco|attock petroleum|rickshaw|rikshaw|chingchi|bus|metro bus|orange line|van|fare|cng|parking|motorway|toll|m-tag)\b/i,
  },
  {
    keys: ['trips', 'fun'],
    re: /\b(trip|tour|daewoo|faisal movers|skyways|pia|airblue|serene air|air sial|train|railway|hotel|booking\.com|murree|naran|hunza)\b/i,
  },
  {
    keys: ['internet', 'bills'],
    re: /\b(ptcl|nayatel|storm ?fiber|wi-?fi|internet|fiber|transworld|wateen|cybernet|evo)\b/i,
  },
  {
    keys: ['mobile'],
    re: /\b(load|easy ?load|jazz|zong|telenor|ufone|onic|bundle|mobile package|recharge|top ?up)\b/i,
  },
  {
    keys: ['bills'],
    re: /\b(k-?electric|lesco|iesco|mepco|fesco|pesco|gepco|hesco|qesco|sngpl|ssgc|sui gas|bijli|electricity|gas bill|water bill|wasa|utility bill)\b/i,
  },
  {
    keys: ['health'],
    re: /\b(pharmacy|medical|dawai|dawa|medicine|doctor|clinic|hospital|lab test|chughtai|shifa|fazal din|servaid|dvago|dentist)\b/i,
  },
  {
    keys: ['subscriptions', 'fun'],
    re: /\b(netflix|spotify|youtube premium|prime video|disney|chat ?gpt|openai|canva|apple\.com|google play|icloud|tamasha|myco|subscription)\b/i,
  },
  { keys: ['printing', 'books'], re: /\b(photo ?copy|photostat|print(?:ing|out)?s?|xerox|binding)\b/i },
  {
    keys: ['books'],
    re: /\b(books?|stationery|stationary|copies|register|pens?|notebook|liberty books|paramount|calculator|assignment)\b/i,
  },
  {
    keys: ['fees'],
    re: /\b(fee|fees|tuition fee|semester|admission|university|uni|college|school|challan|exam|registration)\b/i,
  },
  { keys: ['laundry', 'other_expense'], re: /\b(laundry|dhobi|ironing|dry ?clean(?:ing)?|washing)\b/i },
  {
    keys: ['personal_care', 'shopping'],
    re: /\b(salon|barber|hair ?cut|nai|parlou?r|cosmetics?|shampoo|skin ?care|makeup|perfume)\b/i,
  },
  { keys: ['gym', 'health'], re: /\b(gym|fitness|workout|protein)\b/i },
  { keys: ['outings', 'fun'], re: /\b(outing|hangout|treat|party|picnic|friends|dosto|dost|get ?together)\b/i },
  {
    keys: ['fun'],
    re: /\b(cinema|movie|cinepax|nueplex|universal cinema|game|gaming|playstation|bowling|arcade|concert)\b/i,
  },
  { keys: ['gifts', 'shopping'], re: /\b(gift|tohfa|present|birthday|bday)\b/i },
  {
    keys: ['shopping'],
    re: /\b(daraz|khaadi|outfitters|sapphire|gul ahmed|bonanza|limelight|alkaram|ideas|shoes?|bata|servis|clothes|kapray|kapde|temu|ali ?express|amazon|shein|mall)\b/i,
  },
  {
    keys: ['charity'],
    re: /\b(sadqa|sadaqa|sadqah|zakat|khairat|charity|donation|edhi|chhipa|shaukat khanum|masjid|mosque|alkhidmat)\b/i,
  },
  { keys: ['family'], re: /\b(ammi|ami|abbu|abu|family|ghar|parents|bhai|behan|sister|brother)\b/i },
  { keys: ['committee'], re: /\b(committee|bc|kameti)\b/i },
  { keys: ['kids'], re: /\b(kids?|bachay|bachon|diapers?|pampers|toys?)\b/i },
];

const INCOME_RULES: Rule[] = [
  { keys: ['scholarship', 'other_income'], re: /\b(scholarship|ehsaas|hec|stipend|need based|merit)\b/i },
  { keys: ['salary', 'part_time'], re: /\b(salary|payroll|tankhwa|tankhah)\b/i },
  { keys: ['part_time', 'other_income'], re: /\b(part ?time|job|wages|shift|internship)\b/i },
  { keys: ['tuition_income', 'other_income'], re: /\b(tuition|tuitions|academy|teaching|tutor)\b/i },
  {
    keys: ['freelance', 'client_payment', 'other_income'],
    re: /\b(upwork|fiverr|payoneer|wise|freelanc\w*|client|paypal|project payment)\b/i,
  },
  {
    keys: ['pocket_money', 'household_money', 'other_income'],
    re: /\b(pocket money|jeb ?kharch|kharcha|ammi|ami|abbu|abu|papa|mama|ghar se|from home|parents)\b/i,
  },
  { keys: ['gift'], re: /\b(gift|eidi|salami|shagun|tohfa)\b/i },
  { keys: ['sales'], re: /\b(sale|sales|sold|customer)\b/i },
  { keys: ['other_income'], re: /\b(refund|cashback|reversal|reversed)\b/i },
];

/** Returns candidate category keys for the text, best first. Empty when nothing matches. */
export function guessCategoryKeys(text: string, kind: 'income' | 'expense'): string[] {
  if (!text.trim()) return [];
  const rules = kind === 'income' ? INCOME_RULES : EXPENSE_RULES;
  const out: string[] = [];
  for (const r of rules) {
    if (r.re.test(text)) for (const k of r.keys) if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Picks the first guessed key that exists among the user's categories. Falls back to a custom
 * category whose own name appears in the text (a "Gym" category matches the note "gym fee").
 */
export function pickCategory<T extends { key: string | null; name: string; kind: string }>(
  text: string,
  kind: 'income' | 'expense',
  categories: T[],
): T | null {
  const own = categories.filter((c) => c.kind === kind);
  const lower = text.toLowerCase();
  const custom = own.find((c) => !c.key && c.name.trim().length >= 3 && lower.includes(c.name.trim().toLowerCase()));
  if (custom) return custom;
  const byKey = new Map(own.filter((c) => c.key).map((c) => [c.key as string, c]));
  for (const key of guessCategoryKeys(text, kind)) {
    const c = byKey.get(key);
    if (c) return c;
  }
  return null;
}
