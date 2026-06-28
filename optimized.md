# Optimize `enterAndSelectMatchingOption` (Lightning combobox/lookup)

The original method was slow because of **fixed `Thread.sleep` calls** (~7–8s per call
regardless of page speed). This version replaces them with **explicit waits that return
the instant the condition is met** — same flow, typically **~1–2s**.

## What made it slow → the fix

| Old (fixed sleep) | New | Savings |
|-------------------|-----|---------|
| `Thread.sleep(3000)` for autocomplete | `wait.until(option appears)` | ~2–3s |
| `sleep(1000)` after clear + `sleep(500)` focus + `sleep(500)` before type | type immediately | ~2s |
| `sleep(1000)` after option click | `wait.until(value set)` | ~0.7s |
| `sleep(500)` per clear strategy | removed (JS clear is synchronous) | ~1–1.5s |
| `sleep(500)` per pill removal | removed | ~0.5s+ |

The waits self-tune: they wait up to 10s **only when needed** and return immediately on fast pages.

---

## `enterAndSelectMatchingOption` (optimized)

```java
public void enterAndSelectMatchingOption(String dataField,
                                         String inputField,
                                         String screenName) {
    String strDataValue = "";
    try {
        WebDriver driver = DriverManagerThreadSafe.getDriver();
        JavascriptExecutor js = (JavascriptExecutor) driver;
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        wait.pollingEvery(Duration.ofMillis(150));

        String os = System.getProperty("os.name").toLowerCase();
        Keys modifierKey = os.contains("mac") ? Keys.COMMAND : Keys.CONTROL;

        // Step 1: Resolve value
        strDataValue = getGlobalOrDatajsonData(dataField).trim();
        Logger.info("Value to enter and select: " + strDataValue);
        if (strDataValue.isEmpty()) {
            htmlReporterWebClassInstance.reportStep(
                "<b>" + screenName + "</b> Enter and select " + dataField,
                "<p style='color:red;'>Data value is empty for field: " + dataField + "</p>",
                false, true);
            return;
        }

        // Step 2: Resolve input element
        String[] inputObjectPropertyArray = this.getGetLocator(inputField, screenName);
        this.findElementType(inputObjectPropertyArray[1], locator.valueOf(inputObjectPropertyArray[0]));
        WebElement inputElement = DriverManagerThreadSafe.getElement();

        // Step 3+4: Clear existing pill + field (sleep-free internally)
        clearLightningSelectedValue(inputElement, inputField);
        clearLightningInputField(inputElement, inputField, screenName, modifierKey);

        // Step 5: focus + type (no fixed sleeps)
        js.executeScript("arguments[0].focus();", inputElement);
        inputElement.click();
        inputElement.sendKeys(strDataValue);
        Logger.info("Entered value: " + strDataValue + " in field: " + inputField);

        // Step 6: WAIT for the matching option (replaces Thread.sleep(3000))
        WebElement matchingOption = waitForLightningOption(strDataValue, wait);

        // Step 7: Click it
        if (matchingOption != null) {
            js.executeScript("arguments[0].scrollIntoView({block:'center'}); arguments[0].click();",
                             matchingOption);
            try {
                wait.until(d -> {
                    String v = inputElement.getAttribute("value");
                    return v != null && !v.trim().isEmpty();
                });
            } catch (Exception ignore) { /* best-effort verification */ }

            Logger.info("Field value after selection: " + inputElement.getAttribute("value"));
            htmlReporterWebClassInstance.reportStep(
                "<b>" + screenName + "</b> Enter and select value in " + inputField,
                "User entered <b>" + strDataValue + "</b> in <b>" + inputField
                    + "</b> and selected matching option successfully.",
                true, true);
        } else {
            htmlReporterWebClassInstance.reportStep(
                "<b>" + screenName + "</b> Enter and select value in " + inputField,
                "<p style='color:red;'>No matching option found for value: " + strDataValue + "</p>",
                false, true);
        }

    } catch (Exception e) {
        Logger.info("Exception in enterAndSelectMatchingOption: " + e);
        htmlReporterWebClassInstance.reportStep(
            "<b>" + screenName + "</b> Enter and select value in " + inputField,
            "<p style='color:red;'>Unable to enter and select " + strDataValue + " due to :: " + e + "</p>",
            false, true);
    }
}

/** Poll for the matching option; returns as soon as it appears (or null on timeout). */
private WebElement waitForLightningOption(String value, WebDriverWait wait) {
    try {
        return wait.until(d -> {
            try { return findLightningOption(value); }   // your existing matcher
            catch (Exception ex) { return null; }        // keep polling on transient errors
        });
    } catch (TimeoutException te) {
        Logger.info("No option appeared for: " + value);
        return null;
    }
}
```

---

## `clearLightningInputField` (sleep-free fast path)

```java
private boolean clearLightningInputField(WebElement element, String fieldName,
                                         String screenName, Keys modifierKey) {
    try {
        String initialValue = element.getAttribute("value");
        if (initialValue == null || initialValue.isEmpty()) return true;   // already empty

        JavascriptExecutor js = (JavascriptExecutor) DriverManagerThreadSafe.getDriver();

        // Strategy 1: Lightning JS clear with events (instant, usually wins)
        js.executeScript(
            "arguments[0].value='';" +
            "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));" +
            "arguments[0].dispatchEvent(new Event('change',{bubbles:true}));" +
            "arguments[0].dispatchEvent(new Event('blur',{bubbles:true}));",
            element);
        String afterJS = element.getAttribute("value");
        if (afterJS == null || afterJS.isEmpty()) return true;

        // Strategy 2: Selenium clear()
        element.clear();
        if (isEmptyValue(element)) return true;

        // Strategy 3: Select-All + Delete (OS-agnostic)
        element.click();
        element.sendKeys(Keys.chord(modifierKey, "a"));
        element.sendKeys(Keys.DELETE);
        return isEmptyValue(element);

    } catch (Exception e) {
        Logger.info("Error while clearing field: " + e.getMessage());
        return false;
    }
}

private boolean isEmptyValue(WebElement el) {
    String v = el.getAttribute("value");
    return v == null || v.isEmpty();
}
```

For `clearLightningSelectedValue`, just **remove the `Thread.sleep(500)`** after each
pill/remove-button click — the `findElements` checks are cheap and need no pause between removals.

---

## Imports

```java
import java.time.Duration;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.TimeoutException;
```

## Notes
- The flow is unchanged: clear pill → clear field → type → select matching option → verify → report.
- If a very slow tenant causes rare flakiness, raise `Duration.ofSeconds(10)` to `15`; fast pages are unaffected.
- Optional next step: make `findLightningOption` a single combined XPath instead of several lookups for another small win.
