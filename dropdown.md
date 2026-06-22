# Dropdown → Select Option by Position

A reusable way to open a dropdown and click an option **by its number** (1‑based),
passing only **two values**:

| Input | Meaning | Example |
|-------|---------|---------|
| `dropdownXpath` | XPath of the dropdown trigger | `//button[@aria-label='Status']` |
| `optionNo`      | Which option to click (1‑based) | `2` |

**What it does:** clicks the dropdown to open it → clicks the option at the given position.

The option locator is built as `(//*[@role='option'])[N]` — exactly the
position‑based XPath the **XPath Finder** suggests, so the two stay in sync.

---

## 1. Step Definition (Cucumber + Selenium)

### Feature file usage

```gherkin
And I open dropdown "//button[@aria-label='Status']" and select option number "2"
```

### `StepDefinition.java`

```java
@Then("^I open dropdown \"(.*?)\" and select option number \"(.*?)\"$")
public void i_open_dropdown_and_select_option_number(String dropdownXpath, String optionNo) throws Exception {
    stepDefinitionHelperWebClassInstance.selectDropdownOptionByPosition(dropdownXpath, optionNo);
}
```

### `StepDefinitionHelperWeb.java`

> **Scoped to the right dropdown.** When the screen has more than one dropdown,
> a plain `(//*[@role='option'])[N]` counts options across **every** open
> listbox and can land in the wrong one. So after opening the dropdown we read
> its `aria-controls` (the id of *its own* listbox) and look for the option
> only inside that listbox.

```java
public void selectDropdownOptionByPosition(String dropdownXpath, String optionNo) throws Exception {
    WebDriver driver = DriverManagerThreadSafe.getDriver();
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));

    // 1. Click the dropdown to open it
    WebElement dropdown = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(dropdownXpath)));
    dropdown.click();
    Thread.sleep(1000);

    // 2. Find THIS dropdown's own listbox (aria-controls points to its id)
    String listboxId = dropdown.getAttribute("aria-controls");
    if (listboxId == null || listboxId.isEmpty()) {
        // the attribute may sit on an inner input instead of the clicked element
        try {
            listboxId = dropdown.findElement(By.xpath(".//*[@aria-controls]")).getAttribute("aria-controls");
        } catch (Exception ignore) { /* fall through to container scope */ }
    }

    // 3. Build an option XPath scoped to this dropdown only
    String optionXpath;
    if (listboxId != null && !listboxId.isEmpty()) {
        optionXpath = "(//*[@id='" + listboxId + "']//*[@role='option'])[" + optionNo + "]";
    } else {
        // fallback: scope to the combobox container that holds the trigger
        optionXpath = "(" + dropdownXpath +
            "/ancestor-or-self::*[contains(@class,'slds-combobox') or @role='combobox'][1]" +
            "//*[@role='option'])[" + optionNo + "]";
    }

    // 4. Click the option at the given position
    WebElement option = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(optionXpath)));
    option.click();
    Thread.sleep(1000);
}
```

### Imports (add if missing)

```java
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
```

---

## 2. Console Test Script

Paste this into the browser **DevTools Console**. Edit the two values at the top,
then press Enter. It performs the **same** open‑then‑click‑by‑position behavior so
you can verify before wiring it into a test.

```javascript
(function () {
  // ===== EDIT THESE TWO =====
  var dropdownXpath = "PASTE_DROPDOWN_XPATH_HERE";
  var optionNo = 2;   // which option to click (1-based)
  // ==========================

  function xp(p) {
    return document.evaluate(p, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function clickEl(el) {
    el.scrollIntoView({ block: "center" });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.click();
  }

  var dd = xp(dropdownXpath);
  if (!dd) { console.error("Dropdown NOT found:", dropdownXpath); return; }
  console.log("Opening dropdown...");
  clickEl(dd);

  // options render async, so wait a moment before clicking
  setTimeout(function () {
    // find the listbox that belongs to THIS dropdown (handles multiple dropdowns)
    var listbox = null;
    var controls = dd.getAttribute && dd.getAttribute("aria-controls");
    if (!controls) {
      var inner = dd.querySelector && dd.querySelector("[aria-controls]");
      if (inner) controls = inner.getAttribute("aria-controls");
    }
    if (controls) listbox = document.getElementById(controls);
    if (!listbox) {
      var box = dd.closest("lightning-combobox,lightning-base-combobox,lightning-grouped-combobox,.slds-combobox,[role='combobox']");
      if (box) listbox = box.querySelector("[role='listbox']") || box;
    }
    if (!listbox) {
      // last resort: the visible listbox currently on screen
      var boxes = Array.prototype.slice.call(document.querySelectorAll("[role='listbox']")).filter(visible);
      listbox = boxes[boxes.length - 1] || document;
    }

    var opts = Array.prototype.slice
      .call(listbox.querySelectorAll("[role='option'],lightning-base-combobox-item"))
      .filter(visible);
    console.log("Options in THIS dropdown:", opts.length);

    var opt = opts[optionNo - 1];
    if (!opt) { console.error("Option #" + optionNo + " NOT found (only " + opts.length + ")."); return; }
    console.log("Clicking option #" + optionNo + " -> \"" + opt.textContent.trim() + "\"");
    clickEl(opt);
    console.log("Done.");
  }, 800);
})();
```

---

## How the two map together

| Step Definition | Console Script |
|-----------------|----------------|
| `dropdownXpath` (1st arg) | `dropdownXpath` variable |
| `optionNo` (2nd arg) | `optionNo` variable |
| scope by `aria-controls` listbox id | scope by `aria-controls` → `getElementById` |
| `dropdown.click()` then `option.click()` | `clickEl(dd)` then `clickEl(opt)` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| **Two dropdowns → wrong one selected** | Already handled: options are scoped to the opened dropdown's own `aria-controls` listbox. Just make sure `dropdownXpath` uniquely points to the **correct** trigger (verify with the XPath Finder — it should say `unique`). |
| Options aren't `role='option'` (rare in Lightning) | The console script already also matches `lightning-base-combobox-item`. For Java, change `//*[@role='option']` to `//lightning-base-combobox-item`. |
| Option clicks too early / not found | Increase the console `setTimeout` from `800` ms, or the Java `Duration.ofSeconds(20)` wait |
| Dropdown doesn't open | Confirm `dropdownXpath` is the **clickable trigger** (use the XPath Finder's `[clickable]` badge) |
| Wrong option selected | Remember `optionNo` is **1‑based** — the first option is `1`, not `0` |
