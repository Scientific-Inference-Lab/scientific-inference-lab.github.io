export const tutorialIds = ['ksc-2026', 'cikm-2025'] as const;

export const tutorials = [
  {
    id: tutorialIds[0],
    venue: 'KIISE KSC 2026',
    title: 'A Practical Guide to Neural Differential Equations',
    date: '2026-12-23',
    detail: 'Scheduled · Tutorial speaker, Pusan National University',
    links: [
      { label: 'KSC program', url: 'https://www.kiise.or.kr/conference/main/getContent.do?CC=KSC&CS=2026&content_no=2596&PARENT_ID=011100' },
      { label: 'Tutorial materials', url: 'https://nde-for-ts.github.io/ksc-2026/' },
    ],
  },
  {
    id: tutorialIds[1],
    venue: 'ACM CIKM 2025',
    title: 'Neural Differential Equations for Continuous-Time Analysis',
    date: '2025-11-10',
    detail: 'Co-organizer and presenter, UCLA · With Dong-Young Lim and Sungil Kim',
    links: [
      { label: 'CIKM program', url: 'https://cikm2025.org/program/tutorials' },
      { label: 'Tutorial materials', url: 'https://nde-for-ts.github.io/cikm-2025/' },
    ],
  },
];
