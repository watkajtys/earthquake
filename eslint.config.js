import js from '@eslint/js'
import jsdoc from 'eslint-plugin-jsdoc'
import globals from 'globals'
import jsxA11y from "eslint-plugin-jsx-a11y"; // Import the plugin
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import vitest from 'eslint-plugin-vitest'

export default [
  { ignores: ['dist', 'docs/jsdoc', '.wrangler'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y, // Add the plugin
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      jsdoc,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Recommended rules from eslint-plugin-jsx-a11y
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsdoc.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
    },
  },
  {
    files: ['**/*.test.{js,jsx}'],
    plugins: {
      vitest,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitest.environments.env.globals,
      }
    },
    rules: {
      ...vitest.configs.recommended.rules,
    }
  }
]
