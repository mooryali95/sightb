# Design system

The rules every screen follows. Each one is enforced by a test or a CI
step where it can be; the step is named next to the rule.

## Direction and language

- The app is Arabic and right to left. `DirectionProvider dir="rtl"` wraps it
  (`src/App.tsx`).
- Use logical classes only: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`, `text-end`. Never `ml-`, `mr-`, `left-`, `right-`.
- Isolate mixed-direction text (emails, codes, amounts inside sentences) with
  `<bdi>` or `dir="ltr"`.
- Counted nouns go through `countAr(n, noun)` in `src/lib/plural.ts`:
  «مصروف واحد», «مصروفان», «3 مصروفات», «11 مصروفًا». A phrase after the
  count must agree with every form, so prefer a neutral one («بانتظار
  الاعتماد», «بلا ربط») or put the count last («مخاطر مفتوحة: 2»).
- Dates come from `todayLocal()` and are read on Riyadh's calendar.
  `scripts/date-guard.sh`.

## Colour

Colours come from the theme's tokens, defined in `src/index.css` for light
and dark and exposed in `tailwind.config.ts`. `scripts/colour-guard.sh`
enforces this.

| Token | Meaning | Typical use |
|---|---|---|
| `primary` | brand, the main action | buttons, links, active tabs |
| `success` | done, healthy, collected | approved, paid, under budget |
| `warning` | needs attention | pending, invoiced, medium risk |
| `destructive` | wrong or refused | rejected, over budget, delete |
| `info` | in progress, neutral state | planning, submitted, transferred |
| `muted` | secondary text and surfaces | captions, empty states |

- Badges: `bg-<token>/10 text-<token>`. Borders: `border-<token>/30`.
  Use a deeper fill (`/20`, `/25`) only to separate neighbouring states of
  one token, such as medium and high risk.
- No `dark:` colour variants; each token carries its dark value.
- Category hues (violet, indigo, cyan) mark kinds such as custody columns, not
  states, and may be used directly.
- Chart colours come from `src/lib/chart-colors.ts`: `STATUS` for meaning,
  `SERIES` for categories. SVG attributes do not resolve CSS variables, so
  these are literals.

## Type and numbers

- Amounts use `formatCurrency` and `tabular-nums`, so columns line up.
- No `letter-spacing` on Arabic text.
- The smallest text is `text-xs`; nothing smaller.

## Icons

- One set: `lucide-react`. No emoji as an icon in a control.
- An icon-only button has an `aria-label` or a `title`; `Button` falls back
  to the title. The axe suite (`e2e/accessibility.spec.ts`) fails otherwise.
- Decorative icons get `aria-hidden="true"`.

## Layout and motion

- Spacing on Tailwind's scale; no arbitrary pixel values for spacing.
- Hit targets at least 24px (`.hit` extends a small one).
- Motion respects reduced motion: `MotionConfig reducedMotion="user"` and the
  global rule in `src/index.css`.
- Phone width is 390px. Sections below the fold load when needed
  (`DeferUntilVisible`); long card groups fold behind one button on a phone.

## Accessibility

WCAG 2.2 AA. `e2e/accessibility.spec.ts` runs axe on 13 routes, at phone and
desktop width, in light and dark mode: 52 runs, zero violations allowed.
