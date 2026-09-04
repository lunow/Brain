/** Minimal monochrome icon set, drawn inline so it inherits `currentColor`
 *  and needs no icon-font/library dependency. */

export function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.17157C6.43679 2.5 6.69114 2.60536 6.87868 2.79289L7.79289 3.70711C7.98043 3.89464 8.23478 4 8.5 4H13.5C14.0523 4 14.5 4.44772 14.5 5V12C14.5 12.5523 14.0523 13 13.5 13H2.5C1.94772 13 1.5 12.5523 1.5 12V3.5Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Same folder, lid tipped back — shown in place of {@link FolderIcon} while
 *  the row is expanded so open/closed state doesn't rely on a separate
 *  disclosure glyph. */
export function FolderOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.17157C6.43679 2.5 6.69114 2.60536 6.87868 2.79289L7.79289 3.70711C7.98043 3.89464 8.23478 4 8.5 4H13.5C14.0523 4 14.5 4.44772 14.5 5V5.5H4.67295C4.26469 5.5 3.90298 5.76469 3.77802 6.15311L2.19295 11.0801C2.11226 11.3305 1.86368 11.5 1.58426 11.5H1.5V3.5Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M2.19295 11.0801L3.77802 6.15311C3.90298 5.76469 4.26469 5.5 4.67295 5.5H14.2266C14.8767 5.5 15.343 6.1279 15.1531 6.74971L13.7326 11.4197C13.6068 11.8313 13.2266 12.1132 12.7961 12.1132H2.68035C2.30513 12.1132 2.05683 11.7207 2.19295 11.0801Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Opens the Settings panel from the Ideate/Review sidebar headers. */
export function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M8 1.8v1.5M8 12.7v1.5M14.2 8h-1.5M3.3 8H1.8M12.3 3.7l-1.1 1.1M4.8 11.1l-1.1 1.1M12.3 12.3l-1.1-1.1M4.8 4.9 3.7 3.7"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Marks a review suggestion as good/bad feedback (distinct from
 *  accept/reject, which apply the edit — this just rates the suggestion
 *  itself). */
export function ThumbsUpIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M6.5 7v6.5H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.5Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 7 9 2.5c.5-.5 1.5-.3 1.6.5l-.4 3.5h2.1c.7 0 1.2.7 1 1.4l-1.2 5c-.1.5-.6 1.1-1.1 1.1H6.5V7Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three-pane glyphs used by the panel-visibility toggle buttons — an
 *  outlined layout with the pane each button controls picked out by a
 *  filled segment, so the icon itself explains what it toggles. */
export function ToggleFoldersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2 3.6C2 3.27 2.27 3 2.6 3H5.4C5.73 3 6 3.27 6 3.6V12.4C6 12.73 5.73 13 5.4 13H2.6C2.27 13 2 12.73 2 12.4V3.6Z" fill="currentColor" fillOpacity="0.35" />
      <line x1="5.9" y1="3" x2="5.9" y2="13" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function ToggleFilesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M6 3H10V13H6V3Z" fill="currentColor" fillOpacity="0.35" />
      <line x1="5.9" y1="3" x2="5.9" y2="13" stroke="currentColor" strokeWidth="1.1" />
      <line x1="10.1" y1="3" x2="10.1" y2="13" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

export function ToggleSidebarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M10.6 3H13.4C13.73 3 14 3.27 14 3.6V12.4C14 12.73 13.73 13 13.4 13H10.6V3Z" fill="currentColor" fillOpacity="0.35" />
      <line x1="10.1" y1="3" x2="10.1" y2="13" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

/** Width-preset glyphs for the toolbar — an outlined page with a filled
 *  center column whose own width tracks the measure it selects, so the
 *  icon shows the effect rather than naming it. */
export function WidthNarrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="5.5" y="3" width="5" height="10" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}

export function WidthNormalIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="3.5" y="3" width="9" height="10" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}

export function WidthFullIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
      <rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="currentColor" fillOpacity="0.35" />
    </svg>
  );
}

/** Up-arrow-from-tray glyph for the Export action. */
export function ExportIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 2.3v7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5 5.3 8 2.3l3 3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M2.5 10.3v2.2A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-2.2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Folder-within-a-folder glyph for the "include subfolders" toggle —
 *  reuses {@link FolderIcon}'s path twice at different scale so nesting
 *  reads at a glance. */
export function SubfoldersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.17157C6.43679 2.5 6.69114 2.60536 6.87868 2.79289L7.79289 3.70711C7.98043 3.89464 8.23478 4 8.5 4H13.5C14.0523 4 14.5 4.44772 14.5 5V12C14.5 12.5523 14.0523 13 13.5 13H2.5C1.94772 13 1.5 12.5523 1.5 12V3.5Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="1"
      />
      <g transform="translate(4.4 4.6) scale(0.6)">
        <path
          d="M1.5 3.5C1.5 2.94772 1.94772 2.5 2.5 2.5H6.17157C6.43679 2.5 6.69114 2.60536 6.87868 2.79289L7.79289 3.70711C7.98043 3.89464 8.23478 4 8.5 4H13.5C14.0523 4 14.5 4.44772 14.5 5V12C14.5 12.5523 14.0523 13 13.5 13H2.5C1.94772 13 1.5 12.5523 1.5 12V3.5Z"
          fill="currentColor"
          fillOpacity="0.35"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </g>
    </svg>
  );
}

/** Four outward-pointing corner brackets for the fullscreen (distraction-free
 *  writing) toggle. */
export function FullscreenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M2 5.5V3.5A1.5 1.5 0 0 1 3.5 2H5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M10.5 2H12.5A1.5 1.5 0 0 1 14 3.5V5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M14 10.5V12.5A1.5 1.5 0 0 1 12.5 14H10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M5.5 14H3.5A1.5 1.5 0 0 1 2 12.5V10.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function ThumbsDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g transform="rotate(180 8 8)">
        <path
          d="M6.5 7v6.5H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h2.5Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 7 9 2.5c.5-.5 1.5-.3 1.6.5l-.4 3.5h2.1c.7 0 1.2.7 1 1.4l-1.2 5c-.1.5-.6 1.1-1.1 1.1H6.5V7Z"
          fill="currentColor"
          fillOpacity="0.15"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
