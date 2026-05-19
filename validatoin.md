# Element Validation Helper

A reusable validation function for Cucumber/Selenium Salesforce automation.
Validate **any number of properties** on an element in a single step.

---

## Why this helper

**Problem:** Writing one assertion at a time is slow:

```gherkin
Then I verify text of "input_AccountName" is "Acme"
And I verify "input_AccountName" is enabled
And I verify "input_AccountName" is visible
And I verify "input_AccountName" has class "slds-input"
```

Four steps, four assertions, four lines in the report. If the first one fails, you don't know about the others.

**Solution:** One step with a DataTable that validates everything:

```gherkin
Then I verify "input_AccountName" on "AccountPage" screen has:
  | text           | Acme                |
  | enabled        | true                |
  | visible        | true                |
  | class_contains | slds-input          |
```

One step, all checks run, all results reported, fails only at the end.

---

## Supported check types

| Type | What it checks | Example value |
|---|---|---|
| `exists` | XPath finds at least 1 element | `true` |
| `not_exists` | XPath finds nothing | `true` |
| `count` | Exact number of matches | `3` |
| `visible` | Element is displayed | `true` |
| `enabled` | Element is not disabled | `true` |
| `selected` | Checkbox/radio is checked | `true` |
| `text` | Visible text equals (exact) | `Acme Corp` |
| `text_contains` | Visible text contains substring | `Acme` |
| `value` | Input `value` attribute equals | `12345` |
| `placeholder` | Input placeholder equals | `Search...` |
| `attribute` | Attribute equals (format `attr=value`) | `data-label=Account Name` |
| `class_contains` | CSS class contains substring | `slds-input` |
| `url_contains` | Current page URL contains | `/lightning/o/Account/` |
| `checked` | Universal checkbox/radio state (native + aria + Lightning) | `true` |
| `aria` | aria-* attribute value (format `aria-attr=value`) | `aria-checked=true` |
| `css` | CSS property exact value | `color=rgba(0, 0, 0, 1)` |
| `css_contains` | CSS property contains substring | `color=255` |
| `style_contains` | inline `style` attribute contains | `color:red` |
| `text_not_empty` | Element has any visible text | `true` |
| `value_not_empty` | Input has any value | `true` |
| `text_empty` | Element text is empty | `true` |

---

## Setup — Add to your framework

### 1. Helper method — paste into `StepDefinitionHelperWeb.java`

