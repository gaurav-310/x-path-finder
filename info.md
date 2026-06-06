# Salesforce QA Automation Toolkit

> Browser-based tools that cut Salesforce Lightning test script
> authoring time from **15-30 minutes per scenario to under 30 seconds**.

---

## The Problem

Writing Salesforce Lightning UI tests was the team's biggest QA
bottleneck. For every test step, an engineer had to manually:

1. **Open DevTools and inspect the element** — figure out which `<div>`,
   `<span>`, or `<a>` was the right target inside a deeply nested
   Lightning Web Component tree.
2. **Hand-craft an XPath** — usually starting with right-click "Copy
   XPath", which produces a fragile positional path like
   `/html/body/div[4]/section/div[2]/button` that breaks the moment
   anything in the DOM shifts.
3. **Write XML page object entries** — add `<object objectId>` and
   `<objectProperty>xpath=...</objectProperty>` to the framework's XML
   file for every element used.
4. **Write Gherkin steps** in the `.feature` file.
5. **Write or reuse `@Then` step definitions** in Java.
6. **Write or reuse helper methods** in `StepDefinitionHelperWeb.java`.

A single 15-step test scenario consumed **15-30 minutes** of pure
boilerplate before any actual testing logic was written.

### Why it broke so often

- **Salesforce regenerates IDs** across page loads (`id="input-2847"`
  one session, `id="input-8419"` the next).
- **Salesforce Lightning Web Components use Shadow DOM** — regular
  XPath cannot see inside `<lightning-button>`, `<lightning-input>`,
  etc., so most tools and tutorials don't work.
- **Record IDs in URLs change** between orgs, sandboxes, and even
  records (e.g., `/lightning/r/Account/001000000ABCXYZ/view`).
- **Dynamic text values** — case numbers, timestamps, generated
  names — vary every run.
- **Layout changes** in releases push columns around.
- **Same text appears in multiple places** — three "Save" buttons in
  three sections, eight "Edit" links across rows.

The result: tests were slow to write, broke on every Salesforce
release, and team morale around Selenium maintenance was low.

---

## What I Built

Three tools that work together, all built with **vanilla JavaScript**
(no extension, no installation, no npm dependencies for the runtime).

### 1. XPath Finder

A paste-in-Console (or bookmarklet) script that:

- Adds a floating "XPath: ON / OFF" button toggleable with
  `Cmd/Ctrl + Shift + X`.
- **Blocks** mousedown / pointerdown / click / focusout / blur events
  when ON, so clicking a dropdown trigger doesn't open it and clicking
  a dropdown option doesn't close the dropdown — you can inspect
  options inside an open menu without it disappearing.
- Uses `event.composedPath()` to **pierce Shadow DOM** and find the
  actual element the user clicked, even when the click target appears
  to be a custom `<lightning-button>` wrapper.
- Walks up from SVG/icon clicks to the parent clickable element.
- **Generates 20+ candidate XPaths** using different strategies, then
  validates each one with `document.evaluate("count(...)")` to see if
  it uniquely identifies the element.
- **Ranks** the candidates by a quality score (positional XPaths
  penalized +100, dynamic IDs +60, `data-*` attributes -25,
  table-anchored -35, heading-anchored -30).
- Uses a **diversity filter** so the 5 results shown come from
  different techniques (text, sibling, ancestor, table row, modal
  scope, etc.) — not 5 versions of the same approach.
- Detects **dynamic values** (timestamps, case numbers, record IDs,
  GUIDs, ISO dates) and penalizes XPaths that depend on them.
- Generates **combination XPaths** like
  `//button[@title='Save' and @name='action']` when no single
  attribute is unique.

**XPath strategies included:**

