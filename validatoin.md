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

/**
 * Validate any number of properties on a single element/locator.
 * Collects ALL results, doesn't fail-fast.
 *
 * @param field        objectId from your XML
 * @param screenName   screen ID from your XML
 * @param validations  Map of check_type -> expected_value
 */
public ValidationResult validateElementOnScreen(
        String field, String screenName,
        java.util.Map<String, String> validations) {

    ValidationResult result = new ValidationResult();
    String[] objectPropertyArray = this.genGetLocator(field, screenName);
    String locatorValue = objectPropertyArray[1];

    java.util.List<WebElement> elements = new java.util.ArrayList<>();
    try {
        elements = DriverManagerThreadSafe.getDriver()
                .findElements(By.xpath(locatorValue));
    } catch (Exception e) {
        logger.info("findElements threw: " + e.getMessage());
    }

    WebElement first = elements.isEmpty() ? null : elements.get(0);

    for (java.util.Map.Entry<String, String> v : validations.entrySet()) {
        String type = v.getKey().trim().toLowerCase();
        String expected = v.getValue() == null ? "" : v.getValue().trim();
        boolean ok = false;
        String actual = "";
        String label = field + "." + type;

        try {
            switch (type) {
                case "exists":
                    ok = !elements.isEmpty() ==
                         Boolean.parseBoolean(expected);
                    actual = String.valueOf(!elements.isEmpty());
                    break;

                case "not_exists":
                    ok = elements.isEmpty() ==
                         Boolean.parseBoolean(expected);
                    actual = String.valueOf(elements.isEmpty());
                    break;

                case "count":
                    actual = String.valueOf(elements.size());
                    ok = actual.equals(expected);
                    break;

                case "visible":
                    ok = first != null && first.isDisplayed() ==
                         Boolean.parseBoolean(expected);
                    actual = first == null ? "no element"
                           : String.valueOf(first.isDisplayed());
                    break;

                case "enabled":
                    ok = first != null && first.isEnabled() ==
                         Boolean.parseBoolean(expected);
                    actual = first == null ? "no element"
                           : String.valueOf(first.isEnabled());
                    break;

                case "selected":
                    ok = first != null && first.isSelected() ==
                         Boolean.parseBoolean(expected);
                    actual = first == null ? "no element"
                           : String.valueOf(first.isSelected());
                    break;

                case "text":
                    actual = first == null ? "no element"
                           : first.getText().trim();
                    ok = actual.equals(expected);
                    break;

                case "text_contains":
                    actual = first == null ? "no element"
                           : first.getText().trim();
                    ok = actual.contains(expected);
                    break;

                case "value":
                    actual = first == null ? "no element"
                           : (first.getAttribute("value") == null
                                ? "" : first.getAttribute("value"));
                    ok = actual.equals(expected);
                    break;

                case "placeholder":
                    actual = first == null ? "no element"
                           : (first.getAttribute("placeholder") == null
                                ? "" : first.getAttribute("placeholder"));
                    ok = actual.equals(expected);
                    break;

                case "attribute":
                    // expected format: "attr=value"
                    int eq = expected.indexOf('=');
                    if (eq > 0 && first != null) {
                        String attrName = expected.substring(0, eq);
                        String attrExpected = expected.substring(eq + 1);
                        actual = first.getAttribute(attrName) == null
                               ? "" : first.getAttribute(attrName);
                        ok = actual.equals(attrExpected);
                    } else {
                        actual = "invalid format (use attr=value)";
                        ok = false;
                    }
                    break;

                case "class_contains":
                    actual = first == null ? "no element"
                           : (first.getAttribute("class") == null
                                ? "" : first.getAttribute("class"));
                    ok = actual.contains(expected);
                    break;

                case "url_contains":
                    actual = DriverManagerThreadSafe.getDriver()
                             .getCurrentUrl();
                    ok = actual.contains(expected);
                    break;

                default:
                    actual = "unknown check type";
                    ok = false;
            }
        } catch (Exception e) {
            actual = "exception: " + e.getMessage();
            ok = false;
        }

        String msg = (ok ? "[PASS] " : "[FAIL] ")
                + label + " | expected=" + expected
                + " | actual=" + actual;

        result.messages.add(msg);
        logger.info(msg);
        htmlReporterWebClassInstance.reportStep(
            "Validate " + label,
            msg,
            ok ? "Pass" : "Fail"
        );

        if (ok) result.passedCount++;
        else { result.failedCount++; result.passed = false; }
    }

    return result;
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
