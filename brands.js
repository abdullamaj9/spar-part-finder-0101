// مرجع الماركات والمناشئ — الماركة تُحدد المنشأ تلقائيًا
// origin: ياباني | كوري | أمريكي | ألماني | أوروبي

const BRANDS = {
  // ياباني
  'تويوتا':        { origin: 'ياباني', models: ['كامري','كورولا','لاندكروزر','برادو','هايلكس','يارس','افالون','RAV4','فورتشنر','إنوفا'] },
  'نيسان':         { origin: 'ياباني', models: ['باترول','التيما','مكسيما','صني','اكس تريل','نافارا','كيكس','باثفايندر','تيدا'] },
  'هوندا':         { origin: 'ياباني', models: ['أكورد','سيفيك','CR-V','بايلوت','أوديسي','HR-V'] },
  'ميتسوبيشي':     { origin: 'ياباني', models: ['باجيرو','لانسر','مونتيرو','أوتلندر','L200','ASX'] },
  'مازدا':          { origin: 'ياباني', models: ['مازدا 3','مازدا 6','CX-5','CX-9','MX-5'] },
  'لكزس':          { origin: 'ياباني', models: ['LX','GX','ES','RX','LS','IS','NX'] },
  'إنفينيتي':      { origin: 'ياباني', models: ['QX80','QX60','Q50','QX50','QX70'] },
  'سوزوكي':        { origin: 'ياباني', models: ['جيمني','سويفت','فيتارا','بالينو'] },

  // كوري
  'هيونداي':       { origin: 'كوري', models: ['إلنترا','سوناتا','توسان','سنتافي','أكسنت','باليسيد','كريتا'] },
  'كيا':           { origin: 'كوري', models: ['سبورتاج','سورينتو','أوبتيما','سيراتو','كرنفال','سيلتوس','تيلورايد'] },
  'جينيسيس':       { origin: 'كوري', models: ['G70','G80','G90','GV70','GV80'] },

  // أمريكي
  'فورد':          { origin: 'أمريكي', models: ['F-150','إكسبلورر','إكسبيديشن','موستانج','إيدج','رينجر','تورس'] },
  'شيفروليه':      { origin: 'أمريكي', models: ['تاهو','سوبربان','ماليبو','كامارو','سيلفرادو','ترافيرس','إمبالا'] },
  'جمس':           { origin: 'أمريكي', models: ['يوكن','سييرا','أكاديا','تيرين'] },
  'دودج':          { origin: 'أمريكي', models: ['تشارجر','تشالنجر','دورانجو','رام'] },
  'كاديلاك':       { origin: 'أمريكي', models: ['اسكاليد','XT5','CT6','XT6'] },
  'جيب':           { origin: 'أمريكي', models: ['جراند شيروكي','رانجلر','شيروكي','كومباس'] },

  // ألماني
  'مرسيدس':        { origin: 'ألماني', models: ['C-Class','E-Class','S-Class','GLE','GLC','G-Class','GLS','A-Class'] },
  'بي ام دبليو':   { origin: 'ألماني', models: ['الفئة 3','الفئة 5','الفئة 7','X5','X3','X6','X7'] },
  'أودي':          { origin: 'ألماني', models: ['A4','A6','Q5','Q7','Q8','A8'] },
  'فولكس واجن':    { origin: 'ألماني', models: ['جولف','باسات','تيجوان','طوارق'] },
  'بورش':          { origin: 'ألماني', models: ['كايين','ماكان','باناميرا','911'] },

  // أوروبي آخر
  'لاند روفر':     { origin: 'أوروبي', models: ['رينج روفر','ديسكفري','إيفوك','سبورت','ديفندر'] },
  'بيجو':          { origin: 'أوروبي', models: ['3008','5008','508','2008'] },
  'رينو':          { origin: 'أوروبي', models: ['داستر','كوليوس','ميجان','تاليسمان'] },

  // صيني
  'شانجان':        { origin: 'صيني', models: ['CS35','CS55','CS75','CS85','CS95','يوني-تي','يوني-كيه','الزدل','إيدو'] },
  'جيلي':          { origin: 'صيني', models: ['كولراي','إمجراند','أزكارا','توجيلا','مونجارو','بينراي','أوكافانجو','جيومتري'] },
  'إم جي':         { origin: 'صيني', models: ['MG5','MG6','MG7','ZS','HS','RX5','RX8','MG GT','وان'] },
  'شيري':          { origin: 'صيني', models: ['تيجو 2','تيجو 4','تيجو 7','تيجو 8','أريزو 5','أريزو 6','أوموندا'] },
  'هافال':         { origin: 'صيني', models: ['H6','H9','جوليان','دارجو','F7','F7x','جولف'] },
  'جريت وول':      { origin: 'صيني', models: ['وينجل 5','وينجل 7','باور','كانون','تانك 300','تانك 500'] },
  'بايك':          { origin: 'صيني', models: ['BJ40','BJ80','X55','X7','U5','D50'] },
  'دونغفينغ':      { origin: 'صيني', models: ['AX7','T5','580','إيجل','ريتش'] },
  'جاك':           { origin: 'صيني', models: ['S3','S4','S5','S7','T6','T8','جيس 4'] },
  'بي واي دي':     { origin: 'صيني', models: ['F3','سونغ','تانغ','هان','يوان','دولفين','أتو 3','سيل'] },
  'فاو':           { origin: 'صيني', models: ['بيستون T77','بيستون T99','بيستون 7','أمبيشن'] },
  'جيتور':         { origin: 'صيني', models: ['X70','X90','داشينغ','T2'] },
  'إكسبينغ':       { origin: 'صيني', models: ['G3','P5','P7','G9','X9'] },
  'زوتي':          { origin: 'صيني', models: ['T500','T600','Z500','دامي X5'] },
  'لينك آند كو':   { origin: 'صيني', models: ['01','02','03','05','06','09'] },
};