| Technique | Example |
|---|---|
| Salesforce text + parent | `//span[text()='Save']/parent::button` |
| Lightning data-label wrapper | `//*[@data-label='Account Name']//input` |
| Sibling label | `//label[text()='Email']/following-sibling::input` |
| Following / preceding axis | `//label[text()='Email']/following::input[1]` |
| Modal-scoped | `//section[contains(@class,'slds-modal')]//button[normalize-space()='Save']` |
| Visible-only filter | `//button[normalize-space()='Save' and not(ancestor-or-self::*[@hidden])]` |
| Table row + link text | `//tr[.//*[normalize-space()='415-555-1212']]//a[normalize-space()='Acme']` |
| Table header + column position | `//th[normalize-space()='Account Name']/ancestor::table//tbody//tr[1]/td[count(//th[normalize-space()='Account Name']/preceding-sibling::th)+1]//a[1]` |
| Lightning grid (div role='grid') | `//*[@role='columnheader'][.//*[normalize-space()='Contact Name']]/ancestor::*[@role='grid']//*[@role='row'][2]/*[@role='gridcell'][2]//a` |
| Heading-anchored section | `//h3[normalize-space()='Billing Address']/following::input[1]` |
| Combination (two attrs) | `//button[@title='Save' and @name='action']` |
| Indexed fallback | `(//span[text()='Save']/parent::button)[2]` |

### 2. XPath Recorder

Records an entire test flow and generates the four artifacts the
framework needs:

1. **XML page objects** (`BBCRM.xml` format)
2. **Gherkin steps** for the `.feature` file
3. **`@Then` step definitions** for `StepDefinition.java`
4. **Helper methods** for `StepDefinitionHelperWeb.java`

All matching the team's existing conventions (`btn_`, `lnk_`,
`input_`, `dd_`, `chk_`, `rdo_`, `txt_` prefixes) and the
`##`-placeholder pattern for parameterized XPaths.

Captures clicks, text input, dropdowns, date fields, checkboxes,
modal submits, hover+click sequences, and Enter/Tab/Escape key
presses. Survives full page navigation via `sessionStorage` so
multi-page flows can be recorded in one session.

### 3. Validation Helper (Java for Cucumber/Selenium)

A single Cucumber DataTable step validates any number of properties
on a single locator:

```gherkin
Then I verify "input_AccountName" on "AccountPage" screen has:
  | exists           | true                          |
  | enabled          | true                          |
  | value_not_empty  | true                          |
  | value            | Acme Corp                     |
  | attribute        | data-label=Account Name       |
  | css              | border-color=red              |
  | checked          | true                          |
```

23 check types, including:

- **State**: `exists`, `not_exists`, `count`, `visible`, `enabled`,
  `selected`, `checked` (universal — works for native, Lightning,
  ARIA, toggle switches, class-based "is-selected")
- **Text/Value**: `text`, `text_contains`, `text_not_empty`,
  `text_empty`, `value`, `value_not_empty`, `placeholder`
- **Attributes**: `attribute`, `aria`, `class_contains`
- **CSS/Colors**: `css` (auto-normalizes hex / rgb / named colors:
  `red == #ff0000 == rgb(255,0,0)`), `css_contains`, `style_contains`
- **URL**: `url_contains`

The helper **collects all results before failing** rather than
fail-fast. If 4 out of 5 checks pass, the step still fails — but
you see exactly which one failed and why, instead of stopping at
the first one and rerunning to find the next.

---

## Impact / Results

| Metric | Before | After |
|---|---|---|
| Time to write one test scenario | 15-30 minutes | ~30 seconds |
| Time to find a stable XPath | 2-5 minutes per element | 2 seconds |
| XPaths that need manual validation in Console | All of them | None (auto-validated) |
| Setup required | N/A | Paste in Console (zero install) |
| Survives Salesforce ID regeneration | Often broke | Yes |
| Works inside Shadow DOM | Manual workarounds needed | Automatic |

---

## How I Solved Specific Sub-Problems

### Sub-problem 1: Shadow DOM

**Issue:** Lightning Web Components encapsulate their inner DOM in
shadow roots. Standard XPath can see `<lightning-button>` but not the
`<button>`/`<span>` inside it. The browser's click event reports
`event.target` as the host element, not the actual clicked element.

**Solution:** Use `event.composedPath()` (a Web API that returns the
full event path through all shadow boundaries) to find the real
deepest element. For XPaths, generate locators against the **host**
element (which is reachable from outside) using its `data-id`,
`data-name`, `aria-label`, etc.

### Sub-problem 2: Dynamic IDs and href

**Issue:** Salesforce regenerates IDs (`input-2847` → `input-8419`),
URLs contain record IDs (`/r/Account/001000000ABCXYZ/view`), and
links sometimes have `href="javascript:void(0)"`.

