/**
 * Single source of truth for landing page content.
 *
 * Sources:
 *   D:/Working/PNU/자료/교수정보_초안.md   (basic info, bios, career)
 *   D:/Working/PNU/자료/표기원칙.md        (notation rules — see below)
 *   D:/Working/PNU/웹페이지/계획.md        (site structure, language policy)
 *
 * NOTATION RULES (표기원칙.md) — these are hard constraints:
 *   1. Institution names are ALWAYS written in full, in English.
 *      "Ulsan National Institute of Science and Technology", never "UNIST".
 *      "University of California, Los Angeles", never "UCLA".
 *   2. No acronyms, and no "full name (ACRONYM)" parenthetical gloss.
 *   3. EXCEPTION — conference names are cited in their standard short form:
 *      ICLR, ICML, AAAI, IJCAI, CIKM, KDD, CHIL. These ARE the formal names.
 *   4. The lab name is always "Scientific Inference Lab" — never abbreviated.
 *
 * LANGUAGE POLICY: English throughout, with recruiting in Korean.
 */

export const site = {
  name: 'Scientific Inference Lab',
  institution: 'Pusan National University',
  affiliation:
    'School of Biomedical Convergence Engineering, Pusan National University',
  universityUrl: 'https://www.pusan.ac.kr/eng/Main.do',
  universitySignature: '/images/pusan-national-university.png',
  universitySignatureReversed: '/images/pusan-national-university-reversed.png',
  intro:
    'We study when machine learning models can be trusted both to support ' +
    'scientific claims and to produce reliable outputs at inference time. ' +
    'Our work spans learning from irregular and incomplete measurements, ' +
    'quantifying predictive uncertainty, and establishing the evidence ' +
    'standards under which conclusions remain valid.',
  url: 'https://scientific-inference-lab.github.io',
  founded: '2026-09-01',
};

export const pi = {
  name: 'YongKyung Oh',
  role: 'Assistant Professor',
  affiliation: site.affiliation,
  // Presentation photo, square (900x900). Bio_crop_web.jpg (4:5 studio
  // portrait) is the alternative if a formal headshot is ever wanted.
  photo: '/images/yongkyung-oh.jpg',
  photoAlt: 'YongKyung Oh speaking at a conference',
  /*
   * NOT rendered on the landing page. Kept because it is the PI's own LinkedIn
   * About text (condensed, with institution names expanded per 표기원칙.md —
   * the source uses UCLA / UNIST / NRF, which this site does not), so it is
   * ready if a People or About page needs it later.
   */
  bio:
    'YongKyung Oh directs the Scientific Inference Lab, which develops ' +
    'machine learning methods for modeling, inference, and decision making ' +
    'in scientific and engineering systems. Before joining Pusan National ' +
    'University, he was a Postdoctoral Researcher in the Medical and Imaging ' +
    'Informatics group at the David Geffen School of Medicine, University of ' +
    'California, Los Angeles, where he developed machine learning methods for ' +
    'healthcare. Recent work includes a sole-authored position paper accepted ' +
    'at ICML 2026, an ICLR 2024 Spotlight, and the CHIL 2025 Best Paper Award.',
  // Degrees spelled out per 표기원칙.md; institution names never abbreviated.
  /**
   * Years from 교수정보_초안.md §3. `period` is NOT rendered — the People list
   * shows the degree and institution only — but the verified dates are kept
   * here rather than discarded.
   */
  education: [
    {
      period: '2017–2023',
      degree: 'Doctor of Philosophy in Industrial Engineering',
      where: 'Ulsan National Institute of Science and Technology',
    },
    {
      period: '2015–2017',
      degree: 'Master of Science in Technology and Innovation Management',
      where: 'Ulsan National Institute of Science and Technology',
    },
    {
      period: '2011–2015',
      degree: 'Bachelor of Science in Physics',
      where: 'Ulsan National Institute of Science and Technology',
    },
  ],
  /** Full career history — 교수정보_초안.md §5. Institution names in full. */
  appointments: [
    {
      period: '2023–2026',
      role: 'Postdoctoral Researcher',
      where:
        'Medical and Imaging Informatics, David Geffen School of Medicine, University of California, Los Angeles',
    },
    {
      period: '2023–2024',
      role: 'Postdoctoral Researcher',
      where:
        'Industry Intelligentization Institute, Ulsan National Institute of Science and Technology',
    },
    {
      // Corrected from the PI's LinkedIn text: this was the Intensive AI
      // Program, not a visiting researcher appointment.
      period: '2020',
      role: 'Intensive Artificial Intelligence Program',
      where: 'Carnegie Mellon University',
    },
    {
      period: '2017',
      role: 'Visiting Scientist',
      where: 'General Motors Global Research and Development Center',
    },
  ],
  email: 'yongkyung.oh@pusan.ac.kr',
  phone: '051-510-6624',
  office: 'Office 415, Gyeongam Engineering Building',
  address:
    '49 Busandaehak-ro, Mulgeum-eup, Yangsan-si, Gyeongsangnam-do 50612, Republic of Korea',
  links: {
    scholar: 'https://scholar.google.com/citations?user=YJ1L50YAAAAJ&hl=en',
    github: 'https://github.com/yongkyung-oh',
    linkedin: 'https://www.linkedin.com/in/yongkyung-oh',
    personal: 'https://yongkyung-oh.github.io',
  },
};

/**
 * Three research axes.
 *
 * Titles and summaries follow 계획.md §4, which defines each axis in one line.
 * Nothing beyond those lines is asserted here: earlier drafts added specifics
 * ("data is scarce, noisy, or costly to collect") that no source stated.
 */