const ORIGINS = ['ياباني', 'كوري', 'أمريكي', 'ألماني', 'أوروبي', 'صيني'];
const CONDITIONS = ['جديد أصلي', 'جديد تجاري', 'مستعمل'];

// ===== ترجمات إنجليزية (للعرض في الواجهة حسب لغة المستخدم) =====
// القيم المخزّنة في الطلب تبقى عربية؛ هذه الخرائط للعرض فقط.
const BRAND_EN = {
  'تويوتا': 'Toyota', 'نيسان': 'Nissan', 'هوندا': 'Honda', 'ميتسوبيشي': 'Mitsubishi',
  'مازدا': 'Mazda', 'لكزس': 'Lexus', 'إنفينيتي': 'Infiniti', 'سوزوكي': 'Suzuki',
  'هيونداي': 'Hyundai', 'كيا': 'Kia', 'جينيسيس': 'Genesis',
  'فورد': 'Ford', 'شيفروليه': 'Chevrolet', 'جمس': 'GMC', 'دودج': 'Dodge',
  'كاديلاك': 'Cadillac', 'جيب': 'Jeep',
  'مرسيدس': 'Mercedes', 'بي ام دبليو': 'BMW', 'أودي': 'Audi',
  'فولكس واجن': 'Volkswagen', 'بورش': 'Porsche',
  'لاند روفر': 'Land Rover', 'بيجو': 'Peugeot', 'رينو': 'Renault',
  'شانجان': 'Changan', 'جيلي': 'Geely', 'إم جي': 'MG', 'شيري': 'Chery',
  'هافال': 'Haval', 'جريت وول': 'Great Wall', 'بايك': 'BAIC', 'دونغفينغ': 'Dongfeng',
  'جاك': 'JAC', 'بي واي دي': 'BYD', 'فاو': 'FAW', 'جيتور': 'Jetour',
  'إكسبينغ': 'Xpeng', 'زوتي': 'Zotye', 'لينك آند كو': 'Lynk & Co',
};

const ORIGIN_EN = {
  'ياباني': 'Japanese', 'كوري': 'Korean', 'أمريكي': 'American',
  'ألماني': 'German', 'أوروبي': 'European', 'صيني': 'Chinese',
};

const CONDITION_EN = {
  'جديد أصلي': 'Genuine new', 'جديد تجاري': 'Aftermarket new', 'مستعمل': 'Used',
};

