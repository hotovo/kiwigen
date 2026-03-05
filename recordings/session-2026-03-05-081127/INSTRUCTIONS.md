# KiwiGen - Session Bundle Instructions

## Overview
KiwiGen session bundles are framework-agnostic recordings of browser interactions with voice commentary. Each bundle contains all data needed to generate automated tests.

## Bundle Structure
- **INSTRUCTIONS.md** (this file) - How to process session bundles
- **actions.json** - Complete session data (metadata, actions, narrative)
- **screenshots/** - Visual captures referenced in actions

## How to Process Session Bundles

### 1. Read actions.json
The file contains:
- `_meta`: Session metadata (id, timestamps, URL, totals)
- `narrative`: Voice commentary with embedded action references
- `actions`: Array of recorded actions with locators

### 2. Parse Action References
Narrative contains references: `[action:SHORT_ID:TYPE]`
- `SHORT_ID`: First 8 chars of action UUID
- `TYPE`: Action type (click, fill, assert, navigate, screenshot)
- Example: `[action:8c61934e:click]` → find `"id": "8c61934e-4cd3-..."`

### 3. Choose Locator Strategies
Each action provides multiple locators with confidence levels:
- **testId** (high): `data-testid` attributes - most stable
- **text** (high/medium): Element text - good for buttons/links
- **placeholder** (high/medium): Input placeholders - best for inputs
- **role** (high/medium): ARIA role + name - semantic
- **css** (medium/low): CSS selectors - brittle
- **xpath** (low): XPath - last resort

**Priority**: testId > text/placeholder/role > css > xpath

### 4. Interpret Action Types
- **navigate**: URL change or page load
- **click**: User click interaction
- **fill**: Text input to form fields
- **assert**: Element visibility check (for verification)
- **screenshot**: Manual capture (see screenshots/ folder)
- **keypress**: Keyboard input
- **select**: Dropdown selection
- **check**: Checkbox/radio interaction
- **scroll**: Page scroll

### 5. Use Voice Commentary
The narrative provides:
- User intent (why actions were performed)
- Expected outcomes (what should happen)
- Test organization hints
- Business context

## Framework-Specific Implementation

### Detecting Framework

#### Playwright Project
Check for these files in repository root:
- `playwright.config.ts` or `playwright.config.js`
- `package.json` with `@playwright/test` dependency

#### Cypress Project
Check for these files in repository root:
- `cypress.config.ts` or `cypress.config.js`
- `cypress/` directory
- `package.json` with `cypress` dependency

### Playwright Implementation Guide

**Test Structure**:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Generated from session-YYYY-MM-DD-HHMMSS', () => {
  test('test description from voice commentary', async ({ page }) => {
    // Navigate to start URL
    await page.goto('START_URL')
    
    // Use locators from actions.json
    await page.click('[data-testid="button-id"]')
    await page.fill('[data-testid="input-id"]', 'value')
    
    // Assertions from assert actions
    await expect(page.locator('[data-testid="element"]')).toBeVisible()
  })
})
```

**Locator Mapping**:
- testId → `page.getByTestId('value')`
- text → `page.getByText('value')`
- placeholder → `page.getByPlaceholder('value')`
- role → `page.getByRole('button', { name: 'value' })`
- css → `page.locator('css')`
- xpath → `page.locator('xpath=//...')`

**Best Practices**:
1. Use testId locators when available (confidence: high)
2. Prefer semantic locators (getByRole, getByText)
3. Group related actions into logical test steps
4. Use voice commentary for test descriptions and comments
5. Add assertions based on 'assert' type actions
6. Consider page object pattern for complex tests

### Cypress Implementation Guide

**Test Structure**:
```typescript
describe('Generated from session-YYYY-MM-DD-HHMMSS', () => {
  it('test description from voice commentary', () => {
    // Navigate to start URL
    cy.visit('START_URL')
    
    // Use locators from actions.json
    cy.get('[data-testid="button-id"]').click()
    cy.get('[data-testid="input-id"]').type('value')
    
    // Assertions from assert actions
    cy.get('[data-testid="element"]').should('be.visible')
  })
})
```

**Locator Mapping**:
- testId → `cy.get('[data-testid="value"]')`
- text → `cy.contains('value')`
- placeholder → `cy.get('[placeholder="value"]')`
- role → `cy.get('[role="button"]').contains('value')`
- css → `cy.get('css')`
- xpath → `cy.xpath('//...')` (requires cypress-xpath plugin)

**Best Practices**:
1. Prefer data-testid attributes for stability
2. Use `.contains()` for text-based selection
3. Chain commands logically based on narrative flow
4. Use `.should()` assertions for verify actions
5. Add custom commands for repeated patterns
6. Consider page object pattern for complex tests

### Empty Repository (No Framework)

If no framework is detected:
1. **Recommend framework** based on project language/structure
2. **Provide setup instructions** for chosen framework
3. **Generate standard test file** with framework config
4. **Include locator data** in comments for manual implementation

---

## Format Version
**Version**: 2.0  
**Generated By**: KiwiGen  
**Compatible With**: Any test automation framework