```java
public static class ValidationResult {
    public boolean passed = true;
    public int passedCount = 0;
    public int failedCount = 0;
    public java.util.List<String> messages = new java.util.ArrayList<>();
}

// =================== Small helpers ===================

private String safeAttr(WebElement el, String name) {
    if (el == null) return "";
    String v = el.getAttribute(name);
    return v == null ? "" : v;
}

private String[] result(boolean ok, String actual) {
    return new String[] { String.valueOf(ok), actual };
}

private String[] cmp(String actual, String expected) {
    return result(actual.equals(expected), actual);
}

private String[] cmpBool(boolean actual, String expected) {
    return result(actual == Boolean.parseBoolean(expected),
                  String.valueOf(actual));
}

private String[] contains(String actual, String expected) {
    return result(actual.contains(expected), actual);
}

private String[] kv(String expected, WebElement el,
                    boolean useCss, boolean isColor) {
    int eq = expected.indexOf('=');
    if (eq <= 0 || el == null)
        return result(false, "invalid format (use key=value)");
    String key = expected.substring(0, eq);
    String exp = expected.substring(eq + 1);
    String actual = useCss ? el.getCssValue(key) : safeAttr(el, key);
    if (actual == null) actual = "";
    boolean ok = isColor
        ? normalizeColor(actual).equals(normalizeColor(exp))
        : actual.equals(exp);
    return result(ok, actual);
}

private boolean isCheckedUniversal(WebElement el) {
    try { if (el.isSelected()) return true; } catch (Exception ignored) {}
    if ("true".equalsIgnoreCase(safeAttr(el, "aria-checked"))) return true;
    if ("true".equalsIgnoreCase(safeAttr(el, "aria-pressed"))) return true;
    String checked = safeAttr(el, "checked");
    if (!checked.isEmpty() && !checked.equalsIgnoreCase("false")) return true;
    String cls = safeAttr(el, "class");
    if (cls.contains("is-checked") || cls.contains("slds-is-selected") ||
        cls.contains("is-active")) return true;
    try {
        WebElement nested = el.findElement(By.cssSelector(
            "input[type='checkbox'],input[type='radio']"));
        if (nested != null && nested.isSelected()) return true;
    } catch (Exception ignored) {}
    return false;
}

private String normalizeColor(String v) {
    if (v == null) return "";
    v = v.trim().toLowerCase().replaceAll("\\s+", "");
    v = v.replaceAll(",1\\)$", ")").replace("rgba(", "rgb(");
    if (v.matches("#[0-9a-f]{6}"))
        v = String.format("rgb(%d,%d,%d)",
            Integer.parseInt(v.substring(1, 3), 16),
            Integer.parseInt(v.substring(3, 5), 16),
            Integer.parseInt(v.substring(5, 7), 16));
    java.util.Map<String, String> named = new java.util.HashMap<>();
    named.put("red", "rgb(255,0,0)");
    named.put("green", "rgb(0,128,0)");
    named.put("blue", "rgb(0,0,255)");
    named.put("white", "rgb(255,255,255)");
    named.put("black", "rgb(0,0,0)");
    named.put("yellow", "rgb(255,255,0)");
    named.put("gray", "rgb(128,128,128)");
    return named.getOrDefault(v, v);
}

// =================== Main check dispatcher ===================

private String[] check(String type, String expected,
                       WebElement el,
                       java.util.List<WebElement> elements) {
    expected = expected == null ? "" : expected.trim();
    String txt = el == null ? "" : el.getText().trim();

    switch (type) {
        case "exists":         return cmp(String.valueOf(!elements.isEmpty()), expected);
        case "not_exists":     return cmp(String.valueOf(elements.isEmpty()), expected);
        case "count":          return cmp(String.valueOf(elements.size()), expected);
        case "visible":        return el == null ? result(false, "no element")
                                                 : cmpBool(el.isDisplayed(), expected);
        case "enabled":        return el == null ? result(false, "no element")
                                                 : cmpBool(el.isEnabled(), expected);
        case "selected":       return el == null ? result(false, "no element")
                                                 : cmpBool(el.isSelected(), expected);
        case "checked":        return el == null ? result(false, "no element")
                                                 : cmpBool(isCheckedUniversal(el), expected);
        case "text":           return cmp(txt, expected);
        case "text_contains":  return contains(txt, expected);
        case "text_not_empty": return cmpBool(!txt.isEmpty(), expected);
        case "text_empty":     return cmpBool(txt.isEmpty(), expected);
        case "value":          return cmp(safeAttr(el, "value"), expected);
        case "value_not_empty":return cmpBool(!safeAttr(el, "value").isEmpty(), expected);
        case "placeholder":    return cmp(safeAttr(el, "placeholder"), expected);
        case "class_contains": return contains(safeAttr(el, "class"), expected);
        case "style_contains": return contains(safeAttr(el, "style"), expected);
        case "attribute":      return kv(expected, el, false, false);
        case "aria":           return kv(expected, el, false, false);
        case "css":            return kv(expected, el, true,  true);
        case "css_contains":   return kv(expected, el, true,  false);
        case "url_contains":   return contains(
            DriverManagerThreadSafe.getDriver().getCurrentUrl(), expected);
        default:               return result(false, "unknown check type");
    }
}

// =================== Public entry point ===================

public ValidationResult validateElementOnScreen(
        String field, String screenName,
        java.util.Map<String, String> validations) {

    ValidationResult res = new ValidationResult();
    String locator = this.genGetLocator(field, screenName)[1];

    java.util.List<WebElement> elements;
    try {
        elements = DriverManagerThreadSafe.getDriver()
                   .findElements(By.xpath(locator));
    } catch (Exception e) {
        elements = new java.util.ArrayList<>();
    }
    WebElement first = elements.isEmpty() ? null : elements.get(0);

    for (java.util.Map.Entry<String, String> v : validations.entrySet()) {
        String type = v.getKey().trim().toLowerCase();
        String[] r;
        try {
            r = check(type, v.getValue(), first, elements);
        } catch (Exception e) {
            r = new String[] { "false", "exception: " + e.getMessage() };
        }
        boolean ok = "true".equals(r[0]);
        String msg = (ok ? "[PASS] " : "[FAIL] ") + field + "." + type +
                     " | expected=" + v.getValue() + " | actual=" + r[1];
        res.messages.add(msg);
        logger.info(msg);
        htmlReporterWebClassInstance.reportStep(
            "Validate " + field + "." + type, msg, ok ? "Pass" : "Fail");
        if (ok) res.passedCount++;
        else { res.failedCount++; res.passed = false; }
    }
    return res;
}
```

### 2. Step definitions — paste into `StepDefinition.java`

```java
import io.cucumber.datatable.DataTable;
import java.util.Map;

/**
 * StepDef to validate multiple properties of an element in one step.
 */
@Then("^I verify \"(.*?)\" on \"(.*?)\" screen has:$")
public void i_verify_on_screen_has(
        String field, String screenName,
        DataTable dataTable) throws Throwable {

    Map<String, String> validations =
        dataTable.asMap(String.class, String.class);

    StepDefinitionHelperWeb.ValidationResult r =
        stepDefinitionHelperWebClassInstance
            .validateElementOnScreen(field, screenName, validations);

    if (!r.passed) {
        throw new AssertionError(
            "Validation failed: " + r.failedCount + " of " +
            (r.passedCount + r.failedCount) + " checks failed for " +
            field + " on " + screenName
        );
    }
}

/**
 * Single-check shortcut (no DataTable needed).
 */
@Then("^I verify \"(.*?)\" on \"(.*?)\" screen \"(.*?)\" is \"(.*?)\"$")
public void i_verify_single_check(
        String field, String screenName,
        String checkType, String expected) throws Throwable {

    java.util.Map<String, String> v = new java.util.HashMap<>();
    v.put(checkType, expected);

    StepDefinitionHelperWeb.ValidationResult r =
        stepDefinitionHelperWebClassInstance
            .validateElementOnScreen(field, screenName, v);

    if (!r.passed) {
        throw new AssertionError(
            checkType + " check failed for " + field
        );
    }
}
```

