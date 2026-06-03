import esbuild from 'rollup-plugin-esbuild';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/main.ts',
  output: {
    file: 'main.js',
    format: 'cjs',
    sourcemap: 'inline'
  },
  external: ['obsidian'],
  plugins: [
    esbuild(),
    nodeResolve({ browser: true }),
    commonjs()
  ]
};
