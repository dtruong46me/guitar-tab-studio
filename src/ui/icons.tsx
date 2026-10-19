/** 16px stroke icons drawn in currentColor (design system: Iconography). */
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  undo: svg(
    <>
      <path d="M5 4 2 7l3 3" />
      <path d="M2 7h8a4 4 0 0 1 0 8H7" />
    </>,
  ),
  redo: svg(
    <>
      <path d="m11 4 3 3-3 3" />
      <path d="M14 7H6a4 4 0 0 0 0 8h3" />
    </>,
  ),
  save: svg(
    <>
      <path d="M3 2h8l3 3v9H2V2z" />
      <path d="M5 2v4h5V2M5 14v-4h6v4" />
    </>,
  ),
  pdf: svg(
    <>
      <path d="M4 1.5h6l3 3V14.5H4z" />
      <path d="M10 1.5v3h3M6.5 9h4M6.5 11.5h4M6.5 6.5h2" />
    </>,
  ),
  folder: svg(<path d="M1.5 3.5h5l1.5 2h6.5v8h-13z" />),
  plus: svg(<path d="M8 3v10M3 8h10" />),
  minus: svg(<path d="M3 8h10" />),
  trash: svg(
    <>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 10h6.6L12 4" />
    </>,
  ),
  copy: svg(
    <>
      <rect x="5" y="5" width="9" height="9" rx="1" />
      <path d="M11 5V2H2v9h3" />
    </>,
  ),
  help: svg(
    <>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1V10M8 12v.2" />
    </>,
  ),
  sun: svg(
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" />
    </>,
  ),
  moon: svg(<path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" />),
  close: svg(<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />),
  left: svg(<path d="M10 3 5 8l5 5" />),
  right: svg(<path d="m6 3 5 5-5 5" />),
  download: svg(
    <>
      <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M2.5 14h11" />
    </>,
  ),
  upload: svg(
    <>
      <path d="M8 11V2M4.5 5.5 8 2l3.5 3.5M2.5 14h11" />
    </>,
  ),
  edit: svg(<path d="M10.5 2.5l3 3L5 14H2v-3z" />),
};