// ترجمة الموديلات (عربي → إنجليزي). الموديلات اللاتينية أصلًا (RAV4, X5...) تبقى كما هي.
const MODEL_EN = {
  'كامري':'Camry','كورولا':'Corolla','لاندكروزر':'Land Cruiser','برادو':'Prado','هايلكس':'Hilux','يارس':'Yaris','افالون':'Avalon','فورتشنر':'Fortuner','إنوفا':'Innova',
  'باترول':'Patrol','التيما':'Altima','مكسيما':'Maxima','صني':'Sunny','اكس تريل':'X-Trail','نافارا':'Navara','كيكس':'Kicks','باثفايندر':'Pathfinder','تيدا':'Tiida',
  'أكورد':'Accord','سيفيك':'Civic','بايلوت':'Pilot','أوديسي':'Odyssey',
  'باجيرو':'Pajero','لانسر':'Lancer','مونتيرو':'Montero','أوتلندر':'Outlander',
  'مازدا 3':'Mazda 3','مازدا 6':'Mazda 6',
  'جيمني':'Jimny','سويفت':'Swift','فيتارا':'Vitara','بالينو':'Baleno',
  'إلنترا':'Elantra','سوناتا':'Sonata','توسان':'Tucson','سنتافي':'Santa Fe','أكسنت':'Accent','باليسيد':'Palisade','كريتا':'Creta',
  'سبورتاج':'Sportage','سورينتو':'Sorento','أوبتيما':'Optima','سيراتو':'Cerato','كرنفال':'Carnival','سيلتوس':'Seltos','تيلورايد':'Telluride',
  'إكسبلورر':'Explorer','إكسبيديشن':'Expedition','موستانج':'Mustang','إيدج':'Edge','رينجر':'Ranger','تورس':'Taurus',
  'تاهو':'Tahoe','سوبربان':'Suburban','ماليبو':'Malibu','كامارو':'Camaro','سيلفرادو':'Silverado','ترافيرس':'Traverse','إمبالا':'Impala',
  'يوكن':'Yukon','سييرا':'Sierra','أكاديا':'Acadia','تيرين':'Terrain',
  'تشارجر':'Charger','تشالنجر':'Challenger','دورانجو':'Durango','رام':'Ram',
  'اسكاليد':'Escalade',
  'جراند شيروكي':'Grand Cherokee','رانجلر':'Wrangler','شيروكي':'Cherokee','كومباس':'Compass',
  'جولف':'Golf','باسات':'Passat','تيجوان':'Tiguan','طوارق':'Touareg',
  'كايين':'Cayenne','ماكان':'Macan','باناميرا':'Panamera',
  'رينج روفر':'Range Rover','ديسكفري':'Discovery','إيفوك':'Evoque','سبورت':'Sport','ديفندر':'Defender',
  'داستر':'Duster','كوليوس':'Koleos','ميجان':'Megane','تاليسمان':'Talisman',
  'يوني-تي':'Uni-T','يوني-كيه':'Uni-K','الزدل':'Alsvin','إيدو':'Eado',
  'كولراي':'Coolray','إمجراند':'Emgrand','أزكارا':'Azkarra','توجيلا':'Tugella','مونجارو':'Monjaro','بينراي':'Binray','أوكافانجو':'Okavango','جيومتري':'Geometry',
  'وان':'One',
  'تيجو 2':'Tiggo 2','تيجو 4':'Tiggo 4','تيجو 7':'Tiggo 7','تيجو 8':'Tiggo 8','أريزو 5':'Arrizo 5','أريزو 6':'Arrizo 6','أوموندا':'Omoda',
  'جوليان':'Jolion','دارجو':'Dargo',
  'وينجل 5':'Wingle 5','وينجل 7':'Wingle 7','باور':'Poer','كانون':'Cannon','تانك 300':'Tank 300','تانك 500':'Tank 500',
  'إيجل':'Aeolus','ريتش':'Rich',
  'جيس 4':'JS4',
  'سونغ':'Song','تانغ':'Tang','هان':'Han','يوان':'Yuan','دولفين':'Dolphin','أتو 3':'Atto 3','سيل':'Seal',
  'بيستون T77':'Bestune T77','بيستون T99':'Bestune T99','بيستون 7':'Bestune 7','أمبيشن':'Ambition',
  'داشينغ':'Dashing',
  'دامي X5':'Damy X5',
};

// موديل بصيغة معروضة حسب اللغة (إنجليزي إن وُجد، وإلا يبقى كما هو)
function modelEn(m) { return MODEL_EN[m] || m; }

// نسخة ماركات ثنائية اللغة للواجهة: [{ ar, en, origin, originEn, models, modelsI18n }]
const BRANDS_I18N = Object.keys(BRANDS).map(ar => ({
  ar,
  en: BRAND_EN[ar] || ar,
  origin: BRANDS[ar].origin,
  originEn: ORIGIN_EN[BRANDS[ar].origin] || BRANDS[ar].origin,
  models: BRANDS[ar].models,
  modelsI18n: BRANDS[ar].models.map(m => ({ ar: m, en: modelEn(m) })),
}));

function originForBrand(brand) {
  return BRANDS[brand] ? BRANDS[brand].origin : null;
}

function brandsForOrigin(origin) {
  return Object.keys(BRANDS).filter(b => BRANDS[b].origin === origin);
}

module.exports = { BRANDS, ORIGINS, CONDITIONS, BRAND_EN, ORIGIN_EN, CONDITION_EN, MODEL_EN, BRANDS_I18N, originForBrand, brandsForOrigin };
