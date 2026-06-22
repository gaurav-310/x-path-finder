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

```java
public void selectDropdownOptionByPosition(String dropdownXpath, String optionNo) throws Exception {
    WebDriver driver = DriverManagerThreadSafe.getDriver();
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));

    // 1. Click the dropdown to open it
    WebElement dropdown = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(dropdownXpath)));
    dropdown.click();
    Thread.sleep(1000);

    // 2. Click the option at the given position
    String optionXpath = "(//*[@role='option'])[" + optionNo + "]";
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
    var optionXpath = "(//*[@role='option'])[" + optionNo + "]";
    var opt = xp(optionXpath);
    if (!opt) { console.error("Option #" + optionNo + " NOT found:", optionXpath); return; }
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
| `(//*[@role='option'])[N]` | `(//*[@role='option'])[N]` |
| `dropdown.click()` then `option.click()` | `clickEl(dd)` then `clickEl(opt)` |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Options aren't `role='option'` (rare in Lightning) | Change the option XPath in **both** places to `(//lightning-base-combobox-item)[N]` |
| Option clicks too early / not found | Increase the console `setTimeout` from `800` ms, or the Java `Duration.ofSeconds(20)` wait |
| Dropdown doesn't open | Confirm `dropdownXpath` is the **clickable trigger** (use the XPath Finder's `[clickable]` badge) |
| Wrong option selected | Remember `optionNo` is **1‑based** — the first option is `1`, not `0` |
