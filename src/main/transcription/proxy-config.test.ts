import { expect, it } from 'vitest'
import { normalizeProviderProxy } from './proxy-config'

it.each([
  ['', ''],
  ['  ', ''],
  [' http://localhost:8080/ ', 'http://localhost:8080'],
  ['http://localhost', 'http://localhost:80'],
  ['https://proxy.example', 'https://proxy.example:443'],
  ['socks4://localhost', 'socks4://localhost:1080'],
  ['socks5://localhost:1081', 'socks5://localhost:1081'],
  ['http://[::1]:8080', 'http://[::1]:8080'],
  ['http://user:secret@proxy:8080', 'http://user:secret@proxy:8080'],
  ['https://u%40ser:p%3Ass@proxy', 'https://u%40ser:p%3Ass@proxy:443']
])('normalizes proxy %s', (input, expected) => {
  expect(normalizeProviderProxy(input)).toBe(expected)
})

it.each([
  'localhost:8080',
  'ftp://proxy:21',
  'socks5://user:secret@proxy:1080',
  'http://user:%ZZ@proxy:8080',
  'http://proxy:0',
  'http://proxy:65536',
  'socks5://proxy:65536',
  'http://proxy/path',
  'http://proxy?query=yes',
  'http://proxy#hash',
  'http://proxy,direct',
  'socks5://proxy;direct',
  'http://'
])('rejects invalid or unsupported proxy %s', (input) => {
  expect(() => normalizeProviderProxy(input)).toThrow()
})