**Solution:** Pattern-based detection of dynamic values
(`/\d{5,}/`, `/^[a-zA-Z0-9]{15,18}$/`, `/^javascript:/`, etc.) plus
score-based ranking that penalizes any XPath whose quoted values look
dynamic by +80. Result: stable XPaths (data-attr, text, neighbor)
always rank above flaky ones.

### Sub-problem 3: Same text in multiple places

**Issue:** "Save" appears on 3 buttons (3 form sections). "Edit"
appears on 8 rows. `//button[text()='Save']` returns 3 matches —
ambiguous for Selenium.

**Solution:** Three layers of disambiguation:
1. **Neighbor-anchored XPaths** — `//label[text()='Email']/following::button[1]`
2. **Modal-scoped XPaths** — only the modal that isn't `display:none`
3. **Combination XPaths** — two stable attributes joined with `and`
4. **Indexed fallback** — `(//button[text()='Save'])[2]` when nothing
   else works, using the actual clicked element's position

### Sub-problem 4: Tables with links

**Issue:** Tables have hundreds of rows. The same link text might appear
in many. The link's `href` is flaky.

**Solution:** Build XPaths that say "in the row containing X, find the
link in column Y":

```xpath
//tr[.//*[normalize-space()='415-555-1212']]
  /td[count(//th[normalize-space()='Account Name']/preceding-sibling::th)+1]
  //a[1]
```

Picks the row anchor from the **cleanest cell** (shortest, single-line,
no nested elements) — typically a phone number, email, or status field.

Also supports **Lightning div-based grids** (`<div role="grid">`
instead of `<table>`) automatically.

### Sub-problem 5: Validation overhead

**Issue:** Each Selenium assertion is its own line of code (or step).
Verifying that a field is visible, enabled, has the right text,
right attribute, right color, etc. takes 5-7 separate calls. First
failure stops the test, hiding subsequent problems.

**Solution:** One DataTable-driven validation step that runs all
checks, logs each result to the HTML report, and only fails at the
end if any check failed.

### Sub-problem 6: Inspecting open dropdowns

**Issue:** Salesforce dropdowns close on focus loss. The moment you
click outside (e.g., on a DevTools inspector), the dropdown options
disappear.

**Solution:** The XPath Finder, while ON, blocks 8 different event
types (`mousedown`, `pointerdown`, `mouseup`, `pointerup`, `click`,
`dblclick`, `contextmenu`, `focusout`, `blur`) at the **capture
phase**. User flow:
1. Toggle OFF
2. Manually open the dropdown
3. Toggle ON
4. Click any option to get its XPath — dropdown stays open
5. Repeat for other options

---

## Technical Stack

| Layer | Tech |
|---|---|
| Finder & Recorder runtime | Vanilla JavaScript (no dependencies, runs in any modern browser) |
| Validation Helper | Java (Cucumber + Selenium WebDriver) |
| Test framework integration | Cucumber `.feature` files, DataTable steps |
| Dev/test environment | jsdom (for verifying logic in Node) |
| Optional dev server | Python 3 (HTTPS for bookmarklet on https sites) |

---

## Resume Bullets (Copy-Paste Ready)

### Short version (3 bullets)

- Built a browser-based XPath generator and test flow recorder using
  vanilla JavaScript that reduced Salesforce Lightning test script
  authoring time from **15-30 minutes per scenario to under 30
  seconds**, with no extension or installation required.
- Designed 20+ XPath strategies optimized for Salesforce Lightning
  patterns (Shadow DOM piercing via `composedPath()`, row/column-
  anchored locators for tables, label-based anchoring for forms,
  modal-scoped XPaths) — each XPath validated live for uniqueness
  using `document.evaluate()` before being suggested.
- Engineered a reusable validation helper for Cucumber/Selenium
  framework supporting 23 check types (text, value, color, checkbox
  state across native + ARIA + Lightning variants) with collect-all-
  then-fail semantics, reducing debug iteration time.

### Talking points for interviews

