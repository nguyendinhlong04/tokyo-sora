import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      '**/coverage/**',
      'designs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Script Node thuần (extract-seed, fetch-fonts, config…)
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/**/src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    rules: {
      // Token discipline: màu chỉ được khai báo trong packages/tokens — cấm hex thô
      // và giá trị tuỳ ý kiểu bg-[#...] trong code ứng dụng.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message: 'Không dùng màu tuỳ ý (bg-[#…]) — dùng token từ @sora/tokens.',
        },
        {
          selector: "TemplateElement[value.raw=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message: 'Không dùng màu tuỳ ý (bg-[#…]) — dùng token từ @sora/tokens.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Cấm dangerouslySetInnerHTML — ghi chú khách và nội dung động phải render dạng text.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Lớp token là nơi duy nhất được phép chứa hex
    files: ['packages/tokens/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
