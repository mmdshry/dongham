import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://dongham.ir',
  compressHTML: true,
  build: {
    inlineStylesheets: 'always',
  },
});
