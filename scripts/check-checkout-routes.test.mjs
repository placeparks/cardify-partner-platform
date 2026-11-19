import test from 'node:test'
import assert from 'node:assert/strict'
import {checkRoutePaths, requiredRoutes} from './check-checkout-routes.mjs'

test('valid checkout routes and dynamic parameters pass', () => {
 assert.deepEqual(checkRoutePaths([...requiredRoutes, 'app/v1/carts/[id]/route.ts']), [])
})

test('the original reserve/release folder mistake blocks a build', () => {
 const broken = requiredRoutes.map(path => path.replace('/reserve/', '/reserve /').replace('/release/', '/release /'))
 const errors = checkRoutePaths(broken)
 assert.equal(errors.filter(message => message.startsWith('Invalid route path')).length, 2)
 assert.equal(errors.filter(message => message.startsWith('Required checkout route missing')).length, 2)
})

test('extra malformed routes are rejected even when valid routes also exist', () => {
 for (const folder of ['reserve ', ' reserve', 'reserve.', 'reserve\u00a0', 'reserve\u200b', 'reserve\t']) {
  assert.ok(checkRoutePaths([...requiredRoutes, `app/v1/prepaid/quotes/[id]/${folder}/route.ts`]).some(message => message.startsWith('Invalid route path')))
 }
})

test('each required checkout route must be present', () => {
 for (const missing of requiredRoutes) {
  assert.deepEqual(checkRoutePaths(requiredRoutes.filter(path => path !== missing)), [`Required checkout route missing: ${missing}`])
 }
})
