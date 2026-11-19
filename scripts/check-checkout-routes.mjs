import {readdir} from 'node:fs/promises'
import {resolve, relative, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

export const requiredRoutes = [
 'app/v1/prepaid/quotes/route.ts',
 'app/v1/prepaid/quotes/[id]/route.ts',
 'app/v1/prepaid/quotes/[id]/reserve/route.ts',
 'app/v1/prepaid/quotes/[id]/release/route.ts',
 'app/v1/prepaid/orders/route.ts',
 'app/v1/orders/[id]/route.ts',
 'app/api/internal/checkout-funding/route.ts',
]

export function checkRoutePaths(paths) {
 const errors = []
 for (const path of paths) {
  if (path.split('/').some(part => part !== part.trim() || part.endsWith('.') || /[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/u.test(part))) {
   errors.push(`Invalid route path ${JSON.stringify(path)}: remove surrounding whitespace, trailing dots or invisible characters.`)
  }
 }
 const available = new Set(paths)
 for (const path of requiredRoutes) {
  if (!available.has(path)) errors.push(`Required checkout route missing: ${path}`)
 }
 return errors
}

async function appFiles(root, directory = resolve(root, 'app')) {
 const paths = []
 for (const entry of await readdir(directory, {withFileTypes:true})) {
  const full = resolve(directory, entry.name)
  if (entry.isDirectory()) paths.push(...await appFiles(root, full))
  else paths.push(relative(root, full).split(sep).join('/'))
 }
 return paths
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 try {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const errors = checkRoutePaths(await appFiles(root))
  if (errors.length) {
   console.error('Checkout route checks failed:\n' + errors.join('\n'))
   process.exitCode = 1
  } else console.log(`Checkout route checks passed (${requiredRoutes.length} required routes).`)
 } catch (error) {
  console.error('Could not verify checkout routes:', error.message)
  process.exitCode = 1
 }
}
