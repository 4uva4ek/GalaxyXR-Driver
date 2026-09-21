import { css } from 'lit';

// Adopt this in every Shadow DOM boundary containing native controls. Document
// CSS does not reach a page's buttons, inputs, links or dialogs through a shadow root.
export const interactiveStyles = css`
  *, *::before, *::after { box-sizing: border-box; }
  :host { color: var(--colorNeutralForeground1, #242424); font-family: var(--fontFamilyBase, "Segoe UI", system-ui, sans-serif); }
  [hidden] { display: none !important; }
  button, input, select, textarea { font: inherit; }
  button, .btn {
    color: var(--colorNeutralForeground1, #242424);
    background: var(--colorNeutralBackground1, #fff);
    border: 1px solid var(--colorNeutralStroke1, #d1d1d1);
    border-bottom-color: var(--colorNeutralStrokeAccessible, #616161);
    border-radius: var(--borderRadiusMedium, 4px);
    min-height: 32px;
    padding: 5px 12px;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--colorNeutralBackground1Hover, #f5f5f5); }
  button:active:not(:disabled) { background: var(--colorNeutralBackground1Pressed, #e0e0e0); }
  button.primary, button.btn-primary {
    background: var(--colorBrandBackground, #0f6cbd);
    color: var(--colorNeutralForegroundOnBrand, #fff);
    border-color: transparent;
  }
  button.primary:hover:not(:disabled), button.btn-primary:hover:not(:disabled) { background: var(--colorBrandBackgroundHover, #115ea3); }
  button:disabled { cursor: not-allowed; color: var(--colorNeutralForegroundDisabled, #bdbdbd); background: var(--colorNeutralBackgroundDisabled, #f0f0f0); }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [role="button"]:focus-visible {
    outline: 2px solid var(--colorStrokeFocus2, #000); outline-offset: 2px;
  }
  input, select, textarea { color: var(--colorNeutralForeground1, #242424); background: var(--colorNeutralBackground1, #fff); border: 1px solid var(--colorNeutralStroke1, #d1d1d1); border-radius: 4px; }
  input:disabled, select:disabled, textarea:disabled { color: var(--colorNeutralForegroundDisabled, #bdbdbd); }
  a { color: var(--colorBrandForegroundLink, #115ea3); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:visited { color: var(--colorBrandForegroundLink, #115ea3); }
  hr { border: 0; border-top: 1px solid var(--colorNeutralStroke2, #e0e0e0); }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
