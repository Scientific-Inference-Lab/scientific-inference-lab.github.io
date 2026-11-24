export const tutorialIds = ['ksc-2026', 'cikm-2025'] as const;

export const tutorials = [
  {
    id: tutorialIds[0],
    venue: 'KIISE KSC 2026',
    title: 'A Practical Guide to Neural Differential Equations',
    date: 'Dec 2026',
    detail: 'Scheduled for December 23 · Tutorial speaker, Pusan National University',
    links: [
      { label: 'KSC program', url: 'https://www.kiise.or.kr/conference/main/getContent.do?CC=KSC&CS=2026&content_no=2596&PARENT_ID=011100' },
    ],
  },
  {
    id: tutorialIds[1],
    venue: 'ACM CIKM 2025',
    title: 'Neural Differential Equations for Continuous-Time Analysis',
    date: 'Nov 2025',
    detail: 'Co-organizer and presenter, UCLA · With Dong-Young Lim and Sungil Kim',
    links: [
      { label: 'CIKM program', url: 'https://cikm2025.org/program/tutorials' },
      { label: 'Tutorial materials', url: 'https://nde-for-ts.github.io/tutorial/' },
    ],
  },
];