export const research = [
  {
    index: '01',
    title: 'Artificial Intelligence for Science',
    summary: 'Machine learning for scientific discovery.',
    topics: ['Physical knowledge', 'Experimental design', 'Scientific discovery'],
  },
  {
    index: '02',
    title: 'Continuous-Time Modeling',
    summary: 'Stable modeling of irregularly sampled time series.',
    topics: ['Neural dynamics', 'Irregular sampling', 'Stochastic processes'],
  },
  {
    index: '03',
    title: 'Evidence-Centered Artificial Intelligence',
    summary: 'Validating the evidential basis of model conclusions.',
    topics: ['Uncertainty quantification', 'Distributional robustness', 'Silent failure'],
  },
];

export const publications = [
  {
    title: 'Position: State-of-the-Art Claims Require State-of-the-Art Evidence',
    venue: 'ICML',
    note: 'Position Paper',
    year: 2026,
    url: 'https://arxiv.org/abs/2605.17273',
  },
  {
    title: 'Silent Failures in Federated Personalization of Foundation Models',
    venue: 'KDD',
    note: 'Blue Sky Ideas Track',
    year: 2026,
    url: 'https://doi.org/10.1145/3770855.3818661',
  },
  {
    title: 'Survey-Aware Machine Learning: A Guideline for Valid Population Health Inference Based on Scoping Review',
    venue: 'CHIL',
    year: 2026,
    url: 'https://arxiv.org/abs/2605.08963',
  },
  {
    title: 'FlowPath: Learning Data-Driven Manifolds with Invertible Flows for Robust Irregularly-Sampled Time Series Classification',
    venue: 'AAAI',
    year: 2026,
    url: 'https://ojs.aaai.org/index.php/AAAI/article/view/39643',
  },
  {
    title: 'Multi-View Contrastive Learning for Robust Domain Adaptation in Medical Time Series Analysis',
    venue: 'CHIL',
    note: 'Best Paper Award, Models and Methods Track',
    year: 2025,
    url: 'https://proceedings.mlr.press/v287/oh25a.html',
  },
  {
    title: 'Stable Neural Stochastic Differential Equations in Analyzing Irregular Time Series Data',
    venue: 'ICLR',
    note: 'Spotlight, Notable Top 5%',
    year: 2024,
    url: 'https://openreview.net/forum?id=4VIgNuQ1pY',
  },
];

/**
 * News feed. 계획.md §8 — a dated feed from the lab's founding is the cheapest
 * way for a new lab to show activity. Real entries only; never a placeholder.
 */
/**
 * News feed, newest first.
 *
 * Dates are when the work was PRESENTED, not when it was accepted, and are
 * shown as month and year only. Conference dates verified 2026-09-02:
 *   KDD 2026  Aug 9-13,  Jeju      ICML 2026 Jul 6-11,  Seoul
 *   CHIL 2026 Jun 28-30, Seattle   CHIL 2025 Jun 25-27, Berkeley
 */
export const news = [
  {
    date: '2026-09',
    text: 'The Scientific Inference Lab opens at Pusan National University.',
  },
  {
    date: '2026-08',
    text: 'Work on silent failure in federated settings is presented in the KDD 2026 Blue Sky track.',
  },
  {
    date: '2026-07',
    text: 'A single-author position paper on evidence standards for machine learning is presented at ICML 2026.',
  },
  {
    date: '2026-06',
    text: 'Work on survey-aware inference is presented at CHIL 2026.',
  },
  {
    date: '2025-06',
    text: 'Multi-view contrastive learning for medical time series receives the Best Paper Award in the Models and Methods Track at CHIL 2025.',
  },
];


/**
 * Recruiting — deliberately Korean. 계획.md §4: Korean artificial intelligence labs keep the whole
 * site in English and use Korean only for domestic recruiting.
 */
export const joinUs = {
  // Neutral invitation only. Application requirements, eligibility and review
  // timelines are deliberately NOT stated — they are undecided (계획.md §7),
  // and inventing them would misinform applicants.
  heading: 'Work with us',
  body:
    'The Scientific Inference Lab is interested in hearing from people who ' +
    'want to work on modeling, inference, and decision making in scientific ' +
    'and engineering systems. Enquiries are welcome by email.',
};

export const content = {
  skipToContent: 'Skip to content',
  header: {
    navigationLabel: 'Main',
    explore: 'Explore',
  },
  research: {
    eyebrow: 'Research',
    // The lab's actual research question, not a filler headline.
    title: 'When can a model be trusted, as evidence and in deployment?',
    lede: site.intro,
  },
  publications: {
    eyebrow: 'Publications',
    title: 'Selected work',
    // No lede. The heading already says these are selected, and the link below
    // points to the full record; a summary line here would either restate that
    // or, as an earlier version did, imply this list is the whole output.
    fullList: 'Full publication list on Google Scholar',
  },
  people: {
    eyebrow: 'People',
    title: 'Led by',
    education: 'Education',
    appointments: 'Appointments',
    links: {
      scholar: 'Google Scholar',
      github: 'GitHub',
      linkedin: 'LinkedIn',
      personal: 'Personal site',
    },
  },
  news: {
    eyebrow: 'News',
    title: 'Recent updates',
  },
  joinUs: {
    eyebrow: 'Join Us',
  },
  contact: {
    eyebrow: 'Contact',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
  },
};

export const nav = [
  { href: '#research', label: 'Research' },
  { href: '#publications', label: 'Publications' },
  { href: '#people', label: 'People' },
  { href: '#news', label: 'News' },
  { href: '#join', label: 'Join Us' },
];
