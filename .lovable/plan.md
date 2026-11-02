# Analyze and simplify the interface, data views, and data entry

## Goal
Use your signed-in session to review the real pages with your actual data. Then simplify what you see and how you enter data, without touching protected work.

## Step 1 — Review with your real data (no changes)
- Open the dashboard, the finance screen, and one company, portfolio, and project page each. Then open the add/edit windows for expenses, revenue, custody, and payments. Take screenshots on desktop and on your current screen size.
- Report back with: what confuses people, numbers that repeat or contradict each other, too many fields or steps, and slow or empty loading screens.
- Last time, the sign-in check at the code step stopped this review. If that happens again, I stop and tell you. I will not bypass the code step.

## Step 2 — Simplify (visual only, within Lovable's allowed scope)
1. **Faster feel:** grey placeholder blocks while pages load instead of full-screen spinners, and a sidebar that stays in place when you switch pages.
2. **Lighter project page on phones:** a short header with the 4 key numbers. Everything else goes into collapsible sections.
3. **Easier entry forms (revenue, custody, payments, milestones):** fields in a clear order, required fields marked, sensible defaults (today's date, current project), explanations under fields, and clear Arabic error messages.
4. **Clearer numbers:** one label and one short explanation for each figure everywhere it appears, so the same number never has two names.

## Out of Lovable's scope (sent to Claude/GitHub as advice only)
- The expense form, the sign-in pages, and the financial calculations are protected. Any problems found there go into the advice file for Claude. I will not edit them.

## Check
- Screenshots before and after each change, a successful build, and the existing tests still pass.
- Nothing goes live until you publish.
