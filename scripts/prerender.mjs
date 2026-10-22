// Fills dist/index.html with the server-rendered page and FAQ structured data.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const { render, FAQ } = await import(pathToFileURL(path.join(root, 'dist-ssr/entry-server.js')).href)

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}

const file = path.join(root, 'dist/index.html')
const html = fs.readFileSync(file, 'utf8')
if (!html.includes('<!--app-html-->')) throw new Error('index.html is missing the <!--app-html--> placeholder')
fs.writeFileSync(
  file,
  html
    .replace('<!--app-html-->', render())
    .replace('<!--faq-ld-->', `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>`),
)
fs.rmSync(path.join(root, 'dist-ssr'), { recursive: true, force: true })
console.log('Pre-rendered dist/index.html')