| Question | Answer |
|---|---|
| What's the hardest technical part? | Shadow DOM. Standard XPath can't see inside it. Solved by using `event.composedPath()` to find the real clicked element through shadow boundaries, and generating XPaths against the host element when needed. |
| Why not use an existing extension? | Browser extensions need IT approval, installation, and Chrome Web Store distribution. The paste-in-Console approach works everywhere with zero friction. |
| How do you ensure XPaths are stable? | Each generated XPath is validated against the live DOM (`document.evaluate("count(...)")`). Then ranked by a quality score that penalizes positional XPaths (+100), dynamic IDs (+60), and dynamic-looking values (+80), while rewarding semantic anchors like `data-*` (-25) and table headers (-35). |
| Why "collect-all-then-fail" for validations? | Fail-fast hides downstream problems. With collect-all, one test run surfaces every issue, so you fix them all in one iteration instead of rerunning 5 times. |
| How does this work with existing framework patterns? | The recorder generates output matching the team's exact conventions — `btn_`/`input_`/`dd_` objectId prefixes, `##` placeholder pattern, the framework's specific XML schema. So it integrates without changes. |

---

## Quick Numbers

- **20+** XPath generation strategies
- **23** validation check types
- **5** ranked suggestions per element, each from a different technique
- **4** generated artifacts per recording (XML / Gherkin / @Then / helpers)
- **8** event types blocked in capture phase (so dropdowns/modals stay open)
- **30x speedup** on test script authoring (15-30 min → 30 sec)
- **0** dependencies, **0** installs, **0** extensions

---

## What I Learned Building This

- Browser event model deeply (capture vs bubble phase, composedPath,
  Shadow DOM event retargeting).
- XPath axes and predicates (`following::`, `preceding-sibling::`,
  `ancestor::`, `count(//th[..]/preceding-sibling::th)+1`).
- Heuristic ranking — there's no single "correct" XPath, only ones
  more or less likely to survive change. Designing scoring functions
  to encode "stability".
- Designing for extensibility — adding a new XPath strategy or
  validation check type is 1-10 lines, not refactoring.
- Balancing precision vs brittleness in locators (e.g., when to use
  exact match vs contains, when to use `text()` vs `normalize-space()`).
- Salesforce internals — LWC, Aura, the SLDS class system, how
  Lightning components emit DOM.

---

# Resume Section

Copy whichever format fits the role you're applying for.

---

## Format 1 — Project entry (standalone project section)

### Salesforce QA Automation Toolkit · Personal / Internal Tooling

> JavaScript-based developer tools that automate Salesforce Lightning test
> script generation and validation for a Cucumber + Selenium framework.

- Built a paste-in-Console XPath generator using vanilla JavaScript that
  reduced Salesforce Lightning test authoring time from **15-30 minutes
  per scenario to under 30 seconds** — no browser extension, no
  installation, no dependencies.
- Designed **20+ XPath generation strategies** optimized for Salesforce
  patterns: Shadow DOM piercing via `event.composedPath()`, label and
  heading anchors using `following::` axes, row+column locators for
  data tables (including div-based Lightning grids), modal scoping,
  and two-attribute combinations when no single attribute is unique.
- Implemented **live XPath validation** with `document.evaluate("count(...)")`
  and a heuristic scoring function (positional XPaths +100, dynamic IDs
  +60, semantic anchors -25 to -35) so suggestions are ranked by
  stability, not just correctness.
- Built a **test flow recorder** that captures clicks, typed values,
  dropdowns, dates, checkbox toggles, and Enter/Tab/Escape keypresses,
  then auto-generates 4 framework artifacts: XML page objects, Gherkin
  steps, `@Then` step definitions, and Java helper methods — all
  matching the team's existing conventions and `##`-placeholder pattern.
- Engineered a **reusable validation helper in Java** for the Cucumber
  framework: a single DataTable step verifies up to **23 properties**
  of an element (existence, text, value, attribute, CSS color with
  hex/rgb/named-color normalization, universal checkbox state across
  native + ARIA + Lightning, etc.) with collect-all-then-fail semantics.

**Tech:** Vanilla JavaScript, XPath, Selenium WebDriver, Cucumber, Java, jsdom, Python

---

## Format 2 — Under a work experience role

Add as a sub-bullet under your current QA Automation / SDET role:

> Designed and shipped a Salesforce-focused XPath generator and test
> recorder tool (vanilla JavaScript, paste-in-Console workflow) that
> cut Lightning test script authoring time from 15-30 min/scenario to
> ~30 seconds, with 20+ ranked locator strategies including Shadow DOM
> piercing, neighbor anchoring, and table row+column anchoring. Paired
> it with a Java validation helper supporting 23 check types in one
> Cucumber DataTable step.

