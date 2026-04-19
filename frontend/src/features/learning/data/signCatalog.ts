export interface SignEntry {
  id: string;
  label: string;
  category: string;
  description: string;
}

/** All signs available in BUILTIN_POSES + INCLUDE-50 vocabulary. */
export const SIGN_CATALOG: SignEntry[] = [
  // ── Greetings ──────────────────────────────────────────────────────────────
  { id: "HELLO",      label: "Hello",       category: "Greetings",     description: "Open palm salute at forehead" },
  { id: "THANK_YOU",  label: "Thank You",   category: "Greetings",     description: "Flat hand from chin forward" },
  { id: "PLEASE",     label: "Please",      category: "Greetings",     description: "Flat hand circular on chest" },
  { id: "GOOD",       label: "Good",        category: "Greetings",     description: "Thumbs up" },
  { id: "SORRY",      label: "Sorry",       category: "Greetings",     description: "Fist circular on chest" },

  // ── Pronouns ───────────────────────────────────────────────────────────────
  { id: "ME",         label: "Me / I",      category: "Pronouns",      description: "Index finger pointing to self" },
  { id: "YOU",        label: "You",         category: "Pronouns",      description: "Index finger pointing forward" },
  { id: "HELP",       label: "Help",        category: "Pronouns",      description: "Fist with thumb raised on flat palm" },

  // ── Common verbs ───────────────────────────────────────────────────────────
  { id: "WANT",       label: "Want",        category: "Actions",       description: "C-hands pull toward body" },
  { id: "KNOW",       label: "Know",        category: "Actions",       description: "Flat hand touches forehead" },
  { id: "UNDERSTAND", label: "Understand",  category: "Actions",       description: "V-sign flick at forehead" },
  { id: "COME",       label: "Come",        category: "Actions",       description: "Index fingers beckon inward" },
  { id: "GO",         label: "Go",          category: "Actions",       description: "Both index fingers point forward then away" },
  { id: "STOP",       label: "Stop",        category: "Actions",       description: "Flat hand strikes palm" },
  { id: "EAT",        label: "Eat",         category: "Actions",       description: "Flat hand to mouth" },
  { id: "SLEEP",      label: "Sleep",       category: "Actions",       description: "Flat hand beside tilted head" },
  { id: "HELP",       label: "Help",        category: "Actions",       description: "Thumbs-up on flat palm, lift up" },
  { id: "CAN",        label: "Can",         category: "Actions",       description: "Both fists move downward" },

  // ── Questions ──────────────────────────────────────────────────────────────
  { id: "WHAT",       label: "What",        category: "Questions",     description: "Open hands shake slightly" },
  { id: "WHERE",      label: "Where",       category: "Questions",     description: "Index finger wag side to side" },
  { id: "YES",        label: "Yes",         category: "Questions",     description: "Fist nod (wrist forward-back)" },
  { id: "NO",         label: "No",          category: "Questions",     description: "Index + middle close to thumb" },
  { id: "OKAY",       label: "OK",          category: "Questions",     description: "Thumb-index circle, other fingers up" },

  // ── Daily Life ─────────────────────────────────────────────────────────────
  { id: "WATER",      label: "Water",       category: "Daily Life",    description: "W-hand at chin, tap twice" },
  { id: "NAME",       label: "Name",        category: "Daily Life",    description: "H-hands stacked at center" },
  { id: "TIME-PAST",  label: "Past",        category: "Daily Life",    description: "Open hand toss over shoulder" },
  { id: "TIME-FUTURE",label: "Future",      category: "Daily Life",    description: "Open hand wave forward" },
  { id: "NOT",        label: "Not",         category: "Daily Life",    description: "Bent thumb under chin, flick forward" },
  { id: "HERE",       label: "Here",        category: "Daily Life",    description: "Both flat hands circle in front" },

  // ── INCLUDE-50 categories (populated after dataset download + LSTM train) ──
  // Animals
  { id: "DOG",        label: "Dog",         category: "Animals",       description: "Snap fingers then pat thigh" },
  { id: "CAT",        label: "Cat",         category: "Animals",       description: "Pinch + pull whiskers from cheek" },
  { id: "BIRD",       label: "Bird",        category: "Animals",       description: "Open-close index + thumb at mouth" },
  { id: "COW",        label: "Cow",         category: "Animals",       description: "Both Y-hands tap temples" },
  { id: "FISH",       label: "Fish",        category: "Animals",       description: "Flat hand wriggle sideways" },

  // Colours
  { id: "RED",        label: "Red",         category: "Colours",       description: "Index brushes down lips" },
  { id: "BLUE",       label: "Blue",        category: "Colours",       description: "B-hand twist at wrist" },
  { id: "GREEN",      label: "Green",       category: "Colours",       description: "G-hand shake at wrist" },
  { id: "WHITE",      label: "White",       category: "Colours",       description: "Open hand pull from chest outward into flat O" },
  { id: "BLACK",      label: "Black",       category: "Colours",       description: "Index draw across forehead" },
  { id: "YELLOW",     label: "Yellow",      category: "Colours",       description: "Y-hand shake" },

  // Days & Time
  { id: "TODAY",      label: "Today",       category: "Days & Time",   description: "Y-hands drop to hips, or \"NOW\"" },
  { id: "TOMORROW",   label: "Tomorrow",    category: "Days & Time",   description: "A-hand arc from chin forward" },
  { id: "YESTERDAY",  label: "Yesterday",   category: "Days & Time",   description: "A-hand arc from chin backward" },
  { id: "MORNING",    label: "Morning",     category: "Days & Time",   description: "Flat hand rises up like sun" },
  { id: "NIGHT",      label: "Night",       category: "Days & Time",   description: "Bent wrist droops over flat arm" },

  // Family
  { id: "MOTHER",     label: "Mother",      category: "Family",        description: "Open hand tap chin twice" },
  { id: "FATHER",     label: "Father",      category: "Family",        description: "Open hand tap forehead twice" },
  { id: "BROTHER",    label: "Brother",     category: "Family",        description: "L-hands together at forehead then waist" },
  { id: "SISTER",     label: "Sister",      category: "Family",        description: "A-hands together at chin then waist" },
  { id: "BABY",       label: "Baby",        category: "Family",        description: "Cradle arms and rock" },
  { id: "FRIEND",     label: "Friend",      category: "Family",        description: "X-hands link, then flip" },

  // Places
  { id: "HOME",       label: "Home",        category: "Places",        description: "Flat O-hand touches cheek, then jaw" },
  { id: "SCHOOL",     label: "School",      category: "Places",        description: "Clap flat hands twice" },
  { id: "HOSPITAL",   label: "Hospital",    category: "Places",        description: "H-hand draws cross on upper arm" },
  { id: "INDIA",      label: "India",       category: "Places",        description: "Bent index taps forehead" },

  // Numbers
  { id: "ONE",        label: "1",           category: "Numbers",       description: "Index finger up" },
  { id: "TWO",        label: "2",           category: "Numbers",       description: "Index + middle up" },
  { id: "THREE",      label: "3",           category: "Numbers",       description: "Index + middle + ring up" },
  { id: "FOUR",       label: "4",           category: "Numbers",       description: "All four fingers up, thumb tucked" },
  { id: "FIVE",       label: "5",           category: "Numbers",       description: "All five fingers spread open" },

  // Emotions
  { id: "HAPPY",      label: "Happy",       category: "Emotions",      description: "Flat hand brush up chest twice" },
  { id: "SAD",        label: "Sad",         category: "Emotions",      description: "Open hands drag down face" },
  { id: "ANGRY",      label: "Angry",       category: "Emotions",      description: "Clawed hand from chin outward" },
  { id: "SCARED",     label: "Scared",      category: "Emotions",      description: "Both A-hands shake in front of chest" },
  { id: "LOVE",       label: "Love",        category: "Emotions",      description: "Cross arms over chest" },
];

export const SIGN_CATEGORIES = [
  "All",
  "Greetings",
  "Pronouns",
  "Actions",
  "Questions",
  "Daily Life",
  "Family",
  "Animals",
  "Colours",
  "Days & Time",
  "Places",
  "Numbers",
  "Emotions",
] as const;

export type SignCategory = (typeof SIGN_CATEGORIES)[number];
