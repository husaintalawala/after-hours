import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cityContext, guideCaption } from './daybreakPresentation.ts'

test('city confirmation retains region and country for ambiguous city names', () => {
  assert.equal(cityContext('London', 'London, Ontario, Canada'), 'Ontario, Canada')
  assert.equal(cityContext('London', 'England, United Kingdom'), 'England, United Kingdom')
  assert.equal(cityContext('  Paris ', 'PARIS, Île-de-France, France'), 'Île-de-France, France')
  assert.equal(cityContext('Tokyo', null), '')
})
test('trip caption uses editorial text and falls back to real stops', () => {
  assert.equal(guideCaption({ blurb: '  An actual guide description.  ', shapeLine: 'A · B' }), 'An actual guide description.')
  assert.equal(guideCaption({ blurb: ' ', shapeLine: 'A · B' }), 'A · B')
})
