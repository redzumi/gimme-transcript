import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      '**/.git',
      '**/.DS_Store',
      '**/*.svg',
      '**/*.png',
      '**/*.ico',
      '**/*.icns',
      'docs/branding/**',
      'resources/**',
      'build/**',
      'package-lock.json',
      'yarn.lock'
    ]
  },
  tseslint.configs.recommended,
  {
    files: ['src/main/**/*.{ts,tsx}', 'src/preload/**/*.{ts,tsx}', 'scripts/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    ...eslintPluginReact.configs.flat.recommended,
    ...eslintPluginReact.configs.flat['jsx-runtime'],
    settings: {
      react: {
        version: 'detect'
      }
    },
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