---

## Usage

### Multiple validations (DataTable)

```gherkin
Then I verify "input_AccountName" on "AccountPage" screen has:
  | text           | Acme Corp                |
  | enabled        | true                     |
  | visible        | true                     |
  | attribute      | data-label=Account Name  |
  | class_contains | slds-input               |
```

### Single validation (shortcut)

```gherkin
Then I verify "btn_Save" on "EditPage" screen "enabled" is "true"
Then I verify "lbl_Status" on "DetailPage" screen "text" is "Active"
Then I verify "btn_Delete" on "DetailPage" screen "not_exists" is "true"
Then I verify "input_Email" on "EditPage" screen "value" is "test@desco.com"
```

### Real-world example

```gherkin
Scenario: Verify account is created correctly

  When I click "btn_Save" on "EditPage" screen
  And I wait for ".2" mins

  Then I verify "input_AccountName" on "DetailPage" screen has:
    | text           | Acme Corporation     |
    | enabled        | true                 |
    | attribute      | readonly=true        |

  Then I verify "lbl_RecordType" on "DetailPage" screen has:
    | text           | Customer - Direct    |
    | visible        | true                 |

  Then I verify "btn_Delete" on "DetailPage" screen "exists" is "true"
  Then I verify "current page" on "DetailPage" screen "url_contains" is "/lightning/r/Account/"
```

---

## What the HTML report shows

Each check generates its own report line:

```
[PASS] input_AccountName.text | expected=Acme Corp | actual=Acme Corp
[PASS] input_AccountName.enabled | expected=true | actual=true
[FAIL] input_AccountName.attribute | expected=readonly=true | actual=false
[PASS] input_AccountName.class_contains | expected=slds-input | actual=slds-input slds-input_bare
```

The step **fails at the end** if any check failed, but you see ALL passing/failing checks first.

---

## Why this design

| Feature | Benefit |
|---|---|
| **One method, infinite checks** | No new helper for every assertion type |
| **Collect-all-then-fail** | See all failures in one run, not one at a time |
| **Easy to extend** | Adding a check type = one `case` block |
| **Uses existing pattern** | Same `genGetLocator()`, same reporting style |
| **Works with `##` placeholders** | Parameterized XPaths work the same way |
| **DataTable + shortcut** | Use DataTable for multiple, shortcut for one |

---

## Extending — adding a new check type

To add `regex_match`:

```java
case "regex_match":
    actual = first == null ? "no element" : first.getText().trim();
    ok = actual.matches(expected);
    break;
```

That's it. Now you can use:

```gherkin
| regex_match | ^[A-Z]{3}-\d{4}$ |
```

---

## Common patterns

### Verify a form section
```gherkin
Then I verify "section_AccountInfo" on "EditPage" screen has:
  | visible    | true                          |
  | text_contains | Account Information        |
```

### Verify a record was saved
```gherkin
Then I verify "current page" on "DetailPage" screen has:
  | url_contains  | /lightning/r/Account/      |
Then I verify "toast_Success" on "DetailPage" screen has:
  | exists        | true                       |
  | text_contains | was created                |
```

### Verify a field is required
```gherkin
Then I verify "input_Email" on "EditPage" screen has:
  | attribute     | required=true              |
  | attribute     | aria-required=true         |
```

### Verify a button state
```gherkin
Then I verify "btn_Save" on "EditPage" screen has:
  | enabled    | true                          |
  | visible    | true                          |
  | text       | Save                          |
```

### Verify no errors are showing
```gherkin
Then I verify "error_Banner" on "EditPage" screen has:
  | not_exists | true                          |
```

### Verify checkbox state (works for native + Lightning + aria)
```gherkin
Then I verify "chk_SendEmail" on "EditPage" screen has:
  | checked    | true                          |
  | visible    | true                          |

# Single shortcut form
Then I verify "chk_Active" on "EditPage" screen "checked" is "false"
```

### Verify field color (validation error styling)
```gherkin
Then I verify "input_Email" on "EditPage" screen has:
  | css        | border-color=red              |
  | css        | color=rgb(194, 57, 52)        |

# Using contains (partial match for color components)
Then I verify "input_Email" on "EditPage" screen "css_contains" is "color=255"

# Using inline style
Then I verify "lbl_Error" on "EditPage" screen "style_contains" is "color:red"
```

### Verify aria attribute (accessibility states)
```gherkin
Then I verify "btn_Toggle" on "SettingsPage" screen has:
  | aria       | aria-pressed=true             |
  | aria       | aria-expanded=false           |
  | aria       | aria-disabled=false           |
```

### Verify highlighted/active state via class
```gherkin
Then I verify "tab_Details" on "RecordPage" screen has:
  | class_contains | slds-is-active            |
  | aria           | aria-selected=true        |
```