---

## Format 3 — Single line for a skills bullet

> Built browser-based XPath generator and Cucumber test recorder for
> Salesforce Lightning — Shadow DOM aware, 20+ stability-ranked
> locator strategies, ~30x faster test authoring.

---

## Format 4 — Detailed STAR (Situation/Task/Action/Result)

For behavioral interviews or "tell me about a project" sections.

**Situation**

Salesforce Lightning UI test automation was the team's biggest bottleneck.
Engineers spent 15-30 minutes per test scenario manually inspecting DOM,
writing fragile XPaths, and authoring boilerplate XML / Gherkin / Java
across four framework files. Tests broke regularly because of dynamic
IDs, Shadow DOM, and Salesforce record-ID changes between sandboxes.

**Task**

Build a tool that QA engineers could use without IT approval (no
browser extension), without installing anything, without changing the
existing framework — that generates stable XPaths and the four
framework artifacts automatically.

**Action**

- Built a vanilla-JavaScript XPath finder runnable from DevTools Console.
- Used `event.composedPath()` to handle Shadow DOM (Lightning Web Components).
- Wrote 20+ XPath generation strategies covering text, sibling, ancestor,
  table, modal, visible-filter, and combination patterns.
- Validated every candidate live (`document.evaluate("count(...)")`) and
  ranked by a quality score that penalizes flaky patterns and rewards
  semantic anchors.
- Built a recorder that captures full test flows and outputs the four
  framework artifacts (XML / Gherkin / Java step definitions / Java
  helpers) following existing naming conventions.
- Built a Java validation helper for the Cucumber framework with 23
  check types and collect-all-then-fail semantics.

**Result**

- Test script authoring dropped from 15-30 min to ~30 sec per scenario.
- Tests survived Salesforce ID regeneration and sandbox switches.
- The team adopted it for new Salesforce test development.
- Zero install friction — just paste into Console.

---

## Format 5 — One-line elevator pitch

> I built a vanilla-JavaScript paste-in-Console XPath generator + test
> recorder for Salesforce Lightning that handles Shadow DOM, generates
> 20+ ranked locator strategies, and auto-produces Cucumber/Selenium
> page objects and step definitions — cutting test authoring time from
> 15-30 minutes per scenario to ~30 seconds.

---

## Numbers cheat sheet for your resume

Pick the ones that fit your role:

| Number | Phrasing |
|---|---|
| **30x** | speedup on test authoring time |
| **15-30 min → 30 sec** | per-scenario authoring time |
| **20+** | XPath generation strategies |
| **23** | validation check types |
| **5** | ranked suggestions per element (each from a different technique) |
| **4** | framework artifacts generated per recording |
| **8** | event types intercepted (so dropdowns and modals stay open during inspection) |
| **0** | dependencies, installs, or browser extensions |

---

## Action verbs to use

| Used | Action |
|---|---|
| Built | XPath finder, recorder, validation helper |
| Designed | XPath generation strategies, scoring algorithm |
| Engineered | Validation helper with 23 check types |
| Implemented | Shadow DOM detection, dynamic value filtering |
| Reduced | test authoring time by 30x |
| Eliminated | manual XPath validation |
| Automated | page object, Gherkin, step definition, and helper generation |
| Integrated | with existing Cucumber/Selenium framework conventions |
| Optimized | locator stability via heuristic scoring |

---

## What to highlight per role type

**For QA Automation / SDET roles**
- Emphasize: test stability, locator strategies, framework integration,
  validation helper design, cross-browser/cross-environment robustness.

**For Frontend / Web Developer roles**
- Emphasize: Shadow DOM internals, browser event model (capture phase),
  composedPath, DOM traversal algorithms, vanilla JS without dependencies.

**For Full-Stack / Generalist roles**
- Emphasize: end-to-end ownership (Browser JS → Java → Cucumber), zero
  install design constraint, measurable productivity impact.

**For Senior / Tech Lead roles**
- Emphasize: identifying a team bottleneck and building tooling to
  solve it, design choices (paste-in-Console vs extension), heuristic
  scoring trade-offs, framework conventions integration without
  forcing changes.

