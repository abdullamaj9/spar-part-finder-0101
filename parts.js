// مرجع أقسام قطع الغيار (ثنائي اللغة عربي/إنجليزي) — مبني على تصنيف السوق الإماراتي.
// كل قسم وكل قطعة يحملان نسختين {ar, en}. القيمة المخزّنة في الطلب تبقى العربية
// (لتوافق البيانات القديمة)، والإنجليزية للعرض فقط حسب لغة المستخدم.

const CATEGORIES = [
  {
    ar: 'المحرك', en: 'Engine',
    parts: [
      { ar: 'محرك كامل', en: 'Complete engine' },
      { ar: 'رأس المحرك (وجه المكينة)', en: 'Cylinder head' },
      { ar: 'بلوك المحرك', en: 'Engine block' },
      { ar: 'مكبس (بستم)', en: 'Piston' },
      { ar: 'شنبر', en: 'Piston rings' },
      { ar: 'صمام (سوباب)', en: 'Valve' },
      { ar: 'طرمبة زيت', en: 'Oil pump' },
      { ar: 'كرتير الزيت', en: 'Oil pan' },
      { ar: 'غطاء التايمن', en: 'Timing cover' },
      { ar: 'سير التايمن', en: 'Timing belt' },
      { ar: 'سير الكمبروسر', en: 'Serpentine/AC belt' },
      { ar: 'بكرة شد السير', en: 'Belt tensioner pulley' },
      { ar: 'حساس الأكسجين', en: 'Oxygen sensor' },
      { ar: 'حساس الكامة', en: 'Camshaft sensor' },
      { ar: 'حساس الكرنك', en: 'Crankshaft sensor' },
      { ar: 'كويل الإشعال', en: 'Ignition coil' },
      { ar: 'بواجي (شمعات)', en: 'Spark plugs' },
      { ar: 'انجكتر (بخاخ)', en: 'Fuel injector' },
      { ar: 'طرمبة بنزين', en: 'Fuel pump' },
      { ar: 'فلتر زيت', en: 'Oil filter' },
      { ar: 'فلتر هواء', en: 'Air filter' },
      { ar: 'فلتر بنزين', en: 'Fuel filter' },
      { ar: 'مانيفولد سحب', en: 'Intake manifold' },
      { ar: 'مانيفولد عادم', en: 'Exhaust manifold' },
      { ar: 'كاتم (شكمان)', en: 'Muffler' },
    ],
  },
  {
    ar: 'ناقل الحركة (القير)', en: 'Transmission',
    parts: [
      { ar: 'قير أوتوماتيك كامل', en: 'Complete automatic transmission' },
      { ar: 'قير عادي كامل', en: 'Complete manual transmission' },
      { ar: 'دبرياج (كلتش)', en: 'Clutch' },
      { ar: 'طقم دبرياج', en: 'Clutch kit' },
      { ar: 'كرسي القير', en: 'Transmission mount' },
      { ar: 'حساس القير', en: 'Transmission sensor' },
      { ar: 'طرمبة القير', en: 'Transmission pump' },
      { ar: 'فلتر القير', en: 'Transmission filter' },
      { ar: 'عمود الكردان', en: 'Drive shaft' },
      { ar: 'جوزات (CV joint)', en: 'CV joint' },
    ],
  },
  {
    ar: 'نظام الفرامل', en: 'Brake system',
    parts: [
      { ar: 'فحمات فرامل أمامية', en: 'Front brake pads' },
      { ar: 'فحمات فرامل خلفية', en: 'Rear brake pads' },
      { ar: 'ديسك (هوب) أمامي', en: 'Front brake disc' },
      { ar: 'ديسك خلفي', en: 'Rear brake disc' },
      { ar: 'طرمبة فرامل رئيسية', en: 'Master brake cylinder' },
      { ar: 'كاليبر (مكبس فرامل)', en: 'Brake caliper' },
      { ar: 'خرطوم فرامل', en: 'Brake hose' },
      { ar: 'حساس ABS', en: 'ABS sensor' },
      { ar: 'طرمبة فرامل فرعية', en: 'Wheel brake cylinder' },
      { ar: 'وايرات هاند بريك', en: 'Handbrake cables' },
    ],
  },
  {
    ar: 'نظام التعليق والمقود', en: 'Suspension & steering',
    parts: [
      { ar: 'مساعد أمامي', en: 'Front shock absorber' },
      { ar: 'مساعد خلفي', en: 'Rear shock absorber' },
      { ar: 'سوست (نوابض)', en: 'Springs' },
      { ar: 'مقص علوي', en: 'Upper control arm' },
      { ar: 'مقص سفلي', en: 'Lower control arm' },
      { ar: 'بيضة مقص', en: 'Ball joint' },
      { ar: 'جلبة مقص', en: 'Control arm bushing' },
      { ar: 'عمود تعليق', en: 'Strut' },
      { ar: 'طبة موازن (لينك)', en: 'Stabilizer link' },
      { ar: 'موازن (سبيدر)', en: 'Stabilizer bar' },
      { ar: 'علبة مقود (ستيرنق)', en: 'Steering rack' },
      { ar: 'طرمبة باور', en: 'Power steering pump' },
      { ar: 'رأس عرفية (تامول)', en: 'Tie rod end' },
      { ar: 'مفصل عرفية', en: 'Tie rod joint' },
      { ar: 'رمان بلية (كراسي عجل)', en: 'Wheel bearing' },
      { ar: 'كفة عجل', en: 'Wheel hub' },
    ],
  },
  {
    ar: 'الكهرباء', en: 'Electrical',
    parts: [
      { ar: 'دينمو (مولّد)', en: 'Alternator' },
      { ar: 'سلف (مارش)', en: 'Starter motor' },
      { ar: 'بطارية', en: 'Battery' },
      { ar: 'حساس حرارة', en: 'Temperature sensor' },
      { ar: 'حساس ضغط', en: 'Pressure sensor' },
      { ar: 'كمبيوتر المحرك (ECU)', en: 'Engine ECU' },
      { ar: 'ريموت', en: 'Key remote' },
      { ar: 'سويتش زجاج', en: 'Window switch' },
      { ar: 'موتور زجاج', en: 'Window motor' },
      { ar: 'موتور مساحات', en: 'Wiper motor' },
      { ar: 'ذراع مساحات', en: 'Wiper arm' },
      { ar: 'بوق (هورن)', en: 'Horn' },
      { ar: 'علبة فيوزات', en: 'Fuse box' },
      { ar: 'وش كهرباء (ضفيرة أسلاك)', en: 'Wiring harness' },
    ],
  },
  {
    ar: 'التبريد والتكييف', en: 'Cooling & AC',
    parts: [
      { ar: 'رديتر (مشعاع)', en: 'Radiator' },
      { ar: 'مروحة رديتر', en: 'Radiator fan' },
      { ar: 'طرمبة ماء', en: 'Water pump' },
      { ar: 'ثرموستات', en: 'Thermostat' },
      { ar: 'خزان تعويض', en: 'Coolant reservoir' },
      { ar: 'كمبروسر مكيف', en: 'AC compressor' },
      { ar: 'مكثف مكيف (كوندنسر)', en: 'AC condenser' },
      { ar: 'مبخّر (إيفابريتر)', en: 'AC evaporator' },
      { ar: 'دراير مكيف', en: 'AC drier' },
      { ar: 'بلور مكيف (مروحة داخلية)', en: 'AC blower' },
      { ar: 'حساس حرارة المكيف', en: 'AC temperature sensor' },
      { ar: 'خراطيم مكيف', en: 'AC hoses' },
    ],
  },
  {
    ar: 'الهيكل الخارجي (بودي)', en: 'Body / exterior',
    parts: [
      { ar: 'صدام أمامي', en: 'Front bumper' },
      { ar: 'صدام خلفي', en: 'Rear bumper' },
      { ar: 'كبوت (غطاء محرك)', en: 'Hood' },
      { ar: 'رفرف أمامي', en: 'Front fender' },
      { ar: 'باب أمامي', en: 'Front door' },
      { ar: 'باب خلفي', en: 'Rear door' },
      { ar: 'شنطة خلفية (غطاء صندوق)', en: 'Trunk lid' },
      { ar: 'جناح', en: 'Spoiler' },
      { ar: 'عتبة جانبية', en: 'Side sill' },
      { ar: 'سقف', en: 'Roof' },
      { ar: 'شبك أمامي (قريل)', en: 'Front grille' },
      { ar: 'مرايا جانبية', en: 'Side mirrors' },
      { ar: 'مقبض باب', en: 'Door handle' },
      { ar: 'منظر داخلي (تيل)', en: 'Door trim panel' },
    ],
  },
  {
    ar: 'الإضاءة والزجاج', en: 'Lights & glass',
    parts: [
      { ar: 'شمعة أمامية (هيدلايت)', en: 'Headlight' },
      { ar: 'استوب خلفي', en: 'Tail light' },
      { ar: 'إشارة جانبية', en: 'Side indicator' },
      { ar: 'كشاف ضباب', en: 'Fog light' },
      { ar: 'لمبة لوحة', en: 'License plate light' },
      { ar: 'زجاج أمامي', en: 'Windshield' },
      { ar: 'زجاج خلفي', en: 'Rear windshield' },
      { ar: 'زجاج باب', en: 'Door glass' },
      { ar: 'مرآة داخلية', en: 'Interior mirror' },
    ],
  },
  {
    ar: 'الداخلية (الكابينة)', en: 'Interior (cabin)',
    parts: [
      { ar: 'كرسي (مقعد)', en: 'Seat' },
      { ar: 'طبلون (لوحة عدادات)', en: 'Dashboard' },
      { ar: 'عداد (الكلستر)', en: 'Instrument cluster' },
      { ar: 'مقود (دركسون)', en: 'Steering wheel' },
      { ar: 'كمبيوتر شاشة', en: 'Display screen' },
      { ar: 'دفاية', en: 'Heater' },
      { ar: 'حزام أمان', en: 'Seat belt' },
      { ar: 'إيرباق (وسادة هوائية)', en: 'Airbag' },
      { ar: 'تابلوه', en: 'Center console' },
      { ar: 'فرش أرضية', en: 'Floor mats' },
      { ar: 'مسند يد', en: 'Armrest' },
    ],
  },
  {
    ar: 'الإطارات والجنوط', en: 'Tires & wheels',
    parts: [
      { ar: 'إطار (كفر)', en: 'Tire' },
      { ar: 'جنط (رنق)', en: 'Wheel rim' },
      { ar: 'طاسة', en: 'Hubcap' },
      { ar: 'صمام هواء', en: 'Air valve' },
      { ar: 'حساس ضغط الإطار', en: 'Tire pressure sensor' },
    ],
  },
  {
    ar: 'أخرى', en: 'Other',
    parts: [
      { ar: 'قطعة غير مذكورة (وضّح في الملاحظة)', en: 'Part not listed (specify in note)' },
    ],
  },
];

// بناء الخرائط المتوافقة مع الكود القديم (مفاتيح عربية = القيم المخزّنة)
const PART_CATEGORIES = {};
for (const c of CATEGORIES) PART_CATEGORIES[c.ar] = c.parts.map(p => p.ar);

const CATEGORY_NAMES = CATEGORIES.map(c => c.ar);

// نسخة ثنائية اللغة للواجهة
const CATEGORIES_I18N = CATEGORIES;

function partsForCategory(cat) {
  return PART_CATEGORIES[cat] || [];
}

function allParts() {
  const out = [];
  for (const c of CATEGORIES) {
    for (const p of c.parts) out.push({ category: c.ar, part: p.ar });
  }
  return out;
}

module.exports = { PART_CATEGORIES, CATEGORY_NAMES, CATEGORIES_I18N, partsForCategory, allParts };
