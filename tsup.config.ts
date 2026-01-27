import { defineConfig } from 'tsup';
import { sassPlugin } from 'esbuild-sass-plugin';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    visualization: 'src/visualization.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    // plotly is external - only required for visualization entry point
    'react-plotly.js',
    'plotly.js-basic-dist-min',
  ],
  treeshake: true,
  minify: false,
  esbuildPlugins: [
    sassPlugin({
      type: 'style',
    }),
  ],
});
