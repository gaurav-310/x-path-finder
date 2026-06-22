# Dropdown → Select Option by Position (Keyboard)

Open a dropdown and pick an option **by its number** (1‑based), passing only **two values**:

| Input | Meaning | Example |
|-------|---------|---------|
| `dropdownXpath` | XPath of the dropdown trigger | `//button[@aria-label='Select Address' and @role='combobox']` |
| `optionNo`      | Which option to pick (1‑based) | `2` |

**How it works:** open the dropdown → press **Arrow Down × N** → press **Enter**.

No searching for option elements, so Salesforce shadow DOM doesn't matter. The keys are
sent **directly to the combobox element**, which is what makes Lightning respond.

---

## 1. Step Definition (Cucumber + Selenium)

### Feature file

```gherkin
And I open dropdown "//button[@aria-label='Select Address' and @role='combobox']" and select option number "2"
```

### `StepDefinition.java`

```java
@Then("^I open dropdown \"(.*?)\" and select option number \"(.*?)\"$")
public void i_open_dropdown_and_select_option_number(String dropdownXpath, String optionNo) throws Exception {
    stepDefinitionHelperWebClassInstance.selectDropdownOptionByPosition(dropdownXpath, optionNo);
}
```

### `StepDefinitionHelperWeb.java`

Keys are sent straight to the dropdown element via WebDriver (real, trusted key events).

```java
public void selectDropdownOptionByPosition(String dropdownXpath, String optionNo) throws Exception {
    WebDriver driver = DriverManagerThreadSafe.getDriver();
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));

    // 1. Open the dropdown
    WebElement dropdown = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(dropdownXpath)));
    dropdown.click();
    Thread.sleep(800);

    // 2. Arrow Down N times, then Enter
    int pos = Integer.parseInt(optionNo.trim());
    for (int i = 0; i < pos; i++) {
        dropdown.sendKeys(Keys.ARROW_DOWN);
        Thread.sleep(150);
    }
    dropdown.sendKeys(Keys.ENTER);
    Thread.sleep(800);
}
```

### Imports

```java
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
```

---

## 2. Console Test Script (verified working)

Paste into the browser **DevTools Console**, edit the two values at the top, press Enter.

> **Key trick:** dispatch the keys **directly on the combobox button** (after
> `dd.focus()`), *not* on `document.activeElement`. Done this way, the synthetic
> `keydown`/`keyup` events drive Lightning's combobox navigation correctly.

```javascript
(function () {
  // ===== EDIT THESE TWO =====
  var dropdownXpath = "//button[@aria-label='Select Address' and @role='combobox']";
  var optionNo = 2;   // 1-based
  // ==========================

  function xp(p) {
    return document.evaluate(p, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }
  function triggerKey(el, key) {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: key, code: key }));
    el.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true, key: key, code: key }));
  }
  function clickEl(el) { el.scrollIntoView({ block: "center" }); el.click(); }

  var dd = xp(dropdownXpath);
  if (!dd) { console.error("Dropdown NOT found"); return; }

  console.log("Opening dropdown...");
  clickEl(dd);

  setTimeout(function () {
    dd.focus();
    console.log("Navigating to option #" + optionNo + " using keyboard...");
    for (var i = 0; i < optionNo; i++) triggerKey(dd, "ArrowDown");   // N presses -> Nth option

    setTimeout(function () {
      console.log("Selecting with Enter...");
      triggerKey(dd, "Enter");
      console.log("Done");
    }, 300);
  }, 800);
})();
```

---

## How the two map together

| Step Definition (Java) | Console Script (JS) |
|------------------------|---------------------|
| `dropdownXpath` (1st arg) | `dropdownXpath` variable |
| `optionNo` (2nd arg) | `optionNo` variable |
| `dropdown.click()` | `clickEl(dd)` |
| `dropdown.sendKeys(Keys.ARROW_DOWN)` × N | `triggerKey(dd, "ArrowDown")` × N |
| `dropdown.sendKeys(Keys.ENTER)` | `triggerKey(dd, "Enter")` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Lands on wrong option (off by one) | Change the loop to `i <= pos` or `i < pos - 1` — some comboboxes pre‑highlight option 1 on open |
| Console keyboard does nothing | Dispatch keys **on the combobox button** (`triggerKey(dd, ...)`) after `dd.focus()`, **not** on `document.activeElement` |
| Two dropdowns → wrong one | Make sure `dropdownXpath` is **unique** (verify with the XPath Finder — it should say `unique`). The keys only act on the dropdown you opened/focused. |
| Dropdown doesn't open | Confirm `dropdownXpath` is the **clickable trigger** (XPath Finder shows `[clickable]`) |
| `optionNo` indexing | It's **1‑based** — first option is `1`, not `0` |
