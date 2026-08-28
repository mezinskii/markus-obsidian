/**
 * deity-names.ts — display names for every deity value in the corpus.
 *
 * The `deities` field stores the name as the source gives it, which means the
 * same god appears under several spellings: Apollo / Apollon, Jupiter /
 * Iuppiter, Hecate / Hekate, Manes / Di Manes. That is correct for the data —
 * a Greek hymn should not be silently Latinised — but a title must not read
 * "Prayer to Apollon". So each stored value maps to one display name per
 * language, and variants of one god map to the same pair.
 *
 * `dat` is the Russian dative, which is what a title needs: «Молитва Аполлону».
 * Indeclinable names repeat the nominative.
 *
 * Cult titles that the corpus keeps apart are kept apart here too: Bacchus is
 * not folded into Dionysus, Aesculapius not into Asclepius, Phoebus not into
 * Apollo. Those are different cults, and the corpus distinguishes them on
 * purpose.
 */
export interface DeityName {
  /** English display form. */
  en: string;
  /** Russian nominative. */
  ru: string;
  /** Russian dative — «Молитва <dat>». */
  dat: string;
}

export const DEITY_NAMES: Record<string, DeityName> = {
  // ── Roman ────────────────────────────────────────────────────────────────
  Apollo: { en: "Apollo", ru: "Аполлон", dat: "Аполлону" },
  Phoebus: { en: "Phoebus", ru: "Феб", dat: "Фебу" },
  Diana: { en: "Diana", ru: "Диана", dat: "Диане" },
  Ceres: { en: "Ceres", ru: "Церера", dat: "Церере" },
  Bacchus: { en: "Bacchus", ru: "Вакх", dat: "Вакху" },
  Liber: { en: "Liber", ru: "Либер", dat: "Либеру" },
  Libera: { en: "Libera", ru: "Либера", dat: "Либере" },
  Mars: { en: "Mars", ru: "Марс", dat: "Марсу" },
  "Mars Gradivus": { en: "Mars Gradivus", ru: "Марс Градив", dat: "Марсу Градиву" },
  Jupiter: { en: "Jupiter", ru: "Юпитер", dat: "Юпитеру" },
  Iuppiter: { en: "Jupiter", ru: "Юпитер", dat: "Юпитеру" },
  "Iuppiter Capitolinus": { en: "Jupiter Capitolinus", ru: "Юпитер Капитолийский", dat: "Юпитеру Капитолийскому" },
  Juno: { en: "Juno", ru: "Юнона", dat: "Юноне" },
  Iuno: { en: "Juno", ru: "Юнона", dat: "Юноне" },
  Janus: { en: "Janus", ru: "Янус", dat: "Янусу" },
  Ianus: { en: "Janus", ru: "Янус", dat: "Янусу" },
  Minerva: { en: "Minerva", ru: "Минерва", dat: "Минерве" },
  Venus: { en: "Venus", ru: "Венера", dat: "Венере" },
  "Venus Verticordia": { en: "Venus Verticordia", ru: "Венера Вертикордия", dat: "Венере Вертикордии" },
  Vesta: { en: "Vesta", ru: "Веста", dat: "Весте" },
  Neptunus: { en: "Neptune", ru: "Нептун", dat: "Нептуну" },
  Mercurius: { en: "Mercury", ru: "Меркурий", dat: "Меркурию" },
  Vulcanus: { en: "Vulcan", ru: "Вулкан", dat: "Вулкану" },
  Hercules: { en: "Hercules", ru: "Геркулес", dat: "Геркулесу" },
  Aesculapius: { en: "Aesculapius", ru: "Эскулап", dat: "Эскулапу" },
  Silvanus: { en: "Silvanus", ru: "Сильван", dat: "Сильвану" },
  Faunus: { en: "Faunus", ru: "Фавн", dat: "Фавну" },
  Fauns: { en: "the Fauns", ru: "Фавны", dat: "Фавнам" },
  Flora: { en: "Flora", ru: "Флора", dat: "Флоре" },
  Carmenta: { en: "Carmenta", ru: "Кармента", dat: "Карменте" },
  Porrima: { en: "Porrima", ru: "Поррима", dat: "Порриме" },
  Postvorta: { en: "Postvorta", ru: "Постворта", dat: "Постворте" },
  Bellona: { en: "Bellona", ru: "Беллона", dat: "Беллоне" },
  Quirinus: { en: "Quirinus", ru: "Квирин", dat: "Квирину" },
  Consus: { en: "Consus", ru: "Конс", dat: "Консу" },
  Terminus: { en: "Terminus", ru: "Термин", dat: "Термину" },
  Robigo: { en: "Robigo", ru: "Робиго", dat: "Робиго" },
  Pales: { en: "Pales", ru: "Палес", dat: "Палес" },
  Salus: { en: "Salus", ru: "Салюс", dat: "Салюс" },
  Neria: { en: "Neria", ru: "Нерия", dat: "Нерии" },
  Perfidia: { en: "Perfidia", ru: "Вероломство", dat: "Вероломству" },
  "Fortuna Virilis": { en: "Fortuna Virilis", ru: "Фортуна Вирилис", dat: "Фортуне Вирилис" },
  Priapus: { en: "Priapus", ru: "Приап", dat: "Приапу" },
  Cupido: { en: "Cupid", ru: "Купидон", dat: "Купидону" },
  Gratiae: { en: "the Graces", ru: "Грации", dat: "Грациям" },
  Proserpina: { en: "Proserpina", ru: "Прозерпина", dat: "Прозерпине" },
  "Dis Pater": { en: "Dis Pater", ru: "Диспитер", dat: "Диспитеру" },
  Veiovis: { en: "Veiovis", ru: "Вейовис", dat: "Вейовису" },
  Sol: { en: "Sol", ru: "Солнце", dat: "Солнцу" },
  Isis: { en: "Isis", ru: "Исида", dat: "Исиде" },
  Musa: { en: "the Muse", ru: "Муза", dat: "Музе" },

  // ── Roman collectives ────────────────────────────────────────────────────
  Lares: { en: "the Lares", ru: "Лары", dat: "Ларам" },
  Penates: { en: "the Penates", ru: "Пенаты", dat: "Пенатам" },
  "Dii Penates": { en: "the Penates", ru: "Пенаты", dat: "Пенатам" },
  Manes: { en: "the Manes", ru: "Маны", dat: "Манам" },
  "Di Manes": { en: "the Manes", ru: "Маны", dat: "Манам" },
  "Di Indigetes": { en: "the Di Indigetes", ru: "Индигеты", dat: "Индигетам" },
  "Di Novensiles": { en: "the Di Novensiles", ru: "Новенсилы", dat: "Новенсилам" },
  Tellus: { en: "Earth", ru: "Земля", dat: "Земле" },
  Terra: { en: "Earth", ru: "Земля", dat: "Земле" },
  "Terra Mater": { en: "Mother Earth", ru: "Мать-Земля", dat: "Матери-Земле" },

  // ── Greek ────────────────────────────────────────────────────────────────
  Zeus: { en: "Zeus", ru: "Зевс", dat: "Зевсу" },
  Hera: { en: "Hera", ru: "Гера", dat: "Гере" },
  Apollon: { en: "Apollo", ru: "Аполлон", dat: "Аполлону" },
  Artemis: { en: "Artemis", ru: "Артемида", dat: "Артемиде" },
  Athena: { en: "Athena", ru: "Афина", dat: "Афине" },
  Aphrodite: { en: "Aphrodite", ru: "Афродита", dat: "Афродите" },
  Demeter: { en: "Demeter", ru: "Деметра", dat: "Деметре" },
  Persephone: { en: "Persephone", ru: "Персефона", dat: "Персефоне" },
  Dionysus: { en: "Dionysus", ru: "Дионис", dat: "Дионису" },
  Dionysos: { en: "Dionysus", ru: "Дионис", dat: "Дионису" },
  Hermes: { en: "Hermes", ru: "Гермес", dat: "Гермесу" },
  Poseidon: { en: "Poseidon", ru: "Посейдон", dat: "Посейдону" },
  Hephaestus: { en: "Hephaestus", ru: "Гефест", dat: "Гефесту" },
  Hephaistos: { en: "Hephaestus", ru: "Гефест", dat: "Гефесту" },
  Ares: { en: "Ares", ru: "Арес", dat: "Аресу" },
  Hestia: { en: "Hestia", ru: "Гестия", dat: "Гестии" },
  Hades: { en: "Hades", ru: "Аид", dat: "Аиду" },
  Plouton: { en: "Plouton", ru: "Плутон", dat: "Плутону" },
  Hecate: { en: "Hecate", ru: "Геката", dat: "Гекате" },
  Hekate: { en: "Hecate", ru: "Геката", dat: "Гекате" },
  Gaia: { en: "Gaia", ru: "Гея", dat: "Гее" },
  Helios: { en: "Helios", ru: "Гелиос", dat: "Гелиосу" },
  Selene: { en: "Selene", ru: "Селена", dat: "Селене" },
  Eos: { en: "Eos", ru: "Эос", dat: "Эос" },
  Pan: { en: "Pan", ru: "Пан", dat: "Пану" },
  Eros: { en: "Eros", ru: "Эрот", dat: "Эроту" },
  Peitho: { en: "Peitho", ru: "Пейто", dat: "Пейто" },
  Tyche: { en: "Tyche", ru: "Тюхе", dat: "Тюхе" },
  Ananke: { en: "Ananke", ru: "Ананка", dat: "Ананке" },
  Adonis: { en: "Adonis", ru: "Адонис", dat: "Адонису" },
  Ariadne: { en: "Ariadne", ru: "Ариадна", dat: "Ариадне" },
  Semele: { en: "Semele", ru: "Семела", dat: "Семеле" },
  Leto: { en: "Leto", ru: "Лето", dat: "Лето" },
  Maia: { en: "Maia", ru: "Майя", dat: "Майе" },
  Rhea: { en: "Rhea", ru: "Рея", dat: "Рее" },
  Cronus: { en: "Cronus", ru: "Крон", dat: "Крону" },
  Hebe: { en: "Hebe", ru: "Геба", dat: "Гебе" },
  Iacchus: { en: "Iacchus", ru: "Иакх", dat: "Иакху" },
  Palaemon: { en: "Palaemon", ru: "Палемон", dat: "Палемону" },
  Amphitrite: { en: "Amphitrite", ru: "Амфитрита", dat: "Амфитрите" },
  Zephyrus: { en: "Zephyrus", ru: "Зефир", dat: "Зефиру" },
  Prothyraea: { en: "Prothyraea", ru: "Профирея", dat: "Профирее" },
  Agathodaimon: { en: "the Agathos Daimon", ru: "Агатодемон", dat: "Агатодемону" },
  Plutus: { en: "Plutus", ru: "Плутос", dat: "Плутосу" },

  // ── Greek healers ────────────────────────────────────────────────────────
  Asclepius: { en: "Asclepius", ru: "Асклепий", dat: "Асклепию" },
  Asklepios: { en: "Asclepius", ru: "Асклепий", dat: "Асклепию" },
  Hygieia: { en: "Hygieia", ru: "Гигиея", dat: "Гигиее" },
  Hygeia: { en: "Hygieia", ru: "Гигиея", dat: "Гигиее" },
  Panakea: { en: "Panacea", ru: "Панакея", dat: "Панакее" },
  Iaso: { en: "Iaso", ru: "Иасо", dat: "Иасо" },
  Aigle: { en: "Aegle", ru: "Эгла", dat: "Эгле" },
  Epione: { en: "Epione", ru: "Эпиона", dat: "Эпионе" },
  Machaon: { en: "Machaon", ru: "Махаон", dat: "Махаону" },
  Podaleirios: { en: "Podaleirius", ru: "Подалирий", dat: "Подалирию" },
  Telesphoros: { en: "Telesphorus", ru: "Телесфор", dat: "Телесфору" },

  // ── Greek collectives ────────────────────────────────────────────────────
  Nymphs: { en: "the Nymphs", ru: "Нимфы", dat: "Нимфам" },
  Nymphae: { en: "the Nymphs", ru: "Нимфы", dat: "Нимфам" },
  Muses: { en: "the Muses", ru: "Музы", dat: "Музам" },
  Charites: { en: "the Charites", ru: "Хариты", dat: "Харитам" },
  Aglaia: { en: "Aglaia", ru: "Аглая", dat: "Аглае" },
  Euphrosyne: { en: "Euphrosyne", ru: "Евфросина", dat: "Евфросине" },
  Thalia: { en: "Thalia", ru: "Талия", dat: "Талии" },
  Horae: { en: "the Horae", ru: "Оры", dat: "Орам" },
  Moirai: { en: "the Moirai", ru: "Мойры", dat: "Мойрам" },
  Moirae: { en: "the Moirai", ru: "Мойры", dat: "Мойрам" },
  Dioscuri: { en: "the Dioscuri", ru: "Диоскуры", dat: "Диоскурам" },
  Nereids: { en: "the Nereids", ru: "Нереиды", dat: "Нереидам" },
  Koryvantes: { en: "the Korybantes", ru: "Корибанты", dat: "Корибантам" },
  Kouretes: { en: "the Kouretes", ru: "Куреты", dat: "Куретам" },
  Eileithyia: { en: "Eileithyia", ru: "Илифия", dat: "Илифии" },
  Ilithyia: { en: "Eileithyia", ru: "Илифия", dat: "Илифии" },
};

/** Look up a stored deity value; undefined when the table has no entry. */
export function deityName(value: string): DeityName | undefined {
  return DEITY_NAMES[value];
}
